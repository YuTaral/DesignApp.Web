import { PencilIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { Design } from "@/features/designs/api"
import { roomCount } from "@/features/designs/format"
import { LIMITS } from "@/lib/constants"
import type { NewDesign } from "./api"

/** The picker's value for a new design. */
const NEW = "new"

/**
 * Which design a room about to be built goes into, which the user must choose: one of their designs (a full one can't
 * be picked), or a new one, asked for in a dialog.
 * @param props.designs - The user's designs.
 * @param props.designId - The design chosen, if any.
 * @param props.newDesign - The new design chosen, if any.
 * @param props.onPick - Takes one of the user's designs.
 * @param props.onNew - Asks for a new design (or changes the one typed).
 */
export function DesignPicker({
  designs,
  designId,
  newDesign,
  onPick,
  onNew,
}: {
  designs: Design[]
  designId?: string
  newDesign?: NewDesign
  onPick: (designId: string) => void
  onNew: () => void
}) {
  const value = designId ?? (newDesign ? NEW : "")

  return (
    <div className="space-y-1.5" data-design-picker>
      <Label htmlFor="build-design" className="font-medium">
        Design
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="build-design"
          value={value}
          onChange={(event) => (event.target.value === NEW ? onNew() : onPick(event.target.value))}
          className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-sm"
          data-design-select
        >
          <option value="" disabled>
            Choose the design the room goes into
          </option>
          {designs.map((design) => {
            const full = design.rooms.length >= LIMITS.design.rooms

            return (
              <option key={design.id} value={design.id} disabled={full}>
                {design.name} ({full ? "full" : roomCount(design.rooms.length)})
              </option>
            )
          })}
          <option value={NEW}>{newDesign ? `New: ${newDesign.name}` : "+ New design\u2026"}</option>
        </select>
        {newDesign && value === NEW && (
          <Button type="button" variant="ghost" size="sm" onClick={onNew}>
            <PencilIcon data-icon="inline-start" />
            Change
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">The room's photos go into this design.</p>
    </div>
  )
}
