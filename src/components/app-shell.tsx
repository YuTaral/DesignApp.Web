import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { LayoutGridIcon, LogInIcon, LogOutIcon, PlusIcon, UserRoundIcon } from "lucide-react"
import { toast } from "sonner"

import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAccount, useSignOut } from "@/features/account/api"
import { errorMessage } from "@/lib/api"

/** Style of the header links; the active page's link is highlighted. */
const navLinkClass =
  "rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"

/** Layout of every page: sticky header with logo, navigation, theme and account menus, then the page. */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link to="/" className="mr-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            <Link to="/" className={navLinkClass} activeOptions={{ exact: true }}>
              New design
            </Link>
            <Link to="/designs" className={navLinkClass}>
              My designs
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="md:hidden" asChild>
              <Link to="/designs" aria-label="My designs">
                <LayoutGridIcon />
              </Link>
            </Button>
            <ThemeToggle />
            <AccountMenu />
            <Button size="lg" className="hidden md:inline-flex" asChild>
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

/**
 * "Sign in" for guests; for an account, a menu with its email, its designs, and sign out.
 * Signing in from here comes back to the page the user was on.
 */
function AccountMenu() {
  const account = useAccount().data
  const signOut = useSignOut()
  const navigate = useNavigate()
  const here = useRouterState({ select: (state) => state.location.href })

  if (!account) return <div className="size-8" aria-hidden />

  if (!account.signedIn) {
    const onAuthPage = here.startsWith("/sign-in") || here.startsWith("/sign-up")
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link to="/sign-in" search={onAuthPage ? {} : { redirect: here }}>
          <LogInIcon data-icon="inline-start" />
          Sign in
        </Link>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <UserRoundIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs text-muted-foreground">Signed in as</span>
          <span className="block truncate font-medium">{account.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/designs">
            <LayoutGridIcon />
            My designs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signOut.isPending}
          onSelect={() =>
            signOut.mutate(undefined, {
              onSuccess: () => {
                toast.success("Signed out")
                void navigate({ to: "/" })
              },
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
