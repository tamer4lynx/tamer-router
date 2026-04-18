import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import chokidar from 'chokidar'
import type { RsbuildPlugin } from '@rsbuild/core'

type LayoutKind = 'slot' | 'stack' | 'tab' | 'rail'

interface PluginOptions {
  layoutFilename?: string
  output?: string
  root: string
  srcAlias?: string
}

interface ParsedScreenDeclaration {
  name: string
  path?: string
  options?: string
}

interface ParsedLayoutMetadata {
  kind: LayoutKind
  screens: ParsedScreenDeclaration[]
}

interface DirectoryNode {
  basePath: string
  children: DirectoryNode[]
  dirAbsolutePath: string
  dirName: string
  dirRelativePath: string
  id: string
  layout?: {
    absolutePath: string
    importName: string
    metadata: ParsedLayoutMetadata
  }
  pages: PageNode[]
}

interface PageNode {
  absolutePath: string
  importName: string
  name: string
  routePath: string
}

interface GeneratedLayoutRecord {
  basePath: string
  children: Array<{
    kind: 'page' | 'branch'
    name: string
    optionsSource?: string
    segmentPath: string
    targetPath: string
  }>
  id: string
  importName: string
  kind: LayoutKind
  screens: ParsedScreenDeclaration[]
}

interface GeneratedRouteRecord {
  childNameByLayoutId: Record<string, string>
  id: string
  importName: string
  layoutIds: string[]
  paramNames: string[]
  routePath: string
  score: number
}

const DEFAULT_OUTPUT = 'node_modules/.tamer-router/_generated_routes.tsx'
const ROUTE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

function isRouteSourceFile(filename: string, layoutFilename: string): boolean {
  if (!ROUTE_FILE_EXTENSIONS.has(path.extname(filename))) return false
  if (filename.endsWith('.d.ts')) return false
  return filename !== layoutFilename
}

function routeSegmentToPathPart(segment: string): string {
  return segment === 'index' ? '' : segment
}

function joinRoutePath(basePath: string, segment: string): string {
  const part = routeSegmentToPathPart(segment)
  if (!part) return basePath || '/'
  if (basePath === '/' || !basePath) return `/${part}`
  return `${basePath}/${part}`
}

function createLayoutId(relativeDirPath: string): string {
  return relativeDirPath ? `layout:${relativeDirPath}` : 'layout:/'
}

function createRouteId(relativeFilePath: string): string {
  return `route:${relativeFilePath.replace(/\.[^.]+$/, '')}`
}

function normalizeImportPath(fromFile: string, toFile: string): string {
  const relativePath = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, '/')
  const withoutExtension = relativePath.replace(/\.(tsx|ts|jsx|js)$/, '.js')
  return withoutExtension.startsWith('.') ? withoutExtension : `./${withoutExtension}`
}

function readSerializableExpression(node: ts.Expression): string | undefined {
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return node.getText()
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return JSON.stringify(node.text)
  }

  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const operand = readSerializableExpression(node.operand)
    return operand ? `-${operand}` : undefined
  }

  if (ts.isArrayLiteralExpression(node)) {
    const values = node.elements.map((element) => {
      if (!ts.isExpression(element)) return undefined
      return readSerializableExpression(element)
    })
    return values.every((value) => value !== undefined) ? `[${values.join(', ')}]` : undefined
  }

  if (ts.isObjectLiteralExpression(node)) {
    const properties: string[] = []
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) return undefined
      const name = getPropertyName(property.name)
      const value = readSerializableExpression(property.initializer)
      if (!name || value === undefined) return undefined
      properties.push(`${JSON.stringify(name)}: ${value}`)
    }
    return `{ ${properties.join(', ')} }`
  }

  return undefined
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return undefined
}

function jsxTagNameText(tagName: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(tagName)) return tagName.text
  if (ts.isPropertyAccessExpression(tagName)) {
    return `${tagName.expression.getText()}.${tagName.name.text}`
  }
  if (ts.isJsxNamespacedName(tagName)) {
    return `${tagName.namespace.text}:${tagName.name.text}`
  }
  return tagName.getText()
}

