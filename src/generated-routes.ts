import { createRootRoute } from '@tanstack/react-router'

function EmptyRoute() {
  return null
}

const routes = createRootRoute({
  component: EmptyRoute,
}).addChildren([])

export default routes
