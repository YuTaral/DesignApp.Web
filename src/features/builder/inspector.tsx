import { MousePointerClickIcon, PlusIcon, RotateCwIcon, SquareIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BUILDER, ITEM_FORM, ITEM_SHAPE, LEG_SIDE, ROOM_TYPE_NAMES, SWATCHES, type FloorType, type LegSide, type WallFinish } from "@/lib/constants"
import { useCatalog, type Plan } from "./api"
import { ChoiceChips, type Chip } from "./choice-chips"
import { DecorationChoice } from "./decoration-choice"
import { ColorChoice, NumberField } from "./fields"
import { FINISH_CHIPS } from "./finish-chips"
import { FinishFields } from "./finish-fields"
import { MaterialChips } from "./material-chips"
import { hasParts, isMountedShape, isWallItem, isZoneShape, partsOf, toVariation, useBuilderStore, variationOf } from "./builder-store"
import { wallLength } from "./room-outline"
import { FloorChoice, FloorColorChoice } from "./floor-choice"
import { ViewChoice } from "./view-choice"
import { WallChoice } from "./wall-choice"

/** What is in view beside the right column: the plan, the plan while its shape is edited, a wall, or the 3D view. */
export type InspectorFocus = "plan" | "shape" | "wall" | "3d"

/**
 * Which of the room's settings each view shows while nothing is selected: only those about what is in it. The plan has
 * the floor (and the view the photo takes, marked on it), a wall its finish, the room's shape only its size, and the 3D
 * view, which shows it all, everything but the view (chosen under the 3D view itself).
 */
const ROOM_SECTIONS: Record<InspectorFocus, { name: boolean; walls: boolean; floor: boolean; light: boolean; view: boolean }> = {
  plan: { name: true, walls: false, floor: true, light: true, view: true },
  shape: { name: false, walls: false, floor: false, light: false, view: false },
  wall: { name: false, walls: true, floor: false, light: false, view: false },
  "3d": { name: true, walls: true, floor: true, light: true, view: false },
}

/** The hint above the room's settings, for each view. */
const ROOM_HINTS: Record<InspectorFocus, string> = {
  plan: "Click an object on the plan to change it. Drag objects from the left to add them. Click a wall to open it, add windows, doors and things to hang, and look at it in the photo. Ctrl+C and Ctrl+V copy an object, Delete removes it.",
  shape: "Drag a wall to push or pull it, or a corner to move the two walls that meet there. Done shaping goes back to the objects.",
  wall: "Click a window, door or hung thing to change it. Drag them from the left onto the wall. Add a wall area for part of it in another finish. Ctrl+C and Ctrl+V copy one, Delete removes it.",
  "3d": "The room as the photo sees it. Pick the wall and the camera's place under the view; the room's walls, floor and light are here.",
}

/**
 * The right column: the selected object's variation, name, material, size, turn and color (a window's or door's wall and place on it), or,
 * with nothing selected, the room's settings about what is in view (see `ROOM_SECTIONS`).
 * @param props.plan - The room being built.
 * @param props.focus - What is in view beside it.
 */
