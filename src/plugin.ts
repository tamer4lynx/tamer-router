import fs from 'fs'
import path from 'path'
import { createRequire } from 'node:module'
import type { RsbuildPlugin } from '@rsbuild/core'
import chokidar from 'chokidar'

export interface TamerRouterPluginOptions {
  root: string
  output?: string
  srcAlias?: string
  layoutFilename?: string
  globalStyleImports?: string[]
}

export const DEFAULT_TAMER_ROUTER_OUTPUT = 'node_modules/.tamer-router/_generated_routes.tsx'

function resolveOutputPath(output: string | undefined): string {
  const trimmed = output?.trim()
  return trimmed ? trimmed : DEFAULT_TAMER_ROUTER_OUTPUT
}

type RouteNode = ScreenRouteNode | LayoutRouteNode

interface BaseRouteNode {
  importPath: string
  routeId: string
}

interface ScreenRouteNode extends BaseRouteNode {
  kind: 'screen'
  path: string
}

interface LayoutRouteNode extends BaseRouteNode {
  kind: 'layout'
  path: string
  children: RouteNode[]
}

interface ScanResult {
  rootLayoutImportPath?: string
  children: RouteNode[]
}

const validExtensions = ['.tsx', '.jsx', '.ts', '.js']

function isRouteFile(entry: string): boolean {
  return validExtensions.includes(path.extname(entry))
}

function toTanStackSegment(segment: string): string {
  if (segment.startsWith('[') && segment.endsWith(']')) return `$${segment.slice(1, -1)}`
  return segment
}

function joinRouteSegments(segments: string[]): string {
  return segments.filter(Boolean).join('/')
}

function createRouteId(segments: string[], fileName: string): string {
  if (fileName === 'index') {
    if (segments.length === 0) return '/'
    return `/${segments.join('/')}/`
  }
  return `/${[...segments, fileName].filter(Boolean).join('/')}`
}

function createLayoutId(segments: string[]): string {
  if (segments.length === 0) return '__root_layout__'
  return `/${segments.join('/')}/_layout`
}

function formatImportPath(filePath: string, outputDir: string): string {
  const rel = path.relative(outputDir, filePath).replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, '')
  const base = rel.startsWith('.') ? rel : './' + rel
  return `${base}.js`
}

function formatAssetImportPath(filePath: string, outputDir: string): string {
  const rel = path.relative(outputDir, filePath).replace(/\\/g, '/')
  return rel.startsWith('.') ? rel : './' + rel
}

function buildRouteNodes(
  dir: string,
  options: { layoutFilename: string; outputDir: string },
  fullSegments: string[] = [],
  parentRouteSegments: string[] = [],
): ScanResult {
  const entries = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b))
  const childRoutes: RouteNode[] = []
  let layoutImportPath: string | undefined

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isFile() && entry === options.layoutFilename) {
      layoutImportPath = formatImportPath(fullPath, options.outputDir)
    }
  }
  return `/${[...segments, fileName].filter(Boolean).join('/')}`
}

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      const nestedSegments = [...fullSegments, toTanStackSegment(entry)]
      const nextParentSegments = layoutImportPath ? nestedSegments : parentRouteSegments
      const nested = buildRouteNodes(fullPath, options, nestedSegments, nextParentSegments)

      if (nested.rootLayoutImportPath) {
        childRoutes.push({
          kind: 'layout',
          importPath: nested.rootLayoutImportPath,
          routeId: createLayoutId(nestedSegments),
          path: joinRouteSegments(nestedSegments.slice(parentRouteSegments.length)),
          children: nested.children,
        })
        continue
      }

      childRoutes.push(...nested.children)
      continue
    }

    if (!stat.isFile() || !isRouteFile(entry) || entry === options.layoutFilename) continue

    const ext = path.extname(entry)
    const name = path.basename(entry, ext)
    const routeSegments = name === 'index'
      ? fullSegments
      : [...fullSegments, toTanStackSegment(name)]
    const relativeSegments = routeSegments.slice(parentRouteSegments.length)

    childRoutes.push({
      kind: 'screen',
      importPath: formatImportPath(fullPath, options.outputDir),
      routeId: createRouteId(fullSegments, name === 'index' ? 'index' : toTanStackSegment(name)),
      path: name === 'index' ? '/' : joinRouteSegments(relativeSegments),
    })
  }

  if (layoutImportPath) {
    return {
      rootLayoutImportPath: layoutImportPath,
      children: childRoutes,
    }
  }

  return { children: childRoutes }
}