function parseLayoutMetadata(layoutAbsolutePath: string): ParsedLayoutMetadata {
  const sourceText = fs.readFileSync(layoutAbsolutePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    layoutAbsolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  let kind: LayoutKind = 'slot'
  const screens: ParsedScreenDeclaration[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = jsxTagNameText(node.tagName)
      if (tagName === 'Stack') kind = 'stack'
      if (tagName === 'Tab' || tagName === 'Tabs') kind = 'tab'
      if (tagName === 'Rail') kind = 'rail'
      if (tagName === 'Slot' && kind === 'slot') kind = 'slot'

      if (
        tagName === 'Stack.Screen' ||
        tagName === 'Tabs.Screen' ||
        tagName === 'Tab.Screen' ||
        tagName === 'Rail.Screen'
      ) {
        const record: ParsedScreenDeclaration = { name: '' }
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute) || !attribute.name) continue
          const attributeName = ts.isIdentifier(attribute.name)
            ? attribute.name.text
            : attribute.name.name.text
          if (!attribute.initializer) continue
          if (ts.isStringLiteral(attribute.initializer)) {
            if (attributeName === 'name') record.name = attribute.initializer.text
            if (attributeName === 'path') record.path = attribute.initializer.text
          }
          if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
            const valueSource = readSerializableExpression(attribute.initializer.expression)
            if (attributeName === 'options') record.options = valueSource
          }
        }
        if (record.name) screens.push(record)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { kind, screens }
}

function scanDirectory(
  absoluteDirPath: string,
  relativeDirPath: string,
  layoutFilename: string,
  imports: Map<string, string>,
): DirectoryNode {
  const entries = fs.readdirSync(absoluteDirPath, { withFileTypes: true })
  const basePath = relativeDirPath
    ? `/${relativeDirPath.split('/').map(routeSegmentToPathPart).filter(Boolean).join('/')}`
    : '/'
  const node: DirectoryNode = {
    basePath,
    children: [],
    dirAbsolutePath: absoluteDirPath,
    dirName: path.basename(absoluteDirPath),
    dirRelativePath: relativeDirPath,
    id: createLayoutId(relativeDirPath),
    pages: [],
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absoluteEntryPath = path.join(absoluteDirPath, entry.name)
    if (entry.isDirectory()) {
      const childRelativePath = relativeDirPath ? `${relativeDirPath}/${entry.name}` : entry.name
      node.children.push(scanDirectory(absoluteEntryPath, childRelativePath, layoutFilename, imports))
      continue
    }

    if (!ROUTE_FILE_EXTENSIONS.has(path.extname(entry.name)) || entry.name.endsWith('.d.ts')) {
      continue
    }

    if (entry.name === layoutFilename) {
      const importName = `LayoutComponent${imports.size + 1}`
      imports.set(absoluteEntryPath, importName)
      node.layout = {
        absolutePath: absoluteEntryPath,
        importName,
        metadata: parseLayoutMetadata(absoluteEntryPath),
      }
      continue
    }

    if (!isRouteSourceFile(entry.name, layoutFilename)) continue
    const pageName = entry.name.replace(/\.[^.]+$/, '')
    const importName = `RouteComponent${imports.size + 1}`
    imports.set(absoluteEntryPath, importName)
    node.pages.push({
      absolutePath: absoluteEntryPath,
      importName,
      name: pageName,
      routePath: joinRoutePath(basePath, pageName),
    })
  }

  node.children.sort((left, right) => left.dirName.localeCompare(right.dirName))
  node.pages.sort((left, right) => {
    if (left.name === 'index') return -1
    if (right.name === 'index') return 1
    return left.name.localeCompare(right.name)
  })

  return node
}

function computeDefaultTargetPath(node: DirectoryNode): string {
  const directChildren = collectDirectChildren(node)
  const ordered = orderChildren(node, directChildren)
  const indexPage = node.pages.find((page) => page.name === 'index')
  if (indexPage) return indexPage.routePath
  return ordered[0]?.targetPath ?? node.basePath
}

