import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { CopyPlusIcon, RefreshCwIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ROUTES } from "@/lib/constants"

/** What the photos generated after editing a room in 3D do: replace the room, or make a new one. */
type NewPhotos = "replace" | "add"

/**
 * Asks, before a design's room is opened in the room builder, what the photos generated there will do: replace the
 * room (its photos and colors are deleted, and the new room takes its place in the design), or go into a new room
 * beside it. Changes to the 3D room itself are saved either way.
 * @param props.open - Whether it is shown.
 * @param props.onOpenChange - Shows or hides it.
 * @param props.planId - The room's plan.
 * @param props.roomId - The room.
 * @param props.label - The room's name on the design's page, such as "Room 2".
 * @param props.canAdd - Whether the design has space for another room.
 */
export function EditPlanDialog({
  open,
  onOpenChange,
  planId,
  roomId,
  label,
  canAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  roomId: string
  label: string
  canAdd: boolean
}) {
  const navigate = useNavigate()
  const [choice, setChoice] = useState<NewPhotos | null>(null)
  // Each opening starts with nothing picked (Replace deletes photos, so it is never picked for the user).
  const [shownOpen, setShownOpen] = useState(open)
  const options = [
    {
      value: "replace",
      icon: RefreshCwIcon,
      title: `Replace ${label}`,
      text: `The new photos take ${label}’s place in the design. Its current photos and colors are deleted.`,
      disabled: false,
    },
    {
      value: "add",
      icon: CopyPlusIcon,
      title: "Add a new room",
      text: canAdd ? `${label} stays as it is; the new photos become another room of the design.` : "This design is full: remove a room first.",
      disabled: !canAdd,
    },
  ] as const

  const open3d = () => {
    void navigate({ to: ROUTES.plan, params: { planId }, search: { replace: choice === "replace" ? roomId : undefined } })
  }

  if (shownOpen !== open) {
    setShownOpen(open)

    if (open) {
      setChoice(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-edit-plan-dialog>
        <DialogHeader>
          <DialogTitle>Edit {label} in 3D</DialogTitle>
          <DialogDescription>Your changes to the 3D room are saved as you go. When you generate photos afterwards:</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="New photos" className="grid gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={choice === option.value}
              disabled={option.disabled}
              data-new-photos={option.value}
              onClick={() => setChoice(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                choice === option.value ? "border-primary bg-accent/40" : "hover:bg-muted/60"
              )}
            >
              <option.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-xs text-muted-foreground">{option.text}</span>
              </span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={choice === null} onClick={open3d} data-open-builder>
            Open the room builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
