import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { SignInPage, SignUpPage } from "@/pages/auth-page"
import { DesignsPage } from "@/pages/designs-page"
import { EditorPage } from "@/pages/editor-page"
import { HomePage } from "@/pages/home-page"
import { DesignPage } from "@/pages/design-page"

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
 * The pages: `/` home (upload; `?design=` adds the photo to that design), `/rooms/$roomId` the
 * editor (`?design=` when the room is in a design), `/designs` the account's designs,
 * `/designs/$designId` one design, and sign in / sign up.
 */
const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    // ?design= uploads the photo straight into that design ("Add room" on a design's page).
    validateSearch: (search: Record<string, unknown>) => ({ design: optionalText(search.design) }),
    component: HomePage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/rooms/$roomId",
    validateSearch: (search: Record<string, unknown>) => ({ design: optionalText(search.design) }),
    component: EditorPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/designs", component: DesignsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/designs/$designId", component: DesignPage }),
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
