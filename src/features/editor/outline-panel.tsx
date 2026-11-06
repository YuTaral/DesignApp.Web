import { BrushIcon, EraserIcon, MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { Room } from "@/features/rooms/types"
import { useEditorStore } from "./editor-store"
import { LIMITS } from "@/lib/constants"

/**
 * The inspector's "Fix outline" section for the selected object: Add and Erase turn on a round
 * brush, then a click or a drag on the photo marks exactly the pixels it covers. The size sets the
 * brush on screen, so zooming in gives finer control.
 * @param props.room - The room being edited.
 */
export function OutlinePanel({ room }: { room: Room }) {
  const { selected, outlineTool, brushSize, setOutlineTool, setBrushSize } = useEditorStore()
  const object = room.objects.find((o) => o.index === selected)
  if (!object) return null

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-medium">Fix outline</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {outlineTool === "Paint"
            ? `Click or drag over the photo where the ${object.label} is missing.`
            : outlineTool === "Erase"
              ? `Click or drag over the photo where the ${object.label} is marked by mistake.`
              : "If the color misses part of it or spills over, brush the outline here."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={outlineTool === "Paint" ? "default" : "outline"}
          aria-pressed={outlineTool === "Paint"}
          onClick={() => setOutlineTool(outlineTool === "Paint" ? null : "Paint")}
        >
          <BrushIcon data-icon="inline-start" />
          Add
        </Button>
        <Button
          variant={outlineTool === "Erase" ? "default" : "outline"}
          aria-pressed={outlineTool === "Erase"}
          onClick={() => setOutlineTool(outlineTool === "Erase" ? null : "Erase")}
        >
          <EraserIcon data-icon="inline-start" />
          Erase
        </Button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Brush size</span>
          <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
            <span
              aria-hidden
              className="inline-block rounded-full border border-foreground/60"
              style={{ width: Math.min(24, Math.max(4, brushSize / 3)), height: Math.min(24, Math.max(4, brushSize / 3)) }}
            />
            {brushSize} px
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Smaller brush"
            disabled={brushSize <= LIMITS.brushSizes.min}
            onClick={() => setBrushSize(brushSize - 1)}
          >
            <MinusIcon />
          </Button>
          <Slider
            className="flex-1"
            value={[brushSize]}
            min={LIMITS.brushSizes.min}
            max={LIMITS.brushSizes.max}
            step={1}
            aria-label="Brush size"
            onValueChange={([value]) => setBrushSize(value)}
          />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Bigger brush"
            disabled={brushSize >= LIMITS.brushSizes.max}
            onClick={() => setBrushSize(brushSize + 1)}
          >
            <PlusIcon />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Zoom in for fine edges.</p>
      </div>
    </div>
  )
}