function collectDirectChildren(
  node: DirectoryNode,
): Array<{ kind: 'page' | 'branch'; name: string; segmentPath: string; targetPath: string }> {
  const pageChildren = node.pages.map((page) => ({
    kind: 'page' as const,
    name: page.name,
    segmentPath: page.routePath,
    targetPath: page.routePath,
  }))
  const branchChildren = node.children.map((child) => ({
    kind: 'branch' as const,
    name: child.dirName,
    segmentPath: child.basePath,
    targetPath: computeDefaultTargetPath(child),
  }))
  return [...pageChildren, ...branchChildren]
}

function orderChildren(
  node: DirectoryNode,
  children: Array<{ kind: 'page' | 'branch'; name: string; segmentPath: string; targetPath: string }>,
): Array<{ kind: 'page' | 'branch'; name: string; optionsSource?: string; segmentPath: string; targetPath: string }> {
  const byName = new Map(children.map((child) => [child.name, child]))
  const ordered: Array<{ kind: 'page' | 'branch'; name: string; optionsSource?: string; segmentPath: string; targetPath: string }> = []
  const seen = new Set<string>()

  const declaredScreens = node.layout?.metadata.screens ?? []
  for (const screen of declaredScreens) {
    const child = byName.get(screen.name)
    if (!child || seen.has(screen.name)) continue
    ordered.push({
      ...child,
      optionsSource: screen.options,
      targetPath: screen.path ?? child.targetPath,
    })
    seen.add(screen.name)
  }

  for (const child of children) {
    if (seen.has(child.name)) continue
    ordered.push(child)
    seen.add(child.name)
  }

  return ordered
}

function buildGeneratedRecords(rootNode: DirectoryNode): {
  defaultPathByBasePath: Record<string, string>
  layouts: GeneratedLayoutRecord[]
  routes: GeneratedRouteRecord[]
} {
  const layouts: GeneratedLayoutRecord[] = []
  const routes: GeneratedRouteRecord[] = []
  const defaultPathByBasePath: Record<string, string> = {}

  const visit = (
    node: DirectoryNode,
    ancestorLayoutIds: string[],
    childNameByAncestorLayoutId: Record<string, string>,
  ): void => {
    const currentLayoutIds = [...ancestorLayoutIds]
    if (node.layout) {
      const directChildren = collectDirectChildren(node)
      const orderedChildren = orderChildren(node, directChildren)
      layouts.push({
        basePath: node.basePath,
        children: orderedChildren,
        id: node.id,
        importName: node.layout.importName,
        kind: node.layout.metadata.kind,
        screens: node.layout.metadata.screens,
      })
      currentLayoutIds.push(node.id)
      defaultPathByBasePath[node.basePath] = computeDefaultTargetPath(node)
    }

    for (const page of node.pages) {
      const childNameByLayoutId = { ...childNameByAncestorLayoutId }
      if (node.layout) {
        childNameByLayoutId[node.id] = page.name
      }
      routes.push({
        childNameByLayoutId,
        id: createRouteId(path.relative(rootNode.dirAbsolutePath, page.absolutePath).replace(/\\/g, '/')),
        importName: page.importName,
        layoutIds: currentLayoutIds,
        paramNames: Array.from(page.routePath.matchAll(/\[([^\]]+)\]/g), (match) => match[1]),
        routePath: page.routePath,
        score: scoreRoutePath(page.routePath),
      })
      defaultPathByBasePath[page.routePath] = page.routePath
    }

    for (const child of node.children) {
      const nextChildNameByLayoutId = { ...childNameByAncestorLayoutId }
      if (node.layout) {
        nextChildNameByLayoutId[node.id] = child.dirName
      }
      visit(child, currentLayoutIds, nextChildNameByLayoutId)
    }
  }

  visit(rootNode, [], {})

  routes.sort((left, right) => right.score - left.score || right.routePath.length - left.routePath.length)
  return { defaultPathByBasePath, layouts, routes }
}

function scoreRoutePath(routePath: string): number {
  return routePath
    .split('/')
    .filter(Boolean)
    .reduce((score, segment) => score + (segment.startsWith('[') ? 8 : 16), 0)
}

function routePathToRegex(routePath: string): string {
  if (routePath === '/') return '^/$'
  const pattern = routePath
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return `^/${pattern}$`
}

