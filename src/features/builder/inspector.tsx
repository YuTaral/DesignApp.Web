import { PlusIcon, RotateCwIcon, SquareIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BUILDER, COVERING_KIND_NAMES, FLOOR_TYPE_NAMES, ITEM_FORM, ITEM_SHAPE, LEG_SIDE, ROOM_TYPE_NAMES, SWATCHES, type FloorType, type LegSide, type WallFinish } from "@/lib/constants"
import { useCatalog, type Plan } from "./api"
import { ChoiceChips, type Chip } from "./choice-chips"
import { CoveringFields } from "./covering-fields"
import { CeilingLightList } from "./ceiling-lights"
import { isCeilingLight } from "./lights"
import { LightSwitch } from "./light-switch"
import { WorktopFields } from "./worktop-fields"
import { DecorationChoice } from "./decoration-choice"
import { ColorChoice, NumberField } from "./fields"
import { FINISH_CHIPS } from "./finish-chips"
import { FinishFields } from "./finish-fields"
import { MaterialChips } from "./material-chips"
import { PanelSection } from "./panel-section"
import { hasParts, isMountedShape, isWallItem, isZoneShape, partsOf, toVariation, useBuilderStore, variationOf } from "./builder-store"
import { wallLength, wallName } from "./room-outline"
import { FloorChoice, FloorColorChoice } from "./floor-choice"
import { WallChoice } from "./wall-choice"

/** What is in view beside the right column: the plan, the plan while its shape is edited, a wall, the ceiling, or the 3D view. */
export type InspectorFocus = "plan" | "shape" | "wall" | "ceiling" | "3d"

/**
 * Which of the room's settings each view shows while nothing is selected: only those about what is in it. The plan has
 * the floor and the light, a wall the walls' finishes, the ceiling its color and light, the room's shape only its size,
 * and the 3D view, which shows it all, everything but the ceiling (only in its own tab). The plan and the 3D view
 * choose the photo's view under the picture.
 */
const ROOM_SECTIONS: Record<InspectorFocus, { name: boolean; walls: boolean; ceiling: boolean; floor: boolean; light: boolean }> = {
  plan: { name: true, walls: false, ceiling: false, floor: true, light: true },
  shape: { name: false, walls: false, ceiling: false, floor: false, light: false },
  wall: { name: false, walls: true, ceiling: false, floor: false, light: false },
  ceiling: { name: false, walls: false, ceiling: true, floor: false, light: true },
  "3d": { name: true, walls: true, ceiling: false, floor: true, light: true },
}

/**
 * The right column: the selected object's variation, name, material, size, turn and color (a window's or door's wall and place on it), or,
 * with nothing selected, the room's settings about what is in view (see `ROOM_SECTIONS`).
 * @param props.plan - The room being built.
 * @param props.focus - What is in view beside it.
 * @param props.shownWall - The wall shown in the Wall tab; null elsewhere.
 * @param props.onShowWall - Shows another wall in the Wall tab.
 * @param props.onPlan - Opens the plan (after adding a floor area from the 3D view, to place it).
 */
export function Inspector({
  plan,
  focus,
  shownWall,
  onShowWall,
  onPlan,
}: {
  plan: Plan
  focus: InspectorFocus
  shownWall: number | null
  onShowWall: (wall: number) => void
  onPlan: () => void
}) {
  const selected = useBuilderStore((state) => state.selected)
  const item = plan.items[selected]

  if (!item) {
    return <RoomInspector plan={plan} focus={focus} shownWall={shownWall} onShowWall={onShowWall} onPlan={onPlan} />
  }

  return isWallItem(item) ? <WallItemInspector plan={plan} index={selected} /> : <ItemInspector plan={plan} index={selected} />
}

/**
 * The selected window's, door's or hung object's settings, in sections that open and close: its type; its look (its
 * material and color, or an area's finish); its decorations; a window's curtains or blinds; a light's switch; its wall
 * and exact place (from the wall's left corner, and a window's or hung object's height above the floor); its size (and
 * how far a hung object sticks out). Below them, adding a wall area on its wall, and deleting it.
 * @param props.plan - The room.
 * @param props.index - Its position in the plan's objects.
 */