export function Inspector({ plan, focus }: { plan: Plan; focus: InspectorFocus }) {
  const selected = useBuilderStore((state) => state.selected)
  const item = plan.items[selected]

  if (!item) {
    return <RoomInspector plan={plan} focus={focus} />
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
  const zone = item.shape === ITEM_SHAPE.WallZone

  return (
    <div className="space-y-5" data-inspector-item={index} data-inspector-opening>
      <ItemBasics plan={plan} index={index} />
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
          {(isWindow || hung || zone) && (
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
      {!zone && (
        <ColorChoice
          label={hung ? "Color" : isWindow ? "Frame" : "Door"}
          value={item.color}
          colors={hung ? SWATCHES : BUILDER.frameColors}
          onPick={(color) => update(index, { color })}
        />
      )}
      <Button variant="outline" className="w-full" onClick={() => remove(index)}>
        <Trash2Icon data-icon="inline-start" />
        Delete
      </Button>
    </div>
  )
}

/**
 * What every object's settings start with: its name, its variation, its material and its decorations.
 * @param props.plan - The room.
 * @param props.index - The object's position in the plan's objects.
 */
function ItemBasics({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const item = plan.items[index]

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="item-label">Name</Label>
        <Input id="item-label" value={item.label} maxLength={BUILDER.labelLength} onChange={(event) => update(index, { label: event.target.value })} />
      </div>
      {isZoneShape(item.shape) ? (
        <ZoneLook plan={plan} index={index} />
      ) : (
        <>
          <VariationChoice plan={plan} index={index} />
          <MaterialChoice plan={plan} index={index} />
          <ItemDecorations plan={plan} index={index} />
        </>
      )}
    </>
  )
}

/**
 * An area's material and color: a floor material with the floor's colors for an area of the floor, a wall finish with
 * the walls' colors for an area of a wall.
 * @param props.plan - The room.
 * @param props.index - The area's position in the plan's objects.
 */
function ZoneLook({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const item = plan.items[index]

  if (item.shape === ITEM_SHAPE.FloorZone) {
    return (
      <div className="space-y-2" data-zone-look="floor">
        <p className="text-sm font-medium">Material</p>
        <FloorChoice value={item.material as FloorType} color={item.color} onPick={(material) => update(index, { material })} />
        <FloorColorChoice type={item.material as FloorType} value={item.color} onPick={(color) => update(index, { color })} />
      </div>
    )
  }

  return (
    <div className="space-y-3" data-zone-look="wall">
      <ChoiceChips label="Finish" chips={FINISH_CHIPS} value={item.material as WallFinish} onPick={(material) => update(index, { material })} attribute="zone-finish" />
      <ColorChoice label="Color" value={item.color} colors={BUILDER.wallColors} onPick={(color) => update(index, { color })} />
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
  // A floor area is flat: its size is its width and depth, and its color comes with its material.
  const zone = item.shape === ITEM_SHAPE.FloorZone

  return (
    <div className="space-y-5" data-inspector-item={index}>
      <ItemBasics plan={plan} index={index} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Size (cm)</legend>
        <div className={cn("grid gap-2", zone ? "grid-cols-2" : "grid-cols-3")}>
          <NumberField label="Width" value={item.width} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(width) => update(index, { width })} />
          <NumberField label="Depth" value={item.depth} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(depth) => update(index, { depth })} />
          {!zone && <NumberField label="Height" value={item.height} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(height) => update(index, { height })} />}
        </div>
      </fieldset>
      {hasParts(item) && <PartFields plan={plan} index={index} />}
      {!zone && <ColorChoice label="Color" value={item.color} colors={SWATCHES} onPick={(color) => update(index, { color })} />}
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
  const sides: Chip<LegSide>[] = [
    { value: LEG_SIDE.Left, name: "Left", title: "The corner leg at the back's left end, as seen from above before turning" },
    { value: LEG_SIDE.Right, name: "Right", title: "The corner leg at the back's right end, as seen from above before turning" },
  ]

  return (
    <fieldset className="space-y-2" data-part-fields>
      <legend className="text-sm font-medium">Parts (cm)</legend>
      <ChoiceChips
        label={isP ? "Corner leg and chaise on the" : "Corner leg on the"}
        chips={sides}
        value={parts.legLeft ? LEG_SIDE.Left : LEG_SIDE.Right}
        onPick={(side) => set({ legLeft: side === LEG_SIDE.Left })}
        attribute="leg-side"
      />
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

  const variants = found.object.variants
  const chips = variants.map((v) => ({ value: v.key, name: v.name, title: `${v.label}, ${v.width} × ${v.depth} × ${v.height} cm` }))

  return (
    <ChoiceChips
      label="Variation"
      chips={chips}
      value={variants[found.index].key}
      onPick={(key) => update(index, toVariation(variants.find((v) => v.key === key)!))}
      attribute="variation"
      group={{ "data-variations": found.object.key }}
    />
  )
}

/**
 * What the selected object is made of: its catalog object's materials (found by its name), "None" to leave it to its
 * color, and a material it has that isn't one of them. Hidden for an object with no materials to choose from.
 * @param props.plan - The room.
 * @param props.index - The object's position in the plan's objects.
 */
function MaterialChoice({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const catalog = useCatalog(plan.roomType).data ?? []
  const item = plan.items[index]
  const offered = variationOf(catalog, item)?.object.materials ?? []
  const current = item.material ?? ""
  const names = current && !offered.includes(current) ? [...offered, current] : offered

  return <MaterialChips materials={names} value={current} onPick={(material) => update(index, { material })} />
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
 * The room's settings, shown while no object is selected: those about what is in view.
 * @param props.plan - The room.
 * @param props.focus - What is in view beside it.
 */
function RoomInspector({ plan, focus }: { plan: Plan; focus: InspectorFocus }) {
  const setRoom = useBuilderStore((state) => state.setRoom)
  const resetShape = useBuilderStore((state) => state.resetShape)
  const addZone = useBuilderStore((state) => state.addZone)
  const shows = ROOM_SECTIONS[focus]

  return (
    <div className="space-y-5" data-inspector-room={focus}>
      <p className="flex gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
        <MousePointerClickIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {ROOM_HINTS[focus]}
      </p>
      {shows.name && (
        <div className="space-y-1.5">
          <Label htmlFor="room-name">{ROOM_TYPE_NAMES[plan.roomType]} name</Label>
          <Input id="room-name" value={plan.name} placeholder="Such as: our living room" onChange={(event) => setRoom({ name: event.target.value })} />
        </div>
      )}
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
      {shows.walls && <ColorChoice label="Walls" value={plan.wallColor} colors={BUILDER.wallColors} onPick={(wallColor) => setRoom({ wallColor })} />}
      {shows.floor && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">Floor</p>
            <FloorChoice value={plan.floorType} color={plan.floorColor} onPick={(floorType) => setRoom({ floorType })} />
          </div>
          <FloorColorChoice type={plan.floorType} value={plan.floorColor} onPick={(floorColor) => setRoom({ floorColor })} />
          <div className="space-y-1">
            <Button variant="outline" size="sm" onClick={() => addZone("floor")} data-add-floor-zone>
              <PlusIcon data-icon="inline-start" />
              Add a floor area
            </Button>
            <p className="text-xs text-muted-foreground">Part of the floor in another material and color, such as tiles by the kitchen units. Walls get theirs in the Wall tab.</p>
          </div>
        </>
      )}
      {(shows.walls || shows.light) && <FinishFields plan={plan} walls={shows.walls} light={shows.light} />}
      {shows.view && <ViewChoice plan={plan} place="panel" />}
    </div>
  )
}
