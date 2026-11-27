import { useEffect, useRef } from "react"
import { cn } from "cn"

import { BUILDER, FLOOR_MATERIALS, FLOOR_TYPE, FLOOR_TYPE_NAMES, type FloorType } from "@/lib/constants"
import { ChoiceChips } from "./choice-chips"
import { ColorChoice } from "./fields"
import { paintFloor } from "./floor-texture"

/**
 * What the floor is made of within its type, as chips: Any (not said), then the type's species, stones or kinds.
 * @param props.type - The floor's type.
 * @param props.value - Its material; empty for any.
 * @param props.onPick - Picks one; empty for any.
 */
export function FloorMaterialChoice({ type, value, onPick }: { type: FloorType; value: string; onPick: (material: string) => void }) {
  const chips = [{ value: BUILDER.none, name: "Any" }, ...FLOOR_MATERIALS[type].map((name) => ({ value: name, name }))]

  return (
    <ChoiceChips
      label="Material"
      chips={chips}
      value={value || BUILDER.none}
      onPick={(picked) => onPick(picked === BUILDER.none ? "" : picked)}
      attribute="floor-material"
    />
  )
}

/**
 * The floor types as tiles, each showing its pattern in the floor's color.
 * @param props.value - The floor type chosen.
 * @param props.color - The floor's color.
 * @param props.onPick - Takes a floor type.
 * @param props.className - Extra classes for the grid.
 */
export function FloorChoice({ value, color, onPick, className }: { value: FloorType; color: string; onPick: (type: FloorType) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Floor type" className={cn("grid grid-cols-4 gap-2", className)}>
      {Object.values(FLOOR_TYPE).map((type) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={value === type}
          data-floor-type={type}
          onClick={() => onPick(type)}
          className={cn(
            "grid content-start gap-1 rounded-lg border p-1 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
            value === type && "border-primary bg-accent text-accent-foreground ring-1 ring-primary hover:bg-accent"
          )}
        >
          <FloorSwatch type={type} color={color} />
          {/* Long names ("Wooden planks") wrap onto a second line rather than being cut off. */}
          <span className="leading-tight text-balance">{FLOOR_TYPE_NAMES[type]}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The floor's color: the usual colors of its type, each drawn in the floor's pattern, or any other.
 * @param props.type - The floor type.
 * @param props.value - The floor's color.
 * @param props.onPick - Takes a color.
 */
export function FloorColorChoice({ type, value, onPick }: { type: FloorType; value: string; onPick: (color: string) => void }) {
  return (
    <ColorChoice label="Floor color" value={value} colors={BUILDER.floorColors[type]} onPick={onPick} swatch={(color) => <FloorSwatch type={type} color={color} />} />
  )
}

/**
 * A small square of a floor's pattern.
 * @param props.type - The floor type.
 * @param props.color - The floor's color.
 */
function FloorSwatch({ type, color }: { type: FloorType; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const context = ref.current?.getContext("2d")

    if (context) {
      paintFloor(context, type, color, 128)
    }
  }, [type, color])

  return <canvas ref={ref} width={128} height={128} className="block aspect-square w-full rounded-md" aria-hidden />
}
