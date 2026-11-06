import { ROUTES } from "@/lib/constants"

/**
 * Where to go after signing in: a path inside the app, else the home page. Anything else (another
 * site, `//evil.example`) is ignored, so a link can't send people elsewhere after they sign in.
 * @param redirect - The `redirect` search parameter.
 */
export function safeRedirect(redirect: unknown): string {
  return typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//") && !redirect.startsWith("/\\")
    ? redirect
    : ROUTES.home
}
