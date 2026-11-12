import { BrushIcon, LassoIcon, SquareDashedIcon, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useEditorStore } from "./editor-store"
import { STROKE_SHAPE, type StrokeShape } from "@/lib/constants"

const SHAPES: { shape: StrokeShape; label: string; icon: LucideIcon }[] = [
  { shape: STROKE_SHAPE.Brush, label: "Brush", icon: BrushIcon },
  { shape: STROKE_SHAPE.Box, label: "Box", icon: SquareDashedIcon },
  { shape: STROKE_SHAPE.Lasso, label: "Lasso", icon: LassoIcon },
]

/**
 * What a drag on the photo covers: the round brush along it, a box from corner to corner, or the inside of a lasso
 * drawn around an area. Shared by fixing outlines and marking a new object.
 */
export function BrushShapeControl() {
  const { brushShape, setBrushShape } = useEditorStore()

  return (
    <div role="group" aria-label="Brush shape" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {SHAPES.map(({ shape, label, icon: Icon }) => (
        <Button
          key={shape}
          type="button"
          size="sm"
          variant={brushShape === shape ? "secondary" : "ghost"}
          className={brushShape === shape ? "bg-background shadow-xs hover:bg-background" : undefined}
          aria-pressed={brushShape === shape}
          onClick={() => setBrushShape(shape)}
        >
          <Icon data-icon="inline-start" />
          {label}
        </Button>
      ))}
    </div>
  )
}

