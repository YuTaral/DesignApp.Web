import { BrushIcon, EraserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Room } from "@/features/rooms/types"
import { BrushShapeControl } from "./brush-shape-control"
import { BrushSizeControl } from "./brush-size-control"
import { useEditorStore } from "./editor-store"
import { shapeGesture } from "./shape-gesture"
import { OUTLINE_BRUSH_MODE, STROKE_SHAPE } from "@/lib/constants"

/**
 * The "Fix outline" bar under the photo for the selected object: Add and Erase turn on the tool, then a drag on
 * the photo marks exactly the pixels it covers: under a round brush, inside a box, or inside a lasso drawn around
 * an area. The size sets the brush on screen, so zooming in gives finer control. On a wide screen the tools sit
 * side by side across the photo's width; on a narrow one they stack. In the Parts dialog's column they always stack.
 * @param props.room - The room being edited.
 * @param props.stacked - Stacks the tools, for a narrow column (the Parts dialog).
 */
export function OutlinePanel({ room, stacked = false }: { room: Room; stacked?: boolean }) {
  const { selected, outlineTool, setOutlineTool, brushShape } = useEditorStore()
  const object = room.objects.find((o) => o.index === selected)
  if (!object) return null
  const brush = brushShape === STROKE_SHAPE.Brush

  return (
    <section
      aria-label="Fix outline"
      className={stacked ? "space-y-3" : "shrink-0 space-y-3 rounded-2xl border bg-card px-4 py-3 shadow-soft"}
      data-outline-panel
    >
      <p className="text-sm text-muted-foreground">
        <span className="mr-2 text-base font-medium text-foreground">Fix outline</span>
        {outlineTool === OUTLINE_BRUSH_MODE.Paint
          ? `${shapeGesture(brushShape)} the photo where the ${object.label} is missing.`
          : outlineTool === OUTLINE_BRUSH_MODE.Erase
            ? `${shapeGesture(brushShape)} the photo where the ${object.label} is marked by mistake.`
            : "If the color misses part of it or spills over, brush the outline here."}
        {brush && " Zoom in for fine edges."}
      </p>
      <div className={stacked ? "grid gap-3" : "grid gap-3 sm:grid-cols-[13rem_16rem] md:grid-cols-[13rem_16rem_minmax(12rem,1fr)] md:items-center"}>
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
        {brush && (
          <div className={stacked ? undefined : "sm:col-span-2 md:col-span-1"}>
            <BrushSizeControl inline />
          </div>
        )}
      </div>
    </section>
  )
}
