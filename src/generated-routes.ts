import type { GeneratedRoutesManifest, LinkingConfig } from './types.js'

const generatedRoutes: GeneratedRoutesManifest = {
  layouts: {},
  routes: [],
  initialPath: '/',
  defaultPathByBasePath: { '/': '/' },
}

export const tamerLinking: LinkingConfig = {
  prefixes: ['/'],
}

export default generatedRoutes