function generateTypeAugmentation(routes: GeneratedRouteRecord[]): string {
  const routePaths = routes.map((route) => route.routePath)
  const pathUnion = routePaths.length
    ? routePaths.map((routePath) => JSON.stringify(routePath)).join(' | ')
    : 'string'
  const hrefMembers = new Set<string>()
  for (const route of routes) {
    hrefMembers.add(JSON.stringify(route.routePath))
    if (route.paramNames.length) {
      hrefMembers.add(`{ pathname: ${JSON.stringify(route.routePath)}; params: { ${route.paramNames
        .map((paramName) => `${JSON.stringify(paramName)}: string | number`)
        .join('; ')} } }`)
    }
  }
  const paramsByPath = routes
    .map((route) => {
      const params = route.paramNames.length
        ? `{ ${route.paramNames.map((paramName) => `${JSON.stringify(paramName)}: string | number`).join('; ')} }`
        : '{}'
      return `      ${JSON.stringify(route.routePath)}: ${params}`
    })
    .join(',\n')

  return `
declare module '@tamer4lynx/tamer-router' {
  interface GeneratedRouteTypes {
    paths: ${pathUnion}
    href: ${Array.from(hrefMembers).join(' | ')}
    paramsByPath: {
${paramsByPath}
    }
  }
}
`
}

function generateRouteModule(
  outputPath: string,
  manifest: {
    defaultPathByBasePath: Record<string, string>
    layouts: GeneratedLayoutRecord[]
    routes: GeneratedRouteRecord[]
  },
  imports: Map<string, string>,
): string {
  const importLines = Array.from(imports.entries()).map(([absolutePath, importName]) => {
    const specifier = normalizeImportPath(outputPath, absolutePath)
    return `import ${importName} from ${JSON.stringify(specifier)}`
  })

  const layoutEntries = manifest.layouts
    .map((layout) => `    ${JSON.stringify(layout.id)}: {
      id: ${JSON.stringify(layout.id)},
      basePath: ${JSON.stringify(layout.basePath)},
      kind: ${JSON.stringify(layout.kind)},
      component: ${layout.importName},
      screens: [
${layout.screens
  .map((screen) => `        {
          name: ${JSON.stringify(screen.name)},
          ${screen.path ? `path: ${JSON.stringify(screen.path)},` : ''}
          ${screen.options ? `options: ${screen.options},` : ''}
        }`)
  .join(',\n')}
      ],
      children: [
${layout.children
  .map((child) => `        {
          name: ${JSON.stringify(child.name)},
          kind: ${JSON.stringify(child.kind)},
          segmentPath: ${JSON.stringify(child.segmentPath)},
          targetPath: ${JSON.stringify(child.targetPath)},
          ${child.optionsSource ? `options: ${child.optionsSource},` : ''}
        }`)
  .join(',\n')}
      ],
    }`)
    .join(',\n')

  const routeEntries = manifest.routes
    .map((route) => `    {
      id: ${JSON.stringify(route.id)},
      routePath: ${JSON.stringify(route.routePath)},
      component: ${route.importName},
      layoutIds: ${JSON.stringify(route.layoutIds)},
      childNameByLayoutId: ${JSON.stringify(route.childNameByLayoutId)},
      matcher: new RegExp(${JSON.stringify(routePathToRegex(route.routePath))}),
      paramNames: ${JSON.stringify(route.paramNames)},
      score: ${route.score},
    }`)
    .join(',\n')

  const defaultPathByBasePath = Object.entries(manifest.defaultPathByBasePath)
    .map(([basePath, targetPath]) => `    ${JSON.stringify(basePath)}: ${JSON.stringify(targetPath)}`)
    .join(',\n')

  return `/* eslint-disable */
// @ts-nocheck
import type { GeneratedRoutesManifest } from '@tamer4lynx/tamer-router'
${importLines.join('\n')}

const generatedRoutes: GeneratedRoutesManifest = {
  layouts: {
${layoutEntries}
  },
  routes: [
${routeEntries}
  ],
  initialPath: ${JSON.stringify(manifest.defaultPathByBasePath['/'] ?? '/')},
  defaultPathByBasePath: {
${defaultPathByBasePath}
  },
}

export const tamerLinking = {
  prefixes: ['/'],
  config: {
    screens: {
${manifest.routes
  .map((route) => `      ${JSON.stringify(route.id)}: ${JSON.stringify(route.routePath === '/' ? '' : route.routePath.slice(1))}`)
  .join(',\n')}
    },
  },
}

${generateTypeAugmentation(manifest.routes)}

export default generatedRoutes
`
}

