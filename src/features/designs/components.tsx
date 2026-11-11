import { useId, useState, type FormEvent, type ReactNode } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { apiUrl, errorMessage } from "@/lib/api"
import { useDeleteDesign, useEditDesign, type Design, type DesignEdit } from "./api"
import { roomCount } from "./format"
import { LIMITS, MESSAGES } from "@/lib/constants"

/**
 * A room's colors as small dots, or a note when it has none.
 * @param props.edits - The room's colors.
 */
export function Swatches({ edits }: { edits: DesignEdit[] }) {
  if (edits.length === 0) return <p className="text-xs text-muted-foreground">No colors yet</p>
  const shown = edits.slice(0, 8)
  return (
    <div className="flex items-center gap-1" aria-label={`${edits.length} recolored ${edits.length === 1 ? "object" : "objects"}`}>
      {shown.map((edit) => (
        <span
          key={edit.objectIndex}
          className="size-4 rounded-full border border-foreground/10"
          style={{ backgroundColor: edit.color }}
          aria-hidden
        />
      ))}
      {edits.length > shown.length && <span className="ml-1 text-xs text-muted-foreground">+{edits.length - shown.length}</span>}
    </div>
  )
}

/**
 * A design's rooms as one picture: the photo of a single room, or up to four in a grid.
 * @param props.design - The design.
 */
export function DesignCover({ design }: { design: Design }) {
  const photos = design.rooms.slice(0, 4)
  return (
    <div className={photos.length > 1 ? "grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 bg-border" : "aspect-[4/3]"}>
      {photos.map((room, i) => (
        <img
          key={room.roomId}
          src={apiUrl(room.photoUrl)}
          alt=""
          loading="lazy"
          className={
            "h-full w-full bg-muted object-cover" +
            // Three photos: the first fills the left column.
            (photos.length === 3 && i === 0 ? " row-span-2" : "") +
            (photos.length === 2 ? " row-span-2" : "")
          }
        />
      ))}
    </div>
  )
}

/**
 * Edits a design's name and description.
 * @param props.design - The design.
 * @param props.open - Whether the dialog is shown.
 * @param props.onOpenChange - Shows or hides it.
 */
export function DesignDetailsDialog({ design, open, onOpenChange }: { design: Design; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The dialog drops its content once closed, so the fields start from the design on every open. */}
        <DesignDetailsForm design={design} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * The fields and buttons of {@link DesignDetailsDialog}.
 * @param props.design - The design.
 * @param props.onDone - Closes the dialog (after saving, or on Cancel).
 */
function DesignDetailsForm({ design, onDone }: { design: Design; onDone: () => void }) {
  const edit = useEditDesign()
  const [name, setName] = useState(design.name)
  const [description, setDescription] = useState(design.description)
  const id = useId()

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    edit.mutate(
      { id: design.id, name: name.trim(), description: description.trim() },
      {
        onSuccess: () => {
          onDone()
          toast.success(MESSAGES.designUpdated)
        },
      },
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Edit design</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.design.name}
          autoFocus
          aria-invalid={edit.isError}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-description`}>
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={`${id}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={LIMITS.design.description}
          rows={3}
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {description.length}/{LIMITS.design.description}
        </p>
      </div>
      {edit.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(edit.error)}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={name.trim().length === 0 || edit.isPending}>
          {edit.isPending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Confirms, then deletes the design with all its rooms.
 * @param props.design - The design.
 * @param props.open - Whether the dialog is shown.
 * @param props.onOpenChange - Shows or hides it.
 * @param props.onDeleted - Called once it is deleted (to leave its page, say).
 */
export function DeleteDesignDialog({
  design,
  open,
  onOpenChange,
  onDeleted,
}: {
  design: Design
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const remove = useDeleteDesign()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={MESSAGES.deleteDesignTitle(design.name)}
      text={MESSAGES.deleteDesignText(roomCount(design.rooms.length))}
      action="Delete design"
      pending={remove.isPending}
      onConfirm={() => {
        remove.mutate(design.id, {
          onSuccess: () => {
            onOpenChange(false)
            toast.success(MESSAGES.designDeleted)
            onDeleted?.()
          },
          onError: (error) => toast.error(errorMessage(error)),
        })
      }}
    />
  )
}

/**
 * A dialog that asks before a destructive action.
 * @param props.open - Whether it is shown.
 * @param props.onOpenChange - Shows or hides it.
 * @param props.title - The question.
 * @param props.text - What will happen.
 * @param props.action - The confirming button's label.
 * @param props.pending - Whether the action is running.
 * @param props.onConfirm - Runs the action.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  action,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  text: ReactNode
  action: string
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
            {action}
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
  icon: typeof LoaderCircleIcon
  title: string
  text: string
  action: ReactNode
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