function toIdentifier(prefix: string, routeId: string): string {
  const safe = routeId.replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  const parts = (safe.length === 0 ? ['root'] : safe.split(/\s+/)).map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  return `${prefix}${parts.join('')}`
}

function generateRouteFile(
  result: ScanResult,
  outputDir: string,
  projectRoot: string,
  globalStyleImports: string[],
): string {
  const routeImports: string[] = []
  const styleImports = globalStyleImports.map((stylePath) => {
    const absolute = path.resolve(projectRoot, stylePath)
    return `import '${formatAssetImportPath(absolute, outputDir)}';`
  })

  const statements: string[] = []
  let componentCounter = 0
  let routeCounter = 0

  function nextComponentVar() {
    componentCounter += 1
    return `RouteComponent${componentCounter}`
  }

  function importComponent(importPath: string): string {
    const varName = nextComponentVar()
    routeImports.push(`import ${varName} from '${importPath}';`)
    return varName
  }

  const rootComponentVar = result.rootLayoutImportPath ? importComponent(result.rootLayoutImportPath) : 'DefaultRootRoute'

  function emitNode(node: RouteNode, parentVar: string): string {
    const componentVar = importComponent(node.importPath)
    const routeVar = toIdentifier('Route', `${routeCounter++}-${node.routeId}`)
    const props = [
      `getParentRoute: () => ${parentVar}`,
      `path: ${JSON.stringify(node.path)}`,
      `component: ${componentVar}`,
    ]
    statements.push(`const ${routeVar} = createRoute({\n  ${props.join(',\n  ')}\n})`)
    if (node.kind === 'layout') {
      const childVars = node.children.map((child) => emitNode(child, routeVar))
      return `${routeVar}.addChildren([${childVars.join(', ')}])`
    }
    return routeVar
  }

  const childExpressions = result.children.map((child) => emitNode(child, 'rootRoute'))

  return `/* eslint-disable */
// @ts-nocheck

${styleImports.join('\n')}
${routeImports.join('\n')}
import React from 'react'
import {
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

function DefaultRootRoute() {
  return React.createElement(Outlet)
}

const rootRoute = createRootRoute({
  component: ${rootComponentVar},
})
${statements.join('\n')}

export const routeTree = rootRoute.addChildren([${childExpressions.join(', ')}])

export function createGeneratedRouter() {
  const history = createMemoryHistory({
    initialEntries: ['/'],
  })

  return createRouter({
    routeTree,
    history,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createGeneratedRouter>
  }
}

export default routeTree
`
}

function resolveCompatReact(projectRoot: string): string | null {
  try {
    const requireFromProject = createRequire(path.join(projectRoot, 'package.json'))
    return requireFromProject.resolve('@lynx-js/react/compat')
  } catch (_) {
    return null
  }
}

export const GENERATED_ROUTES_IMPORT = '@tamer4lynx/tamer-router/generated-routes'

export function tamerRouterPlugin({
  root,
  output,
  srcAlias = '',
  layoutFilename = '_layout.tsx',
  globalStyleImports = [],
}: TamerRouterPluginOptions): RsbuildPlugin {
  return {
    name: 'tamer-router-plugin',
    async setup(api) {
      const projectRoot = (api.context as { rootPath?: string }).rootPath ?? process.cwd()
      const outputPath = resolveOutputPath(output)
      const resolvedOutput = path.resolve(projectRoot, outputPath)
      const resolvedRoot = path.resolve(projectRoot, root)

      function generate() {
        const outputDir = path.dirname(resolvedOutput)
        const routes = buildRouteNodes(resolvedRoot, {
          layoutFilename,
          outputDir,
        })
        const content = generateRouteFile(routes, outputDir, projectRoot, globalStyleImports)
        fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true })
        fs.writeFileSync(resolvedOutput, content, 'utf-8')
        console.info(`[tamer-router] Routes generated at: ${outputPath}`)
      }

      generate()

      api.modifyRsbuildConfig((config) => {
        const compatReact = resolveCompatReact(projectRoot)
        config.resolve = config.resolve || {}
        config.resolve.alias = {
          ...config.resolve.alias,
          ...(compatReact ? { react$: compatReact } : {}),
          [GENERATED_ROUTES_IMPORT]: resolvedOutput,
          [GENERATED_ROUTES_IMPORT + '$']: resolvedOutput,
        }
        return config
      })

      const watcher = chokidar.watch(resolvedRoot, {
        ignored: [/(^|[\/\\])\./, '**/node_modules/**', resolvedOutput],
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
    },
  }
}
