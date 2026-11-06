import { useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { LayoutGridIcon, LogInIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/features/account/api"
import { useDesigns, type Design } from "@/features/designs/api"
import { DeleteDesignDialog, DesignCover, DesignDetailsDialog, EmptyState } from "@/features/designs/components"
import { dateFormat, roomCount } from "@/features/designs/format"
import { errorMessage } from "@/lib/api"
import { MESSAGES, ROUTES } from "@/lib/constants"

/** Route `/designs`: the account's designs, or an invitation to sign in. */
export function DesignsPage() {
  const account = useAccount()
  const signedIn = account.data?.signedIn === true
  const designs = useDesigns(signedIn)
  const list = designs.data ?? []

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">My designs</h1>
      <p className="mt-1 text-sm text-muted-foreground">Each design holds one or more rooms, each with its own colors.</p>

      {account.isPending || (signedIn && designs.isPending) ? (
        <CardGrid>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
          ))}
        </CardGrid>
      ) : !signedIn ? (
        <EmptyState
          icon={LogInIcon}
          title={MESSAGES.designsSignIn}
          text={MESSAGES.designsAnyDevice}
          action={
            <Button size="lg" asChild>
              <Link to={ROUTES.signIn} search={{ redirect: ROUTES.designs }}>
                Sign in
              </Link>
            </Button>
          }
        />
      ) : designs.isError ? (
        <EmptyState
          icon={LayoutGridIcon}
          title={MESSAGES.designsLoadFailed}
          text={errorMessage(designs.error)}
          action={
            <Button size="lg" onClick={() => designs.refetch()}>
              Try again
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={LayoutGridIcon}
          title={MESSAGES.noDesigns}
          text={MESSAGES.noDesignsHint}
          action={
            <Button size="lg" asChild>
              <Link to={ROUTES.home} search={{}}>
                Start a design
              </Link>
            </Button>
          }
        />
      ) : (
        <CardGrid>
          {list.map((design) => (
            <DesignCard key={design.id} design={design} />
          ))}
        </CardGrid>
      )}
    </div>
  )
}

/**
 * The cards' responsive grid.
 * @param props.children - The cards.
 */
function CardGrid({ children }: { children: React.ReactNode }) {
  return <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
}

/**
 * One design: its rooms' photos, name, description, room count and date, and a menu to edit or
 * delete it. The photos and name open the design's page.
 * @param props.design - The design.
 */
function DesignCard({ design }: { design: Design }) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null)
  // Set when a menu item opens a dialog: the closing menu then mustn't move focus back to its
  // button, or the first keys typed into the dialog would land there.
  const openingDialog = useRef(false)
  const open = (which: "edit" | "delete") => {
    openingDialog.current = true
    setDialog(which)
  }
  const link = { to: ROUTES.design, params: { designId: design.id } } as const

  return (
    <li className="group overflow-hidden rounded-2xl border bg-card shadow-soft">
      <Link {...link} className="block overflow-hidden outline-none focus-visible:ring-3 focus-visible:ring-ring/50" tabIndex={-1}>
        <div className="transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none">
          <DesignCover design={design} />
        </div>
      </Link>
      <div className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <Link {...link} className="block truncate font-medium outline-none hover:underline focus-visible:underline">
            {design.name}
          </Link>
          {design.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{design.description}</p>}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {roomCount(design.rooms.length)} · Saved {dateFormat.format(new Date(design.updatedAt))}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${design.name}`}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (!openingDialog.current) return
              openingDialog.current = false
              event.preventDefault()
            }}
          >
            <DropdownMenuItem onSelect={() => open("edit")}>
              <PencilIcon />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => open("delete")}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DesignDetailsDialog design={design} open={dialog === "edit"} onOpenChange={(next) => setDialog(next ? "edit" : null)} />
      <DeleteDesignDialog design={design} open={dialog === "delete"} onOpenChange={(next) => setDialog(next ? "delete" : null)} />
    </li>
  )
}
