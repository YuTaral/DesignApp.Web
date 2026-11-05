import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { SignInPage, SignUpPage } from "@/pages/auth-page"
import { DesignsPage } from "@/pages/designs-page"
import { EditorPage } from "@/pages/editor-page"
import { HomePage } from "@/pages/home-page"
import { RoomsPage } from "@/pages/rooms-page"

/** The root route: every page renders inside the app shell (header + main). */
const rootRoute = createRootRoute({ component: AppShell })

/**
 * Reads an optional text search parameter.
 * @param value - The parameter as parsed from the URL.
 */
const optionalText = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined)

/** `/sign-in` and `/sign-up` take `?redirect=` (where to go afterwards). */
const authSearch = (search: Record<string, unknown>) => ({ redirect: optionalText(search.redirect) })

const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sign-in", validateSearch: authSearch, component: SignInPage })

const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sign-up", validateSearch: authSearch, component: SignUpPage })

/**
 * The pages: `/` home (upload), `/rooms` the user's rooms, `/rooms/$roomId` the editor (with
 * `?design=` to open a saved design), `/designs` saved designs, and sign in / sign up.
 */
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/rooms", component: RoomsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/rooms/$roomId",
    validateSearch: (search: Record<string, unknown>) => ({ design: optionalText(search.design) }),
    component: EditorPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/designs", component: DesignsPage }),
  signInRoute,
  signUpRoute,
])

/** The app's router. Links preload their page's code on hover (`defaultPreload: "intent"`). */
export const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  /** Registers the router's type so links and params are type-checked. */
  interface Register {
    router: typeof router
  }
}