function generateMetaModule(
  manifest: {
    defaultPathByBasePath: Record<string, string>
    layouts: GeneratedLayoutRecord[]
    routes: GeneratedRouteRecord[]
  },
): string {
  return `/* eslint-disable */
// @ts-nocheck
export default ${JSON.stringify(
    {
      layouts: manifest.layouts.map((layout) => ({
        id: layout.id,
        basePath: layout.basePath,
        kind: layout.kind,
        screens: layout.screens,
        children: layout.children,
      })),
      routes: manifest.routes.map((route) => ({
        id: route.id,
        routePath: route.routePath,
        layoutIds: route.layoutIds,
        childNameByLayoutId: route.childNameByLayoutId,
        paramNames: route.paramNames,
        score: route.score,
      })),
      initialPath: manifest.defaultPathByBasePath['/'] ?? '/',
      defaultPathByBasePath: manifest.defaultPathByBasePath,
    },
    null,
    2,
  )}
`
}

function deriveMetaOutputPath(outputPath: string): string {
  const extension = path.extname(outputPath) || '.ts'
  const basename = path.basename(outputPath, extension)
  return path.join(path.dirname(outputPath), `${basename}.meta${extension === '.tsx' ? '.ts' : extension}`)
}

function ensureGeneratedFiles(options: PluginOptions, appRoot: string): {
  metaOutputPath: string
  outputPath: string
} {
  const routesRoot = path.resolve(appRoot, options.root)
  const outputPath = path.resolve(appRoot, options.output ?? DEFAULT_OUTPUT)
  const metaOutputPath = deriveMetaOutputPath(outputPath)
  const layoutFilename = options.layoutFilename ?? '_layout.tsx'
  const imports = new Map<string, string>()
  const rootNode = scanDirectory(routesRoot, '', layoutFilename, imports)
  const manifest = buildGeneratedRecords(rootNode)
  const routeModuleSource = generateRouteModule(outputPath, manifest, imports)
  const metaModuleSource = generateMetaModule(manifest)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.mkdirSync(path.dirname(metaOutputPath), { recursive: true })
  fs.writeFileSync(outputPath, routeModuleSource)
  fs.writeFileSync(metaOutputPath, metaModuleSource)

  return { metaOutputPath, outputPath }
}

function startWatcher(options: PluginOptions, appRoot: string): void {
  const watchRoot = path.resolve(appRoot, options.root)
  const watcher = chokidar.watch(watchRoot, {
    ignoreInitial: true,
  })

  const regenerate = () => {
    try {
      ensureGeneratedFiles(options, appRoot)
    } catch {
      // Keep the previous generated output during incremental edits until the source becomes valid again.
    }
  }

  watcher.on('add', regenerate)
  watcher.on('change', regenerate)
  watcher.on('unlink', regenerate)
  watcher.on('addDir', regenerate)
  watcher.on('unlinkDir', regenerate)
  process.once('exit', () => {
    void watcher.close()
  })
}

export function tamerRouterPlugin(options: PluginOptions): RsbuildPlugin {
  return {
    name: 'tamer-router',
    setup(api) {
      const appRoot = api.context?.rootPath ?? process.cwd()
      const { metaOutputPath, outputPath } = ensureGeneratedFiles(options, appRoot)

      api.modifyRsbuildConfig((config) => {
        const alias = (config.resolve?.alias ?? {}) as Record<string, string>
        return {
          ...config,
          resolve: {
            ...config.resolve,
            alias: {
              ...alias,
              '@tamer4lynx/tamer-router/generated-routes': outputPath,
              '@tamer4lynx/tamer-router/generated-routes-meta': metaOutputPath,
            },
          },
        }
      })

      if (process.env.NODE_ENV !== 'production') {
        startWatcher(options, appRoot)
      }
    },
  }
}
