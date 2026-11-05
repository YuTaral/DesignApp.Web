import { MousePointerClickIcon, PipetteIcon, RotateCcwIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { Room } from "@/features/rooms/types"
import { DEFAULT_STRENGTH, useEditorStore } from "./editor-store"

/** Paint-like colors offered for every object: warm neutrals, earthy tones and a few deep accents. */
const SWATCHES = [
  "#F4F1EA", "#E8DCC8", "#D8C3A5", "#C9A27E", "#B5543C", "#8C3B2E",
  "#D9C27A", "#A8B89A", "#7D8B6A", "#4F6B3A", "#9DB4C0", "#4A6274",
  "#2E4057", "#6E5A7E", "#8A8580", "#2F2C2A",
]

/**
 * The inspector's Color section: recolors the selected object with a swatch or any color, sets how
 * strongly, and resets it. Without a selection it explains how to pick an object.
 * @param props.room - The room being edited.
 */
export function ColorPanel({ room }: { room: Room }) {
  const { selected, edits, setColor, previewStrength, commitStrength, resetObject } = useEditorStore()
  const object = room.objects.find((o) => o.index === selected)
  const edit = selected ? edits[selected] : undefined

  if (!object) {
    return (
      <div className="space-y-2">
        <h2 className="font-medium">Color</h2>
        <p className="flex gap-2 text-sm text-muted-foreground">
          <MousePointerClickIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          Click an object in the photo, or pick one from the list, to change its color.
        </p>
      </div>
    )
  }

  const current = edit?.color ?? object.dominantColor
  const strength = edit?.strength ?? DEFAULT_STRENGTH

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate font-medium first-letter:uppercase">{object.label}</h2>
        <Button variant="ghost" size="sm" disabled={!edit} onClick={() => resetObject(object.index)}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset
        </Button>
      </div>

      <div role="radiogroup" aria-label={`Color for ${object.label}`} className="grid grid-cols-[repeat(8,1.75rem)] justify-between gap-y-2">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={edit?.color === color}
            aria-label={`Color ${color}`}
            onClick={() => setColor(object.index, color)}
            className={cn(
              "aspect-square rounded-lg border shadow-soft outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50",
              edit?.color === color && "ring-2 ring-primary ring-offset-2 ring-offset-card"
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <label className="flex items-center gap-3 text-sm">
        <span className="relative size-9 shrink-0 overflow-hidden rounded-lg border shadow-soft" style={{ backgroundColor: current }}>
          <input
            type="color"
            value={current.toLowerCase()}
            onChange={(event) => setColor(object.index, event.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label="Any color"
          />
        </span>
        <span className="flex items-center gap-1.5">
          <PipetteIcon className="size-4 text-muted-foreground" aria-hidden />
          Any color
        </span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{current}</span>
      </label>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Strength</span>
          <span className="text-muted-foreground tabular-nums">{Math.round(strength * 100)}%</span>
        </div>
        <Slider
          value={[Math.round(strength * 100)]}
          max={100}
          step={1}
          disabled={!edit}
          aria-label="Recolor strength"
          onValueChange={([value]) => previewStrength(object.index, value / 100)}
          onValueCommit={commitStrength}
        />
      </div>
    </div>
  )
}
