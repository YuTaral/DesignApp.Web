import { useId, useRef, useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"
import { LayoutGridIcon, LoaderCircleIcon, LogInIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/features/account/api"
import { MAX_DESIGN_NAME, useDeleteDesign, useDesigns, useUpdateDesign, type Design } from "@/features/designs/api"
import { apiUrl, errorMessage } from "@/lib/api"

/** How dates are shown: "5 Nov 2026, 14:32" in the browser's language. */
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

/** Route `/designs`: the account's saved designs, or an invitation to sign in. */
export function DesignsPage() {
  const account = useAccount()
  const signedIn = account.data?.signedIn === true
  const designs = useDesigns(signedIn)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">My designs</h1>
      <p className="mt-1 text-sm text-muted-foreground">Rooms you have restyled and saved.</p>

      {account.isPending || (signedIn && designs.isPending) ? (
        <CardGrid>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
          ))}
        </CardGrid>
      ) : !signedIn ? (
        <EmptyState
          icon={LogInIcon}
          title="Sign in to see your designs"
          text="Designs are saved to your account, so you can open them on any device."
          action={
            <Button size="lg" asChild>
              <Link to="/sign-in" search={{ redirect: "/designs" }}>
                Sign in
              </Link>
            </Button>
          }
        />
      ) : designs.isError ? (
        <EmptyState
          icon={LayoutGridIcon}
          title="We couldn't load your designs"
          text={errorMessage(designs.error)}
          action={
            <Button size="lg" onClick={() => designs.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (designs.data ?? []).length === 0 ? (
        <EmptyState
          icon={LayoutGridIcon}
          title="No designs yet"
          text="Open a room, try some colors, then press Save design."
          action={
            <Button size="lg" asChild>
              <Link to="/">Start a design</Link>
            </Button>
          }
        />
      ) : (
        <CardGrid>
          {(designs.data ?? []).map((design) => (
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
 * One saved design: the room photo with the design's colors, its name and date, and a menu to
 * rename or delete it. The photo and name open it in the editor.
 * @param props.design - The design.
 */
function DesignCard({ design }: { design: Design }) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null)
  // Set when a menu item opens a dialog: the closing menu then mustn't move focus back to its
  // button, or the first keys typed into the dialog would land there.
  const openingDialog = useRef(false)
  const open = (which: "rename" | "delete") => {
    openingDialog.current = true
    setDialog(which)
  }
  const link = { to: "/rooms/$roomId", params: { roomId: design.roomId }, search: { design: design.id } } as const

  return (
    <li className="group overflow-hidden rounded-2xl border bg-card shadow-soft">
      <Link {...link} className="block outline-none focus-visible:ring-3 focus-visible:ring-ring/50" tabIndex={-1}>
        <img
          src={apiUrl(design.photoUrl)}
          alt=""
          loading="lazy"
          className="aspect-[4/3] w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
        />
      </Link>
      <div className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <Link {...link} className="block truncate font-medium outline-none hover:underline focus-visible:underline">
            {design.name}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">Saved {dateFormat.format(new Date(design.updatedAt))}</p>
          <Swatches design={design} />
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
            <DropdownMenuItem onSelect={() => open("rename")}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => open("delete")}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <RenameDialog design={design} open={dialog === "rename"} onOpenChange={(open) => setDialog(open ? "rename" : null)} />
      <DeleteDialog design={design} open={dialog === "delete"} onOpenChange={(open) => setDialog(open ? "delete" : null)} />
    </li>
  )
}

/**
 * The design's colors as small dots, or a note when it has none.
 * @param props.design - The design.
 */
function Swatches({ design }: { design: Design }) {
  if (design.edits.length === 0) return <p className="mt-2 text-xs text-muted-foreground">No colors yet</p>
  const shown = design.edits.slice(0, 8)
  return (
    <div className="mt-2 flex items-center gap-1" aria-label={`${design.edits.length} recolored objects`}>
      {shown.map((edit) => (
        <span
          key={edit.objectIndex}
          className="size-4 rounded-full border border-foreground/10"
          style={{ backgroundColor: edit.color }}
          aria-hidden
        />
      ))}
      {design.edits.length > shown.length && (
        <span className="ml-1 text-xs text-muted-foreground">+{design.edits.length - shown.length}</span>
      )}
    </div>
  )
}

/**
 * Asks for a new name and saves it, keeping the colors.
 * @param props.design - The design.
 * @param props.open - Whether the dialog is shown.
 * @param props.onOpenChange - Shows or hides it.
 */
function RenameDialog({ design, open, onOpenChange }: { design: Design; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The dialog drops its content once closed, so the field starts from the current name on every open. */}
        <RenameForm design={design} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * The name field and buttons of {@link RenameDialog}.
 * @param props.design - The design.
 * @param props.onDone - Closes the dialog (after saving, or on Cancel).
 */
function RenameForm({ design, onDone }: { design: Design; onDone: () => void }) {
  const update = useUpdateDesign()
  const [name, setName] = useState(design.name)
  const id = useId()

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    update.mutate(
      { id: design.id, name: name.trim(), edits: design.edits },
      {
        onSuccess: () => {
          onDone()
          toast.success("Design renamed")
        },
      },
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Rename design</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_DESIGN_NAME}
          autoFocus
          aria-invalid={update.isError}
        />
        {update.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(update.error)}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={name.trim().length === 0 || update.isPending}>
          {update.isPending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Confirms, then deletes the design. The room stays.
 * @param props.design - The design.
 * @param props.open - Whether the dialog is shown.
 * @param props.onOpenChange - Shows or hides it.
 */
function DeleteDialog({ design, open, onOpenChange }: { design: Design; open: boolean; onOpenChange: (open: boolean) => void }) {
  const remove = useDeleteDesign()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{design.name}”?</DialogTitle>
          <DialogDescription>The design's colors are deleted. The room and its photo stay in My rooms.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(design.id, {
                onSuccess: () => {
                  onOpenChange(false)
                  toast.success("Design deleted")
                },
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            {remove.isPending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A centered icon, title, text and button, for empty and error states.
 * @param props.icon - The icon.
 * @param props.title - The headline.
 * @param props.text - The explanation.
 * @param props.action - The button to offer.
 */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof LayoutGridIcon
  title: string
  text: string
  action: React.ReactNode
}) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  )
}
