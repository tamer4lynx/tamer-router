import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import chokidar from 'chokidar'
import type { RsbuildPlugin } from '@rsbuild/core'
import { sortRoutePaths } from './collect-known-route-paths.js'
import { getOutermostStackFromPath } from './tamer-stacks.js'

type LayoutKind = 'slot' | 'stack' | 'tab' | 'rail'

/** `true` or `{}`: all file routes lazy. `{ eagerPaths }`: lazy except these `routePath` strings (e.g. `['/tabs']` for tab home IFR). */
export type TamerLazyRoutesOption = boolean | { eagerPaths?: string[] }

interface PluginOptions {
  layoutFilename?: string
  output?: string
  /** React Router `<Routes>` tree + `TAMER_KNOWN_PATHS_*` (default `node_modules/.tamer-router/_generated_app_routes.tsx`). */
  appRoutesOutput?: string
  /** TanStack `routeTree` module; outside `src/` to avoid dev-server watch loops. */
  routeTreeOutput?: string
  /** Override path for `TAMER_LAZY_ROUTES` flag module (default `node_modules/.tamer-router/_tamer_lazy_routes_flag.ts`). */
  lazyFlagOutput?: string
  root: string
  srcAlias?: string
  /**
   * Lazy file-route code splitting (`lazy()` + async bundles). `true` / `{}` = all pages lazy; `{ eagerPaths }` keeps
   * those `routePath` values static (e.g. `['/tabs']` for tab home). Requires `<FileRouter lazyRoutes />` while any page stays lazy.
   */
  lazyRoutes?: TamerLazyRoutesOption
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
  chunkName: string
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
const DEFAULT_APP_ROUTES_OUTPUT = 'node_modules/.tamer-router/_generated_app_routes.tsx'
const DEFAULT_LAZY_FLAG_OUTPUT = 'node_modules/.tamer-router/_tamer_lazy_routes_flag.ts'
const DEFAULT_ROUTE_TREE_OUTPUT = 'node_modules/.tamer-router/tamerRouteTree.gen.tsx'
/** Stable import id for the resolved absolute path to `routeTreeOutput` (see `tamerRouterPlugin` alias). */
export const TAMER_FILE_ROUTE_TREE_MODULE = 'tamer-file-route-tree'
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

function createChunkName(relativeFilePath: string): string {
  return `tamer-route-${relativeFilePath
    .replace(/\.[^.]+$/, '')
    .replace(/\\/g, '/')
    .replace(/(^|\/)index$/g, '$1index')
    .replace(/[^a-zA-Z0-9_/-]+/g, '-')
    .replace(/[/-]+/g, '-')}`
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
      chunkName: createChunkName(path.relative(process.cwd(), absoluteEntryPath)),
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

type LayoutAncestry = Array<{ basePath: string; kind: LayoutKind }>

function pageFileToRoutePathProp(pageName: string): string {
  if (pageName === 'index') return ''
  if (pageName.startsWith('[') && pageName.endsWith(']')) {
    return `:${pageName.slice(1, -1)}`
  }
  return pageName
}

function pageFileToStackHandleName(pageName: string): string {
  if (pageName === 'index') return 'index'
  return pageName
}

function outermostStackIdFromAncestry(ancestry: LayoutAncestry): string | null {
  for (const a of ancestry) {
    if (a.kind === 'stack' || a.kind === 'tab') {
      const segs = a.basePath.split('/').filter(Boolean)
      if (segs[0] === 'tabs' || segs[0] === 'native' || segs[0] === 'm3') {
        return `/${segs[0]}`
      }
    }
  }
  return null
}

function emitRouteHandle(ancestry: LayoutAncestry, pageName: string, omitForRootIndex: boolean): string {
  if (omitForRootIndex) return ''
  const outer = outermostStackIdFromAncestry(ancestry)
  const stackName = pageFileToStackHandleName(pageName)
  if (outer) {
    return ` handle={{ tamerOutermostStack: ${JSON.stringify(outer)}, tamerStackName: ${JSON.stringify(stackName)} }}`
  }
  return ` handle={{ tamerStackName: ${JSON.stringify(stackName)} }}`
}

function manifestPathToKnownPath(routePath: string): string {
  if (routePath === '/') return '/'
  return (
    '/' +
    routePath
      .split('/')
      .filter(Boolean)
      .map((seg) => (seg.startsWith('[') && seg.endsWith(']') ? `:${seg.slice(1, -1)}` : seg))
      .join('/')
  )
}

function buildCoordinatorKnownPaths(allKnown: string[]): string[] {
  const set = new Set<string>(['/'])
  for (const p of allKnown) {
    if (!getOutermostStackFromPath(p)) set.add(p)
  }
  set.add('/tabs')
  set.add('/native')
  set.add('/m3')
  return sortRoutePaths([...set])
}

/** Static path segments must precede `:param` so `/edit` is not captured as `:id`. */
function sortPagesForRoutes(pages: PageNode[]): PageNode[] {
  return [...pages].sort((a, b) => {
    if (a.name === 'index') return -1
    if (b.name === 'index') return 1
    const ad = a.name.startsWith('[') ? 1 : 0
    const bd = b.name.startsWith('[') ? 1 : 0
    if (ad !== bd) return ad - bd
    return a.name.localeCompare(b.name)
  })
}

function collectPages(node: DirectoryNode, pages: PageNode[] = []): PageNode[] {
  pages.push(...node.pages)
  for (const child of node.children) collectPages(child, pages)
  return pages
}

function collectLayouts(
  node: DirectoryNode,
  layouts: Array<{ absolutePath: string; importName: string }> = [],
): Array<{ absolutePath: string; importName: string }> {
  if (node.layout) {
    layouts.push({
      absolutePath: node.layout.absolutePath,
      importName: node.layout.importName,
    })
  }
  for (const child of node.children) collectLayouts(child, layouts)
  return layouts
}

function emitDirectoryRoutes(node: DirectoryNode, ancestry: LayoutAncestry, depth: number): string {
  const pad = '  '.repeat(depth)
  if (node.layout) {
    const nextAnc: LayoutAncestry = [
      ...ancestry,
      { basePath: node.basePath, kind: node.layout.metadata.kind },
    ]
    const innerLines: string[] = []
    for (const page of sortPagesForRoutes(node.pages)) {
      const isIndex = page.name === 'index'
      const pathSeg = pageFileToRoutePathProp(page.name)
      const handle = emitRouteHandle(nextAnc, page.name, false)
      if (isIndex) {
        innerLines.push(`${pad}  <Route index element={<${page.importName} />}${handle} />`)
      } else {
        innerLines.push(
          `${pad}  <Route path=${JSON.stringify(pathSeg)} element={<${page.importName} />}${handle} />`,
        )
      }
    }
    for (const child of node.children) {
      innerLines.push(emitDirectoryRoutes(child, nextAnc, depth + 1))
    }
    return `${pad}<Route path=${JSON.stringify(node.dirName)} element={<${node.layout.importName} />}>\n${innerLines.join(
      '\n',
    )}\n${pad}</Route>`
  }

  const lines: string[] = []
  for (const page of sortPagesForRoutes(node.pages)) {
    const isRoot = ancestry.length === 0
    const isRootIndex = isRoot && page.name === 'index'
    if (isRootIndex) {
      lines.push(`${pad}<Route path="/" element={<${page.importName} />} />`)
      continue
    }
    const pathSeg = pageFileToRoutePathProp(page.name)
    const handle = emitRouteHandle(ancestry, page.name, false)
    lines.push(`${pad}<Route path=${JSON.stringify(pathSeg)} element={<${page.importName} />}${handle} />`)
  }
  for (const child of node.children) {
    lines.push(emitDirectoryRoutes(child, ancestry, depth))
  }
  return lines.join('\n')
}

function collectTabStackPaths(layouts: GeneratedLayoutRecord[]): string[] {
  const paths = new Set<string>()
  for (const layout of layouts) {
    if (layout.kind !== 'tab') continue
    const segs = layout.basePath.split('/').filter(Boolean)
    if (segs.length === 0) continue
    const head = `/${segs[0]}`
    paths.add(head)
  }
  return [...paths].sort()
}

function collectAllStackPaths(layouts: GeneratedLayoutRecord[]): string[] {
  const paths = new Set<string>()
  for (const layout of layouts) {
    if (layout.kind !== 'tab' && layout.kind !== 'stack') continue
    const segs = layout.basePath.split('/').filter(Boolean)
    if (segs.length === 0) continue
    const head = `/${segs[0]}`
    paths.add(head)
  }
  return [...paths].sort()
}

function normalizeLazyRoutes(lazy: TamerLazyRoutesOption | undefined): {
  enabled: boolean
  eagerPaths: Set<string>
} {
  if (lazy === true) return { enabled: true, eagerPaths: new Set() }
  if (lazy && typeof lazy === 'object') {
    const paths = Array.isArray(lazy.eagerPaths) ? lazy.eagerPaths : []
    return { enabled: true, eagerPaths: new Set(paths) }
  }
  return { enabled: false, eagerPaths: new Set() }
}

function pageUsesLazyImport(
  page: PageNode,
  norm: { enabled: boolean; eagerPaths: Set<string> },
): boolean {
  return norm.enabled && !norm.eagerPaths.has(page.routePath)
}

function generateAppRoutesModule(
  outputPath: string,
  rootNode: DirectoryNode,
  _imports: Map<string, string>,
  manifest: {
    layouts: GeneratedLayoutRecord[]
    routes: GeneratedRouteRecord[]
  },
  lazyNorm: { enabled: boolean; eagerPaths: Set<string> },
): string {
  const pages = collectPages(rootNode)
  const anyLazyPage = pages.some((p) => pageUsesLazyImport(p, lazyNorm))
  const layoutImportLines = collectLayouts(rootNode).map((layout) => {
    const specifier = normalizeImportPath(outputPath, layout.absolutePath)
    return `import ${layout.importName} from ${JSON.stringify(specifier)}`
  })
  const pageImportLines = pages.map((page) => {
    const specifier = normalizeImportPath(outputPath, page.absolutePath)
    return pageUsesLazyImport(page, lazyNorm)
      ? `const ${page.importName} = lazy(() => import(/* webpackChunkName: ${JSON.stringify(page.chunkName)} */ ${JSON.stringify(specifier)}))`
      : `import ${page.importName} from ${JSON.stringify(specifier)}`
  })
  const lazyImportLine = anyLazyPage ? `import { lazy } from '@lynx-js/react'\n` : ''

  const bodyLines: string[] = []
  const rootLayoutImport = rootNode.layout?.importName
  const childIndent = rootLayoutImport ? 4 : 3
  const childPad = '  '.repeat(childIndent)
  if (rootLayoutImport) {
    bodyLines.push(`      <Route path="/" element={<${rootLayoutImport} />}>`)
  }
  for (const page of sortPagesForRoutes(rootNode.pages)) {
    const isRootIndex = page.name === 'index'
    if (isRootIndex) {
      if (rootLayoutImport) {
        bodyLines.push(`${childPad}<Route index element={<${page.importName} />} />`)
      } else {
        bodyLines.push(`      <Route path="/" element={<${page.importName} />} />`)
      }
      continue
    }
    const pathSeg = pageFileToRoutePathProp(page.name)
    const handle = emitRouteHandle([], page.name, false)
    bodyLines.push(`${childPad}<Route path=${JSON.stringify(pathSeg)} element={<${page.importName} />}${handle} />`)
  }
  for (const child of rootNode.children) {
    bodyLines.push(emitDirectoryRoutes(child, [], childIndent))
  }
  if (rootLayoutImport) {
    bodyLines.push(`      </Route>`)
  }
  bodyLines.push(`      <Route path="*" element={<TamerDefaultNotFound />} />`)

  const allKnown = sortRoutePaths(manifest.routes.map((r) => manifestPathToKnownPath(r.routePath)))
  const coordinatorKnown = buildCoordinatorKnownPaths(allKnown)
  const tabStackPaths = collectTabStackPaths(manifest.layouts)
  const allStackPaths = collectAllStackPaths(manifest.layouts)
  const coordinatorInitialPath = tabStackPaths[0] ?? '/'

  return `/* eslint-disable */
// @ts-nocheck
import { Route, Routes } from 'react-router'
${lazyImportLine}import { TamerDefaultNotFound, setTabStackPaths, setAllStackPaths, setTamerGeneratedRoutes } from '@tamer4lynx/tamer-router'
${layoutImportLines.join('\n')}
${pageImportLines.join('\n')}

export const TAMER_KNOWN_PATHS_FULL = ${JSON.stringify(allKnown, null, 2)}

export const TAMER_KNOWN_PATHS_COORDINATOR = ${JSON.stringify(coordinatorKnown, null, 2)}

/** Alias for full path list (404 helper, deep links). */
export const TAMER_KNOWN_PATHS = TAMER_KNOWN_PATHS_FULL

/** Top-level paths whose layout kind is tab — never trigger native push. */
export const TAMER_TAB_STACK_PATHS = ${JSON.stringify(tabStackPaths, null, 2)}

/** All recognized top-level stack paths (tab + stack kind). */
export const TAMER_ALL_STACK_PATHS = ${JSON.stringify(allStackPaths, null, 2)}

setTabStackPaths(TAMER_TAB_STACK_PATHS)
setAllStackPaths(TAMER_ALL_STACK_PATHS)

export function TamerGeneratedAppRoutes() {
  return (
    <Routes>
${bodyLines.join('\n')}
    </Routes>
  )
}

setTamerGeneratedRoutes({
  Routes: TamerGeneratedAppRoutes,
  knownPaths: TAMER_KNOWN_PATHS,
  coordinatorInitialPath: ${JSON.stringify(coordinatorInitialPath)},
})
`
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
  appRoutesOutputPath: string
  lazyFlagOutputPath: string
  metaOutputPath: string
  outputPath: string
} {
  const routesRoot = path.resolve(appRoot, options.root)
  const outputPath = path.resolve(appRoot, options.output ?? DEFAULT_OUTPUT)
  const appRoutesOutputPath = path.resolve(appRoot, options.appRoutesOutput ?? DEFAULT_APP_ROUTES_OUTPUT)
  const lazyFlagOutputPath = path.resolve(appRoot, options.lazyFlagOutput ?? DEFAULT_LAZY_FLAG_OUTPUT)
  const metaOutputPath = deriveMetaOutputPath(outputPath)
  const layoutFilename = options.layoutFilename ?? '_layout.tsx'
  const imports = new Map<string, string>()
  const rootNode = scanDirectory(routesRoot, '', layoutFilename, imports)
  const manifest = buildGeneratedRecords(rootNode)
  const lazyNorm = normalizeLazyRoutes(options.lazyRoutes)
  const allPages = collectPages(rootNode)
  const anyPageLazy = allPages.some((p) => pageUsesLazyImport(p, lazyNorm))
  const routeModuleSource = generateRouteModule(outputPath, manifest, imports)
  const metaModuleSource = generateMetaModule(manifest)
  const appRoutesSource = generateAppRoutesModule(
    appRoutesOutputPath,
    rootNode,
    imports,
    manifest,
    lazyNorm,
  )

  const lazyFlagSource = `/* eslint-disable */\nexport const TAMER_LAZY_ROUTES = ${anyPageLazy}\n`

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.mkdirSync(path.dirname(metaOutputPath), { recursive: true })
  fs.mkdirSync(path.dirname(appRoutesOutputPath), { recursive: true })
  fs.mkdirSync(path.dirname(lazyFlagOutputPath), { recursive: true })
  fs.writeFileSync(outputPath, routeModuleSource)
  fs.writeFileSync(metaOutputPath, metaModuleSource)
  fs.writeFileSync(appRoutesOutputPath, appRoutesSource)
  fs.writeFileSync(lazyFlagOutputPath, lazyFlagSource)

  return { appRoutesOutputPath, lazyFlagOutputPath, metaOutputPath, outputPath }
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

/**
 * Emits file-router modules under `node_modules/.tamer-router/`. After changing this package’s source, run `npm run build` in `packages/tamer-router` before building the host app.
 *
 * **Lazy routes:** `lazyRoutes: true` (or `{}`) emits async chunks for every file route. Use `lazyRoutes: { eagerPaths: ['/tabs'] }` to keep IFR-sensitive screens in the main bundle while the rest stay lazy. Pass `<FileRouter lazyRoutes />` when any route remains lazy (see `generated-lazy-flag`). IFR snapshot issues may persist on some Lynx builds; try `firstScreenSyncTiming: 'jsReady'` or add more `eagerPaths`.
 */
export function tamerRouterPlugin(options: PluginOptions): RsbuildPlugin {
  return {
    name: 'tamer-router',
    setup(api) {
      const appRoot = api.context?.rootPath ?? process.cwd()
      const { appRoutesOutputPath, lazyFlagOutputPath, metaOutputPath, outputPath } = ensureGeneratedFiles(
        options,
        appRoot,
      )

      const routeTreePath = path.resolve(
        appRoot,
        options.routeTreeOutput ?? DEFAULT_ROUTE_TREE_OUTPUT,
      )

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
              '@tamer4lynx/tamer-router/generated-app-routes': appRoutesOutputPath,
              '@tamer4lynx/tamer-router/generated-lazy-flag': lazyFlagOutputPath,
              [TAMER_FILE_ROUTE_TREE_MODULE]: routeTreePath,
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
