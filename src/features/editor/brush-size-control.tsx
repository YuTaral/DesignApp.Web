import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { useEditorStore } from "./editor-store"
import { LIMITS } from "@/lib/constants"

/**
 * The brush size: a slider with smaller and bigger buttons and a dot of the size. The size is on screen, so
 * zooming in gives finer control. Shared by fixing outlines and marking a new object.
 * @param props.inline - Puts the label, the slider and the size on one line without the zoom hint, for the
 *   outline bar under the photo.
 */
export function BrushSizeControl({ inline = false }: { inline?: boolean }) {
  const { brushSize, setBrushSize } = useEditorStore()

  const size = (
    <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground tabular-nums">
      <span
        aria-hidden
        className="inline-block rounded-full border border-foreground/60"
        style={{ width: Math.min(24, Math.max(4, brushSize / 3)), height: Math.min(24, Math.max(4, brushSize / 3)) }}
      />
      {brushSize} px
    </span>
  )
  const slider = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
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
  )

  if (inline) {
    return (
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm">Size</span>
        {slider}
        {size}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>Brush size</span>
        {size}
      </div>
      {slider}
      <p className="text-xs text-muted-foreground">Zoom in for fine edges.</p>
    </div>
  )
}
