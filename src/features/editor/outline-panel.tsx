import { BrushIcon, EraserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Room } from "@/features/rooms/types"
import { BrushSizeControl } from "./brush-size-control"
import { useEditorStore } from "./editor-store"
import { OUTLINE_BRUSH_MODE } from "@/lib/constants"

/**
 * The inspector's "Fix outline" section for the selected object: Add and Erase turn on a round
 * brush, then a click or a drag on the photo marks exactly the pixels it covers. The size sets the
 * brush on screen, so zooming in gives finer control.
 * @param props.room - The room being edited.
 */
export function OutlinePanel({ room }: { room: Room }) {
  const { selected, outlineTool, setOutlineTool } = useEditorStore()
  const object = room.objects.find((o) => o.index === selected)
  if (!object) return null

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-medium">Fix outline</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {outlineTool === OUTLINE_BRUSH_MODE.Paint
            ? `Click or drag over the photo where the ${object.label} is missing.`
            : outlineTool === OUTLINE_BRUSH_MODE.Erase
              ? `Click or drag over the photo where the ${object.label} is marked by mistake.`
              : "If the color misses part of it or spills over, brush the outline here."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={outlineTool === OUTLINE_BRUSH_MODE.Paint ? "default" : "outline"}
          aria-pressed={outlineTool === OUTLINE_BRUSH_MODE.Paint}
          onClick={() => setOutlineTool(outlineTool === OUTLINE_BRUSH_MODE.Paint ? null : OUTLINE_BRUSH_MODE.Paint)}
        >
          <BrushIcon data-icon="inline-start" />
          Add
        </Button>
        <Button
          variant={outlineTool === OUTLINE_BRUSH_MODE.Erase ? "default" : "outline"}
          aria-pressed={outlineTool === OUTLINE_BRUSH_MODE.Erase}
          onClick={() => setOutlineTool(outlineTool === OUTLINE_BRUSH_MODE.Erase ? null : OUTLINE_BRUSH_MODE.Erase)}
        >
          <EraserIcon data-icon="inline-start" />
          Erase
        </Button>
      </div>
      <BrushSizeControl />
    </div>
  )
}
