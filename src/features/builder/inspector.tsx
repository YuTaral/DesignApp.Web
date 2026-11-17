import { useState } from "react"
import { MousePointerClickIcon, RotateCwIcon, SquareIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BUILDER, ITEM_FORM, ITEM_SHAPE, ROOM_TYPE_NAMES, SWATCHES, VIEW_CORNER } from "@/lib/constants"
import { useCatalog, type Plan } from "./api"
import { DecorationChoice } from "./decoration-choice"
import { hasParts, isMountedShape, isWallItem, partsOf, toVariation, useBuilderStore, variationOf } from "./builder-store"
import { wallLength } from "./room-outline"
import { FloorChoice } from "./floor-choice"
import { CornerChoice } from "./corner-choice"
import { WallChoice } from "./wall-choice"

/**
 * The right column: the selected object's variation, name, size, turn and color (a window's or door's wall and place on it), or,
 * with nothing selected, the room's name, walls, colors, floor and the wall the photo looks at.
 * @param props.plan - The room being built.
 */
export function Inspector({ plan }: { plan: Plan }) {
  const selected = useBuilderStore((state) => state.selected)
  const item = plan.items[selected]

  if (!item) {
    return <RoomInspector plan={plan} />
  }

  return isWallItem(item) ? <WallItemInspector plan={plan} index={selected} /> : <ItemInspector plan={plan} index={selected} />
}

/**
 * The selected window's, door's or hung object's settings: its wall, its exact place (from the wall's left corner, and
 * a window's or hung object's height above the floor), its size (and how far a hung object sticks out) and color.
 * @param props.plan - The room.
 * @param props.index - Its position in the plan's objects.
 */
function WallItemInspector({ plan, index }: { plan: Plan; index: number }) {
  const { update, remove } = useBuilderStore()
  const item = plan.items[index]
  const wall = item.wall!
  const [length, ceiling] = [wallLength(plan, wall), plan.height * 100]
  const isWindow = item.shape === ITEM_SHAPE.Window
  const hung = isMountedShape(item.shape)

  return (
    <div className="space-y-5" data-inspector-item={index} data-inspector-opening>
      <div className="space-y-1.5">
        <Label htmlFor="item-label">Name</Label>
        <Input id="item-label" value={item.label} maxLength={BUILDER.labelLength} onChange={(event) => update(index, { label: event.target.value })} />
      </div>
      <VariationChoice plan={plan} index={index} />
      <ItemDecorations plan={plan} index={index} />
      <div className="space-y-2">
        <p className="text-sm font-medium">On the wall</p>
        <WallChoice plan={plan} value={wall} label="Wall" onPick={(next) => update(index, { wall: next, x: Math.min(item.x, wallLength(plan, next) - item.width / 2) })} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Place (cm)</legend>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="From left corner"
            value={Math.round(item.x - item.width / 2)}
            min={0}
            max={Math.max(0, Math.round(length - item.width))}
            onCommit={(left) => update(index, { x: left + item.width / 2 })}
          />
          {(isWindow || hung) && (
            <NumberField
              label="Above the floor"
              value={item.elevation}
              min={0}
              max={Math.max(0, Math.round(ceiling - item.height))}
              onCommit={(elevation) => update(index, { elevation })}
            />
          )}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Size (cm)</legend>
        <div className={cn("grid gap-2", hung ? "grid-cols-3" : "grid-cols-2")}>
          <NumberField label="Width" value={item.width} min={BUILDER.item.min} max={Math.round(length)} onCommit={(width) => update(index, { width })} />
          <NumberField label="Height" value={item.height} min={BUILDER.item.min} max={Math.round(ceiling)} onCommit={(height) => update(index, { height })} />
          {hung && <NumberField label="Sticks out" value={item.depth} min={BUILDER.item.min} max={BUILDER.maxMountedDepth} onCommit={(depth) => update(index, { depth })} />}
        </div>
      </fieldset>
      <ColorChoice
        label={hung ? "Color" : isWindow ? "Frame" : "Door"}
        value={item.color}
        colors={hung ? SWATCHES : BUILDER.frameColors}
        onPick={(color) => update(index, { color })}
      />
      <Button variant="outline" className="w-full" onClick={() => remove(index)}>
        <Trash2Icon data-icon="inline-start" />
        Delete
      </Button>
    </div>
  )
}

/**
 * The selected object's settings.
 * @param props.plan - The room.
 * @param props.index - The object's position in the plan's objects.
 */
