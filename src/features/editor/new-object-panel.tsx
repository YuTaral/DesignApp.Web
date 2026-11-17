import { useState } from "react"
import { BrushIcon, EraserIcon, LoaderCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Room } from "@/features/rooms/types"
import { BrushShapeControl } from "./brush-shape-control"
import { BrushSizeControl } from "./brush-size-control"
import { useEditorStore } from "./editor-store"
import { shapeGesture } from "./shape-gesture"
import { useNewObject } from "./use-new-object"
import { CATEGORY_NAMES, LIMITS, OBJECT_CATEGORY, type ObjectCategory, OUTLINE_BRUSH_MODE, STROKE_SHAPE } from "@/lib/constants"

/**
 * The inspector while the user marks an object the AI missed: Mark and Unmark, the brush, box or lasso, the brush size, the
 * object's name and type, and Save or Cancel. Nothing is saved until Save; then the marked pixels become a new
 * object, selected for recoloring, as one undo step.
 * @param props.room - The room being edited (Ready).
 */
export function NewObjectPanel({ room }: { room: Room }) {
  const { markTool, setMarkTool, markPixels, markStrokes, stopMarking, brushShape } = useEditorStore()
  const { save, saving } = useNewObject(room)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<ObjectCategory>(OBJECT_CATEGORY.Other)
  const full = markStrokes.length >= LIMITS.mark.maxStrokes
  const canSave = markPixels > 0 && name.trim().length > 0 && !saving

  return (
    <form
      className="space-y-4"
      aria-label="New object"
      onSubmit={(event) => {
        event.preventDefault()

        if (canSave) {
          void save(name.trim(), category)
        }
      }}
    >
      <div>
        <h2 className="font-medium">New object</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {full
            ? "That's as many strokes as one object can have. Save it, or cancel and start again."
            : markTool === OUTLINE_BRUSH_MODE.Paint
              ? `${shapeGesture(brushShape)} the photo to mark the object the AI missed.`
              : `${shapeGesture(brushShape)} the photo where the mark covers something else.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={markTool === OUTLINE_BRUSH_MODE.Paint ? "default" : "outline"}
          aria-pressed={markTool === OUTLINE_BRUSH_MODE.Paint}
          onClick={() => setMarkTool(OUTLINE_BRUSH_MODE.Paint)}
        >
          <BrushIcon data-icon="inline-start" />
          Mark
        </Button>
        <Button
          type="button"
          variant={markTool === OUTLINE_BRUSH_MODE.Erase ? "default" : "outline"}
          aria-pressed={markTool === OUTLINE_BRUSH_MODE.Erase}
          disabled={markPixels === 0}
          onClick={() => setMarkTool(OUTLINE_BRUSH_MODE.Erase)}
        >
          <EraserIcon data-icon="inline-start" />
          Unmark
        </Button>
      </div>

      <BrushShapeControl />
      {brushShape === STROKE_SHAPE.Brush && <BrushSizeControl />}

      <div className="space-y-1.5">
        <Label htmlFor="new-object-name">Name</Label>
        <Input
          id="new-object-name"
          value={name}
          maxLength={LIMITS.mark.nameLength}
          placeholder="Such as floor lamp"
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-object-type">Type</Label>
        <select
          id="new-object-type"
          value={category}
          onChange={(event) => setCategory(event.target.value as ObjectCategory)}
          className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm dark:bg-input/30"
        >
          {Object.values(OBJECT_CATEGORY).map((value) => (
            <option key={value} value={value}>
              {CATEGORY_NAMES[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={stopMarking}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {saving && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
          Save
        </Button>
      </div>
      {markPixels === 0 && <p className="text-xs text-muted-foreground">Mark part of the photo to save it.</p>}
    </form>
  )
}
