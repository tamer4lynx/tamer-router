import { tamerRouterPlugin } from './src/plugin.js'

export default {
  tamerRouter: tamerRouterPlugin({
    root: './src/pages',
    output: 'node_modules/.tamer-router/_generated_routes.tsx',
    layoutFilename: '_layout.tsx',
  }),
}
