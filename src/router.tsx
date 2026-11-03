import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { DesignsPage } from "@/pages/designs-page"
import { EditorPage } from "@/pages/editor-page"
import { HomePage } from "@/pages/home-page"

const rootRoute = createRootRoute({ component: AppShell })

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/editor", component: EditorPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/designs", component: DesignsPage }),
])

export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