function WallItemInspector({ plan, index }: { plan: Plan; index: number }) {
  const { update, remove, addZone } = useBuilderStore()
  const item = plan.items[index]
  const wall = item.wall!
  const [length, ceiling] = [wallLength(plan, wall), plan.height * 100]
  const isWindow = item.shape === ITEM_SHAPE.Window
  const hung = isMountedShape(item.shape)
  const zone = item.shape === ITEM_SHAPE.WallZone

  return (
    <div className="space-y-5" data-inspector-item={index} data-inspector-opening>
      <ItemType plan={plan} index={index} />
      <PanelSection name="settings-look" title="Look">
        {zone ? <ZoneLook plan={plan} index={index} /> : <MaterialChoice plan={plan} index={index} />}
        {!zone && (
          <ColorChoice
            label={hung ? "Color" : isWindow ? "Frame" : "Door"}
            value={item.color}
            colors={hung ? SWATCHES : BUILDER.frameColors}
            onPick={(color) => update(index, { color })}
          />
        )}
      </PanelSection>
      {!zone && <ItemDecorations plan={plan} index={index} />}
      {isWindow && (
        <PanelSection name="settings-covering" title="Curtains & blinds" summary={item.covering ? COVERING_KIND_NAMES[item.covering.kind] : "none"}>
          <CoveringFields covering={item.covering ?? null} onChange={(covering) => update(index, { covering })} />
        </PanelSection>
      )}
      <LightSwitch plan={plan} index={index} />
      <PanelSection name="settings-place" title="Place" summary={wallName(plan, wall)}>
        <WallChoice plan={plan} value={wall} label="Wall" onPick={(next) => update(index, { wall: next, x: Math.min(item.x, wallLength(plan, next) - item.width / 2) })} />
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
        <p className="text-xs text-muted-foreground">In cm, from the wall's left corner{isWindow || hung || zone ? " and up from the floor" : ""}.</p>
      </PanelSection>
      <PanelSection name="settings-size" title="Size" summary={`${Math.round(item.width)} × ${Math.round(item.height)} cm`}>
        <div className={cn("grid gap-2", hung ? "grid-cols-3" : "grid-cols-2")}>
          <NumberField label="Width" value={item.width} min={BUILDER.item.min} max={Math.round(length)} onCommit={(width) => update(index, { width })} />
          <NumberField label="Height" value={item.height} min={BUILDER.item.min} max={Math.round(ceiling)} onCommit={(height) => update(index, { height })} />
          {hung && <NumberField label="Sticks out" value={item.depth} min={BUILDER.item.min} max={BUILDER.maxMountedDepth} onCommit={(depth) => update(index, { depth })} />}
        </div>
      </PanelSection>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => addZone("wall", wall)} data-add-wall-zone>
          <PlusIcon data-icon="inline-start" />
          Add a wall area
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
 * What every object's settings start with, in the "Type" section: its name and its variation (an area has none).
 * @param props.plan - The room.
 * @param props.index - The object's position in the plan's objects.
 */
function ItemType({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const item = plan.items[index]

  return (
    <PanelSection name="settings-type" title="Type">
      <div className="space-y-1.5">
        <Label htmlFor="item-label">Name</Label>
        <Input id="item-label" value={item.label} maxLength={BUILDER.labelLength} onChange={(event) => update(index, { label: event.target.value })} />
      </div>
      {!isZoneShape(item.shape) && <VariationChoice plan={plan} index={index} />}
    </PanelSection>
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
 * The selected object's settings, in sections that open and close: a ceiling light's others in the room; its type; its
 * look (its material and color, or an area's floor); its decorations; its size (and an L's or P's parts); a light's
 * switch; a kitchen unit's worktop. Below them, turning and deleting it.
 * @param props.plan - The room.
 * @param props.index - The object's position in the plan's objects.
 */
function ItemInspector({ plan, index }: { plan: Plan; index: number }) {
  const { update, rotate, remove } = useBuilderStore()
  const item = plan.items[index]
  // A floor area is flat: its size is its width and depth, and its color comes with its material.
  const zone = item.shape === ITEM_SHAPE.FloorZone
  // A ceiling light's height is how far down it reaches.
  const hanging = isCeilingLight(item.shape)

  return (
    <div className="space-y-5" data-inspector-item={index}>
      {/* A ceiling light's panel lists the room's others too, to pick another or add one. */}
      {hanging && (
        <PanelSection name="settings-ceiling-lights" title="Ceiling lights">
          <CeilingLightList plan={plan} heading={false} />
        </PanelSection>
      )}
      <ItemType plan={plan} index={index} />
      <PanelSection name="settings-look" title="Look">
        {zone ? <ZoneLook plan={plan} index={index} /> : <MaterialChoice plan={plan} index={index} />}
        {!zone && <ColorChoice label="Color" value={item.color} colors={SWATCHES} onPick={(color) => update(index, { color })} />}
      </PanelSection>
      {/* An area or a ceiling light has nothing on it. */}
      {!zone && !hanging && <ItemDecorations plan={plan} index={index} />}
      <PanelSection name="settings-size" title="Size" summary={zone ? `${Math.round(item.width)} × ${Math.round(item.depth)} cm` : `${Math.round(item.width)} × ${Math.round(item.depth)} × ${Math.round(item.height)} cm`}>
        <div className={cn("grid gap-2", zone ? "grid-cols-2" : "grid-cols-3")}>
          <NumberField label="Width" value={item.width} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(width) => update(index, { width })} />
          <NumberField label="Depth" value={item.depth} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(depth) => update(index, { depth })} />
          {!zone && (
            <NumberField label={hanging ? "Drop" : "Height"} value={item.height} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(height) => update(index, { height })} />
          )}
        </div>
        {hasParts(item) && <PartFields plan={plan} index={index} />}
      </PanelSection>
      <LightSwitch plan={plan} index={index} />
      <WorktopFields plan={plan} index={index} />
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

  const count = (item.decorations ?? []).length

  return (
    <PanelSection name="settings-decorations" title="Decorations" summary={count === 0 ? "none" : String(count)}>
      <DecorationChoice suggestions={suggestions} value={item.decorations ?? []} onChange={(decorations) => update(index, { decorations })} titled={false} />
    </PanelSection>
  )
}

/**
 * The room's settings, shown while no object is selected: those about what is in view.
 * @param props.plan - The room.
 * @param props.focus - What is in view beside it.
 * @param props.shownWall - The wall shown in the Wall tab; null elsewhere.
 * @param props.onShowWall - Shows another wall in the Wall tab.
 * @param props.onPlan - Opens the plan.
 */
function RoomInspector({
  plan,
  focus,
  shownWall,
  onShowWall,
  onPlan,
}: {
  plan: Plan
  focus: InspectorFocus
  shownWall: number | null
  onShowWall: (wall: number) => void
  onPlan: () => void
}) {
  const setRoom = useBuilderStore((state) => state.setRoom)
  const resetShape = useBuilderStore((state) => state.resetShape)
  const addZone = useBuilderStore((state) => state.addZone)
  const shows = ROOM_SECTIONS[focus]

  return (
    <div className="space-y-5" data-inspector-room={focus}>
      <PanelSection name="settings-room" title="Room" summary={`${plan.width} × ${plan.length} m, ${plan.height} m high`}>
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
      </PanelSection>
      {shows.floor && (
        <PanelSection name="settings-floor" title="Floor" summary={FLOOR_TYPE_NAMES[plan.floorType]}>
          <FloorChoice value={plan.floorType} color={plan.floorColor} onPick={(floorType) => setRoom({ floorType })} />
          <FloorColorChoice type={plan.floorType} value={plan.floorColor} onPick={(floorColor) => setRoom({ floorColor })} />
          <div className="space-y-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                addZone("floor")

                // The 3D view can't place it: the plan can.
                if (focus === "3d") {
                  onPlan()
                }
              }}
              data-add-floor-zone
            >
              <PlusIcon data-icon="inline-start" />
              Add a floor area
            </Button>
            <p className="text-xs text-muted-foreground">Part of the floor in another material and color, such as tiles by the kitchen units. Walls get theirs in the Wall tab.</p>
          </div>
        </PanelSection>
      )}
      {(shows.walls || shows.ceiling || shows.light) && (
        <FinishFields plan={plan} walls={shows.walls} ceiling={shows.ceiling} light={shows.light} shownWall={shownWall} onShowWall={onShowWall} />
      )}
    </div>
  )
}
