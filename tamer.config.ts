import { tamerRouterPlugin } from './src/plugin.js'

export default {
  tamerRouter: tamerRouterPlugin({
    root: './src/pages',
    layoutFilename: '_layout.tsx',
  }),
}
