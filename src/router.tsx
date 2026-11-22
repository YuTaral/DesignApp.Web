import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"

import { AppShell } from "@/components/app-shell"
import { BuildPage } from "@/pages/build-page"
import { PlanPage } from "@/pages/plan-page"
import { PhotosPage } from "@/pages/photos-page"
import { SignInPage, SignUpPage } from "@/pages/auth-page"
import { DesignsPage } from "@/pages/designs-page"
import { EditorPage } from "@/pages/editor-page"
import { HomePage } from "@/pages/home-page"
import { DesignPage } from "@/pages/design-page"
import { LibraryPage } from "@/pages/library-page"
import { BUILD_STEP, isEnumValue, ROUTES } from "@/lib/constants"

/** The root route: every page renders inside the app shell (header + main). */
const rootRoute = createRootRoute({ component: AppShell })

/**
 * Reads an optional text search parameter.
 * @param value - The parameter as parsed from the URL.
 */
const optionalText = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined)

/** `/sign-in` and `/sign-up` take `?redirect=` (where to go afterwards). */
const authSearch = (search: Record<string, unknown>) => ({ redirect: optionalText(search.redirect) })

const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: ROUTES.signIn, validateSearch: authSearch, component: SignInPage })

const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: ROUTES.signUp, validateSearch: authSearch, component: SignUpPage })

/**
 * The pages: `/` home (upload; `?design=` adds the photo to that design), `/rooms/$roomId` the
 * editor (`?design=` when the room is in a design), `/designs` the account's designs,
 * `/rooms/$roomId/photos` a room builder run's photos, `/designs/$designId` one design, `/library` the sample houses (`?house=` one house's rooms, `?design=` adds a room
 * to that design), `/build` and `/build/$planId` the room builder (walls, then the floor plan), and sign in / sign up.
 */
const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.home,
    // ?design= uploads the photo straight into that design ("Add room" on a design's page).
    validateSearch: (search: Record<string, unknown>) => ({ design: optionalText(search.design) }),
    component: HomePage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.room,
    validateSearch: (search: Record<string, unknown>) => ({ design: optionalText(search.design) }),
    component: EditorPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: ROUTES.photos, component: PhotosPage }),
  createRoute({ getParentRoute: () => rootRoute, path: ROUTES.designs, component: DesignsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: ROUTES.design, component: DesignPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.library,
    validateSearch: (search: Record<string, unknown>) => ({ design: optionalText(search.design), house: optionalText(search.house) }),
    component: LibraryPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.build,
    // ?step= is the step after the start (walls, floor or photo), so Back goes back a step.
    validateSearch: (search: Record<string, unknown>) => ({ step: isEnumValue(BUILD_STEP, search.step) ? search.step : undefined }),
    component: BuildPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: ROUTES.plan, component: PlanPage }),
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
