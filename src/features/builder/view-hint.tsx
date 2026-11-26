import { useState } from "react"
import { InfoIcon } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { InspectorFocus } from "./inspector"

/** How each view works, as its info icon says. */
const VIEW_HINTS: Record<InspectorFocus, string> = {
  plan: "Click an object on the plan to change it. Drag objects from the left to add them. Click a wall to open it, add windows, doors and things to hang, and look at it in the photo. Ctrl+C and Ctrl+V copy an object, Delete removes it.",
  shape: "Drag a wall to push or pull it, or a corner to move the two walls that meet there. Done shaping goes back to the objects.",
  wall: "Click a window, door or hung thing to change it. Drag them from the left onto the wall. Each wall can have its own finish and color, and areas in another. Ctrl+C and Ctrl+V copy one, Delete removes it.",
  ceiling: "The ceiling's color and its lights: add one here, then drag it on the plan over what it lights. The 3D view shows them lit as the photo will.",
  "3d": "The room as the photo sees it. Pick the wall and the camera's place under the view; the room's walls, floor and light are here.",
}

/**
 * A blue "i" by the view's tabs that says how the view works: shown on hover and keyboard focus, and on a click or tap
 * (a phone has no hover), until the pointer leaves or a tap lands elsewhere.
 * @param props.focus - The view shown (the plan while its shape is edited counts as its own).
 */
export function ViewHint({ focus }: { focus: InspectorFocus }) {
  const [open, setOpen] = useState(false)

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="How this view works"
          className="inline-flex size-8 items-center justify-center rounded-full text-blue-500 outline-none hover:bg-blue-500/10 focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-blue-400"
          onClick={(event) => {
            // The tooltip itself would close on a click; a tap is the phone's way to open it.
            event.preventDefault()
            setOpen(true)
          }}
          data-view-hint={focus}
        >
          <InfoIcon className="size-5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" collisionPadding={8} className="max-w-sm text-sm leading-snug" data-view-hint-text>
        {VIEW_HINTS[focus]}
      </TooltipContent>
    </Tooltip>
  )
}
