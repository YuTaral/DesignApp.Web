import { BrushIcon, EraserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Room } from "@/features/rooms/types"
import { BrushShapeControl } from "./brush-shape-control"
import { BrushSizeControl } from "./brush-size-control"
import { useEditorStore } from "./editor-store"
import { shapeGesture } from "./shape-gesture"
import { OUTLINE_BRUSH_MODE, STROKE_SHAPE } from "@/lib/constants"

/**
 * The inspector's "Fix outline" section for the selected object: Add and Erase turn on the tool, then a drag on
 * the photo marks exactly the pixels it covers: under a round brush, inside a box, or inside a lasso drawn around
 * an area. The size sets the brush on screen, so zooming in gives finer control.
 * @param props.room - The room being edited.
 */
export function OutlinePanel({ room }: { room: Room }) {
  const { selected, outlineTool, setOutlineTool, brushShape } = useEditorStore()
  const object = room.objects.find((o) => o.index === selected)
  if (!object) return null

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-medium">Fix outline</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {outlineTool === OUTLINE_BRUSH_MODE.Paint
            ? `${shapeGesture(brushShape)} the photo where the ${object.label} is missing.`
            : outlineTool === OUTLINE_BRUSH_MODE.Erase
              ? `${shapeGesture(brushShape)} the photo where the ${object.label} is marked by mistake.`
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
      <BrushShapeControl />
      {brushShape === STROKE_SHAPE.Brush && <BrushSizeControl />}
    </div>
  )
}
