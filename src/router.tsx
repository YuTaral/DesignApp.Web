import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { DesignsPage } from "@/pages/designs-page"
import { EditorPage } from "@/pages/editor-page"
import { HomePage } from "@/pages/home-page"

/** The root route: every page renders inside the app shell (header + main). */
const rootRoute = createRootRoute({ component: AppShell })

/** The pages: `/` home (upload), `/rooms/$roomId` editor, `/designs` saved designs. */
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/rooms/$roomId", component: EditorPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/designs", component: DesignsPage }),
])

/** The app's router. Links preload their page's code on hover (`defaultPreload: "intent"`). */
export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  /** Registers the router's type so links and params are type-checked. */
  interface Register {
    router: typeof router
  }
}