function ItemInspector({ plan, index }: { plan: Plan; index: number }) {
  const { update, rotate, remove } = useBuilderStore()
  const item = plan.items[index]

  return (
    <div className="space-y-5" data-inspector-item={index}>
      <div className="space-y-1.5">
        <Label htmlFor="item-label">Name</Label>
        <Input id="item-label" value={item.label} maxLength={BUILDER.labelLength} onChange={(event) => update(index, { label: event.target.value })} />
      </div>
      <VariationChoice plan={plan} index={index} />
      <ItemDecorations plan={plan} index={index} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Size (cm)</legend>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Width" value={item.width} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(width) => update(index, { width })} />
          <NumberField label="Depth" value={item.depth} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(depth) => update(index, { depth })} />
          <NumberField label="Height" value={item.height} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(height) => update(index, { height })} />
        </div>
      </fieldset>
      {hasParts(item) && <PartFields plan={plan} index={index} />}
      <ColorChoice label="Color" value={item.color} colors={SWATCHES} onPick={(color) => update(index, { color })} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => rotate(index)}>
          <RotateCwIcon data-icon="inline-start" />
          Turn {item.rotation}°
        </Button>
        <Button variant="outline" onClick={() => remove(index)}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
      </div>
    </div>
  )
}

/**
 * The parts of a selected L- or P-shaped object, each resized on its own (also by its handle on the plan): the back
 * run's depth, the corner leg's width and a P's chaise. The width and depth above are the whole object's.
 * @param props.plan - The room.
 * @param props.index - The object's position in the plan's objects.
 */
