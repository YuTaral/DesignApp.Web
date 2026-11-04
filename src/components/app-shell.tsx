import { Link, Outlet } from "@tanstack/react-router"
import { LayoutGridIcon, PlusIcon } from "lucide-react"

import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

/** Style of the header links; the active page's link is highlighted. */
const navLinkClass =
  "rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"

/** Layout of every page: sticky header with logo, navigation and theme menu, then the page. */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link to="/" className="mr-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            <Link to="/" className={navLinkClass} activeOptions={{ exact: true }}>
              New design
            </Link>
            <Link to="/designs" className={navLinkClass}>
              My designs
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="sm:hidden" asChild>
              <Link to="/designs" aria-label="My designs">
                <LayoutGridIcon />
              </Link>
            </Button>
            <ThemeToggle />
            <Button size="lg" className="hidden sm:inline-flex" asChild>
              <Link to="/">
                <PlusIcon data-icon="inline-start" />
                New design
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
