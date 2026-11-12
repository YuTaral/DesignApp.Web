import { useMemo, useState } from "react"
import { LoaderCircleIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { BoundingBox, DetectedObject, Room } from "@/features/rooms/types"
import { useEditorStore } from "./editor-store"
import { useRemoveObject } from "./use-remove-object"
import { AI_MODE, LIMITS, SURFACE_CATEGORIES } from "@/lib/constants"

/**
 * The inspector's "Remove from photo" section for the selected object: the room's AI fills the object with what is
 * behind it, as one undo step. Objects that lie on it (the cushions and throw on a sofa, the bedding on a bed) are
 * offered too, ticked, so they go in the same call instead of being left floating. Walls, floors and ceilings can
 * only be recolored, so they don't get it.
 * @param props.room - The room being edited.
 */
export function RemoveObjectPanel({ room }: { room: Room }) {
  const selected = useEditorStore((state) => state.selected)
  const object = room.objects.find((o) => o.index === selected)
  if (!object || SURFACE_CATEGORIES.includes(object.category)) return null
  // A new selection starts with all of its suggestions ticked.
  return <RemoveObjectSection key={object.index} room={room} object={object} />
}

/**
 * The section for one selected object.
 * @param props.room - The room being edited.
 * @param props.object - The selected object.
 */
function RemoveObjectSection({ room, object }: { room: Room; object: DetectedObject }) {
  const presentObjects = useEditorStore((state) => state.presentObjects)
  const { remove, removing } = useRemoveObject(room)
  const onIt = useMemo(
    () => room.objects.filter((o) => o.index !== object.index
      && !SURFACE_CATEGORIES.includes(o.category)
      && (presentObjects?.indexes.has(o.index) ?? true)
      && lies(o.box, object.box)),
    [room.objects, object, presentObjects]
  )
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set())
  const together = [object, ...onIt.filter((o) => !unticked.has(o.index))].slice(0, LIMITS.removal.maxObjects)

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-medium">Remove from photo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {removing
            ? `Removing the ${object.label}${together.length > 1 ? " and what's on it" : ""}. With the real AI this can take up to a minute or two.`
            : `Takes the ${object.label} out of the photo and fills in what's behind it.`}
          {room.aiMode === AI_MODE.Real && !removing && " Uses the real AI: about 4¢, and up to a minute or two."}
        </p>
      </div>

      {onIt.length > 0 && (
        <fieldset className="space-y-1.5" disabled={removing}>
          <legend className="text-sm">Also remove what's on it:</legend>
          {onIt.map((o) => (
            <label key={o.index} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={!unticked.has(o.index)}
                onChange={(event) => {
                  const next = new Set(unticked)
                  if (event.target.checked) next.delete(o.index)
                  else next.add(o.index)
                  setUnticked(next)
                }}
              />
              <span className="first-letter:uppercase">{o.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      <Button variant="outline" className="w-full" disabled={removing} onClick={() => void remove(together)}>
        {removing ? (
          <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Trash2Icon data-icon="inline-start" />
        )}
        {removing ? "Removing…" : together.length === 1 ? "Remove object" : `Remove ${together.length} objects`}
      </Button>
    </div>
  )
}

/**
 * Whether an object lies on another: most of its box is inside the other's box, and it is the smaller of the two.
 * @param inner - The box of the object that may lie on the other.
 * @param outer - The box of the selected object.
 */
function lies(inner: BoundingBox, outer: BoundingBox) {
  const width = Math.min(inner.x + inner.width, outer.x + outer.width) - Math.max(inner.x, outer.x)
  const height = Math.min(inner.y + inner.height, outer.y + outer.height) - Math.max(inner.y, outer.y)
  const area = inner.width * inner.height
  if (width <= 0 || height <= 0 || area <= 0 || area >= outer.width * outer.height) return false
  return (width * height) / area >= LIMITS.removal.onItShare
}
