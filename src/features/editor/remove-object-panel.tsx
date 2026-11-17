import { useMemo, useState } from "react"
import { LoaderCircleIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { DetectedObject, Room } from "@/features/rooms/types"
import { useEditorStore } from "./editor-store"
import { useRemoveObject } from "./use-remove-object"
import { AI_MODE, LIMITS, RESTING_CATEGORIES, SURFACE_CATEGORIES } from "@/lib/constants"

/**
 * The inspector's "Remove from photo" section for the selected object: the room's AI fills the object with what is
 * behind it, as one undo step. Objects that rest on it (the cushions and throw on a sofa, the vase on a table, and
 * anything resting on those) are offered too, ticked, so they go in the same call instead of being left floating. Walls, floors and ceilings can
 * only be recolored, so they don't get it.
 * @param props.room - The room being edited.
 */
export function RemoveObjectPanel({ room }: { room: Room }) {
  const selected = useEditorStore((state) => state.selected)
  const object = room.objects.find((o) => o.index === selected)

  // A part is merged back into its object instead (in the Parts dialog).
  if (!object || SURFACE_CATEGORIES.includes(object.category) || object.parentIndex) {
    return null
  }

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
  const onIt = useMemo(() => {
    const restsOn = presentObjects?.restsOn

    if (!restsOn) {
      return []
    }

    // Everything resting on the object, and on what rests on it (a bowl on a tray on a table).
    const found = new Set<number>()
    const queue = [object.index]

    while (queue.length > 0) {
      const below = queue.shift()!

      for (const [index, support] of restsOn) {
        if (support !== below || index === object.index || found.has(index)) {
          continue
        }

        found.add(index)
        queue.push(index)
      }
    }

    // Only things that sit on furniture (textiles, decor, lamps); the search above still passes through the others,
    // so the vase on an island's countertop is found when the island is picked.
    return room.objects.filter((o) => found.has(o.index) && RESTING_CATEGORIES.includes(o.category) && presentObjects.indexes.has(o.index))
  }, [room.objects, object, presentObjects])
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

                  if (event.target.checked) {
                    next.delete(o.index)
                  } else {
                    next.add(o.index)
                  }

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

