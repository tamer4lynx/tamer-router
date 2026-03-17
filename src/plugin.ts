import fs from 'fs'
import path from 'path'
import type { RsbuildPlugin } from '@rsbuild/core'
import chokidar from 'chokidar'

export interface TamerRouterPluginOptions {
  root: string
  output: string
  srcAlias?: string
  layoutFilename?: string
}

interface RouteDefinition {
  index?: boolean
  errorElement?: string
  path?: string
  element?: string
  children?: RouteDefinition[]
}

const validExtensions = ['.tsx', '.jsx', '.ts', '.js']

function buildRouteDefinitions(
  dir: string,
  options: { layoutFilename: string; root: string; alias: string; outputDir: string },
  parentPath = ''
): RouteDefinition[] {
  const entries = fs.readdirSync(dir)
  const children: RouteDefinition[] = []
  let layoutFile: string | undefined

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isFile() && entry === options.layoutFilename) layoutFile = entry
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      const nestedRoutes = buildRouteDefinitions(
        fullPath,
        options,
        path.posix.join(parentPath, entry)
      )
      if (
        nestedRoutes.length > 0 ||
        nestedRoutes.some((r) => r.index) ||
        nestedRoutes.some((r) => r.element)
      ) {
        children.push(...nestedRoutes)
      }
    } else if (stat.isFile()) {
      const ext = path.extname(entry)
      if (!validExtensions.includes(ext)) continue
      if (entry === options.layoutFilename) continue

      const name = path.basename(entry, ext)
      let routePath = ''
      if (name === 'index') routePath = ''
      else if (name.startsWith('[') && name.endsWith(']')) routePath = `:${name.slice(1, -1)}`
      else routePath = name

      children.push({
        index: name === 'index',
        path: routePath,
        element: formatImportPath(fullPath, options.outputDir),
      })
    }
  }

  if (layoutFile) {
    return [
      {
        path: parentPath ? path.basename(parentPath) : '/',
        element: formatImportPath(path.join(dir, layoutFile), options.outputDir),
        children,
      },
    ]
  }
  return children
}

function formatImportPath(filePath: string, outputDir: string): string {
  const rel = path.relative(outputDir, filePath).replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, '')
  const base = rel.startsWith('.') ? rel : './' + rel
  return base + '.js'
}

function generateRouteFile(routes: RouteDefinition[]): string {
  const imports: string[] = []
  let counter = 0

  const replaceElements = (nodes: RouteDefinition[]): (RouteDefinition & { element?: string })[] =>
    nodes.map((node) => {
      const newNode = { ...node } as RouteDefinition & { element?: string }
      if (node.element) {
        const varName = `RouteComp${counter++}`
        imports.push(`import ${varName} from '${node.element}';`)
        newNode.element = varName
      }
      if (node.children) newNode.children = replaceElements(node.children)
      if (newNode.path && newNode.path === path.basename(newNode.path)) newNode.path = newNode.path
      if (!newNode.path) delete newNode.path
      return newNode
    })

  const routeTree = replaceElements(routes)
  const routeJson = JSON.stringify(routeTree, null, 2).replace(
    /"element": "RouteComp(\d+)"/g,
    '"element": React.createElement(RouteComp$1)'
  )

  return `${imports.join('\n')}
import React from 'react';
import type { RouteObject } from 'react-router';

const routes: RouteObject[] = ${routeJson};

export default routes;
`
}

export const GENERATED_ROUTES_IMPORT = '@tamer4lynx/tamer-router/generated-routes'

export function tamerRouterPlugin({
  root,
  output,
  srcAlias = '',
  layoutFilename = '_layout.tsx',
}: TamerRouterPluginOptions): RsbuildPlugin {
  return {
    name: 'tamer-router-plugin',
    async setup(api) {
      const resolvedOutput = path.resolve(process.cwd(), output)
      api.modifyRsbuildConfig((config) => {
        config.resolve = config.resolve || {}
        config.resolve.alias = {
          ...config.resolve.alias,
          [GENERATED_ROUTES_IMPORT]: resolvedOutput,
          [GENERATED_ROUTES_IMPORT + '$']: resolvedOutput,
        }
        return config
      })

      api.onBeforeCreateCompiler(async () => {
        const resolvedRoot = path.resolve(process.cwd(), root)

        function generate() {
          const outputDir = path.dirname(resolvedOutput)
          const routes = buildRouteDefinitions(resolvedRoot, {
            layoutFilename,
            root: resolvedRoot,
            alias: srcAlias,
            outputDir,
          })
          const content = generateRouteFile(routes)
          fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true })
          fs.writeFileSync(resolvedOutput, content, 'utf-8')
          console.info(`[tamer-router] Routes generated at: ${output}`)
        }

        generate()

        const watcher = chokidar.watch(resolvedRoot, {
          ignored: [/(^|[\/\\])\../, '**/node_modules/**'],
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 500 },
        })

        const logChange = (type: string, filePath: string) => {
          console.log(`[tamer-router] ${type}: ${filePath}`)
          generate()
        }

        watcher
          .on('add', (filePath) => logChange('File added', filePath))
          .on('unlink', (filePath) => logChange('File removed', filePath))
          .on('addDir', (dirPath) => logChange('Directory added', dirPath))
          .on('unlinkDir', (dirPath) => logChange('Directory removed', dirPath))
          .on('error', (err) => console.error('[tamer-router] Watcher error:', err))
      })
    },
  }
}