function PartFields({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const item = plan.items[index]
  const parts = partsOf(item)!
  const min = BUILDER.minPart
  const isP = item.form === ITEM_FORM.PShaped
  const set = (change: Partial<typeof parts>) => update(index, { parts: { ...parts, ...change } })

  return (
    <fieldset className="space-y-2" data-part-fields>
      <legend className="text-sm font-medium">Parts (cm)</legend>
      <p className="text-xs text-muted-foreground">Resize each part here, or drag its round handle on the plan.</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Back run depth" value={parts.runDepth} min={min} max={Math.round(item.depth - min)} onCommit={(runDepth) => set({ runDepth })} />
        <NumberField label="Corner leg width" value={parts.legWidth} min={min} max={Math.round(item.width - min)} onCommit={(legWidth) => set({ legWidth })} />
        {isP && (
          <>
            <NumberField label="Chaise width" value={parts.chaiseWidth} min={parts.legWidth} max={item.width} onCommit={(chaiseWidth) => set({ chaiseWidth })} />
            <NumberField label="Chaise depth" value={parts.chaiseDepth} min={min} max={Math.round(item.depth - parts.runDepth)} onCommit={(chaiseDepth) => set({ chaiseDepth })} />
          </>
        )}
      </div>
    </fieldset>
  )
}

/**
 * The selected object's variations, when it is one of the catalog's (by its name): choosing one gives it that
 * variation's name, shape, size and outline where it stands, in its color. Hidden for renamed or described objects.
 * @param props.plan - The room.
 * @param props.index - The object's position in the plan's objects.
 */
function VariationChoice({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const catalog = useCatalog(plan.roomType).data ?? []
  const item = plan.items[index]
  const found = variationOf(catalog, item)

  if (!found || found.object.variants.length < 2) {
    return null
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Variation</p>
      <div role="radiogroup" aria-label="Variation" className="flex flex-wrap gap-1.5" data-variations={found.object.key}>
        {found.object.variants.map((variant, i) => (
          <button
            key={variant.key}
            type="button"
            role="radio"
            aria-checked={i === found.index}
            data-variation={variant.key}
            title={`${variant.label}, ${variant.width} × ${variant.depth} × ${variant.height} cm`}
            onClick={() => update(index, toVariation(variant))}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              i === found.index && "border-primary bg-accent text-accent-foreground hover:bg-accent"
            )}
          >
            {variant.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The selected object's decorations: its catalog object's most popular ones (found by its name) and the user's own.
 * @param props.plan - The room.
 * @param props.index - The object's position in the plan's objects.
 */
function ItemDecorations({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const catalog = useCatalog(plan.roomType).data ?? []
  const item = plan.items[index]
  const suggestions = variationOf(catalog, item)?.object.decorations ?? []

  return <DecorationChoice suggestions={suggestions} value={item.decorations ?? []} onChange={(decorations) => update(index, { decorations })} />
}

/**
 * The room's settings, shown while no object is selected.
 * @param props.plan - The room.
 */
function RoomInspector({ plan }: { plan: Plan }) {
  const setRoom = useBuilderStore((state) => state.setRoom)
  const resetShape = useBuilderStore((state) => state.resetShape)

  return (
    <div className="space-y-5" data-inspector-room>
      <p className="flex gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        <MousePointerClickIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        Click an object on the plan to change it. Drag objects from the left to add them. Click a wall to open it, add windows, doors and things to hang, and look at it in the photo. Ctrl+C and Ctrl+V copy an object, Delete removes it.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="room-name">{ROOM_TYPE_NAMES[plan.roomType]} name</Label>
        <Input id="room-name" value={plan.name} placeholder="Such as: our living room" onChange={(event) => setRoom({ name: event.target.value })} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Walls (m)</legend>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Width" step={0.1} value={plan.width} min={BUILDER.wall.min} max={BUILDER.wall.max} onCommit={(width) => setRoom({ width })} />
          <NumberField label="Length" step={0.1} value={plan.length} min={BUILDER.wall.min} max={BUILDER.wall.max} onCommit={(length) => setRoom({ length })} />
          <NumberField label="Height" step={0.1} value={plan.height} min={BUILDER.ceiling.min} max={BUILDER.ceiling.max} onCommit={(height) => setRoom({ height })} />
        </div>
        {plan.outline.length > 4 && (
          <>
            <p className="text-xs text-muted-foreground">The room's overall size; its walls bend ({plan.outline.length} corners). Change them with Room shape above the plan.</p>
            <Button variant="outline" size="sm" className="w-full" onClick={resetShape} data-reset-shape>
              <SquareIcon data-icon="inline-start" />
              Reset to rectangle
            </Button>
          </>
        )}
      </fieldset>
      <ColorChoice label="Walls" value={plan.wallColor} colors={BUILDER.wallColors} onPick={(wallColor) => setRoom({ wallColor })} />
      <div className="space-y-2">
        <p className="text-sm font-medium">Floor</p>
        <FloorChoice value={plan.floorType} color={plan.floorColor} onPick={(floorType) => setRoom({ floorType })} />
      </div>
      <ColorChoice label="Floor color" value={plan.floorColor} colors={BUILDER.floorColors} onPick={(floorColor) => setRoom({ floorColor })} />
      <div className="space-y-2">
        <p className="text-sm font-medium">The photo looks at</p>
        <WallChoice plan={plan} value={plan.view} label="Wall the photo looks at" onPick={(view) => setRoom({ view })} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Taken from</p>
        <CornerChoice value={plan.corner ?? VIEW_CORNER.None} label="Where the photo is taken from" onPick={(corner) => setRoom({ corner })} />
      </div>
    </div>
  )
}

/**
 * A number field that takes the value once it is a number in range; until then the typing stays as typed, and leaving
 * the field shows the value in use again.
 * @param props.label - Its label.
 * @param props.value - The value in use.
 * @param props.min - The lowest value taken.
 * @param props.max - The highest value taken.
 * @param props.step - The arrows' step.
 * @param props.onCommit - Takes a new value.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onCommit: (value: number) => void
}) {
  // What is being typed; null while the field isn't being typed in, so it shows the value in use.
  const [text, setText] = useState<string | null>(null)

  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="decimal"
        className="h-8"
        value={text ?? String(value)}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onFocus={() => setText(String(value))}
        onBlur={() => setText(null)}
        onChange={(event) => {
          setText(event.target.value)
          const number = Number(event.target.value)

          if (event.target.value !== "" && number >= min && number <= max) {
            onCommit(number)
          }
        }}
      />
    </label>
  )
}

/**
 * A color: swatches and any color.
 * @param props.label - What it colors.
 * @param props.value - The color in use.
 * @param props.colors - The swatches.
 * @param props.onPick - Takes a color.
 */
export function ColorChoice({ label, value, colors, onPick }: { label: string; value: string; colors: readonly string[]; onPick: (color: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{value}</span>
          <span className="relative size-6 overflow-hidden rounded-md border" style={{ backgroundColor: value }}>
            <input
              type="color"
              value={value.toLowerCase()}
              aria-label={`Any ${label.toLowerCase()} color`}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={(event) => onPick(event.target.value.toUpperCase())}
            />
          </span>
        </label>
      </div>
      <div role="radiogroup" aria-label={`${label} color`} className="grid grid-cols-8 gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value.toUpperCase() === color.toUpperCase()}
            aria-label={`Color ${color}`}
            onClick={() => onPick(color)}
            className={cn(
              "aspect-square rounded-md border shadow-soft outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50",
              value.toUpperCase() === color.toUpperCase() && "ring-2 ring-primary ring-offset-2 ring-offset-card"
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}
