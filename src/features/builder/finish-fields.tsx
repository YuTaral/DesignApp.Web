import { useState } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  BUILDER,
  CEILING_STYLE,
  CEILING_STYLE_NAMES,
  LIGHT_TONE,
  LIGHT_TONE_NAMES,
  NORTH_NAMES,
  PAINT_SHEEN,
  PAINT_SHEEN_NAMES,
  PLAN_SIDE,
  TIME_OF_DAY,
  TIME_OF_DAY_NAMES,
  WALL_FINISH,
  WALL_FINISH_NAMES,
  type WallFinish,
} from "@/lib/constants"
import type { Plan, RoomFinish } from "./api"
import { useBuilderStore } from "./builder-store"
import { CeilingLightList } from "./ceiling-lights"
import { isCeilingLight } from "./lights"
import { ChoiceChips } from "./choice-chips"
import { ColorChoice } from "./fields"
import { FINISH_CHIPS } from "./finish-chips"
import { PanelSection } from "./panel-section"
import { TrimFields } from "./trim-fields"
import { wallName, walls } from "./room-outline"
import { wallSurface } from "./wall-texture"

/** The paint sheens as chips, for the painted walls (the whole room). */
const PAINT_SHEEN_CHIPS = Object.values(PAINT_SHEEN).map((sheen) => ({ value: sheen, name: PAINT_SHEEN_NAMES[sheen] }))

/** The ceiling's shapes as chips, with what each looks like on hover. */
const CEILING_CHIPS = Object.values(CEILING_STYLE).map((style) => ({ value: style, name: CEILING_STYLE_NAMES[style].name, title: CEILING_STYLE_NAMES[style].looks }))

/** The light colors as chips, with what each looks like on hover. */
const TONE_CHIPS = Object.values(LIGHT_TONE).map((tone) => ({ value: tone, name: LIGHT_TONE_NAMES[tone].name, title: LIGHT_TONE_NAMES[tone].looks }))

/** The sides of the plan as chips, for where north is. */
const NORTH_CHIPS = Object.values(PLAN_SIDE).map((side) => ({ value: side, name: NORTH_NAMES[side] }))

/** The times of day as chips, with what each looks like on hover. */
const TIME_CHIPS = Object.values(TIME_OF_DAY).map((time) => ({ value: time, name: TIME_OF_DAY_NAMES[time].name, title: TIME_OF_DAY_NAMES[time].looks }))

/**
 * The room's finish, in up to four sections that open and close (`PanelSection`, closed at first), each heading saying
 * what is chosen:
 * - "Walls": which wall to change (All, or one wall: at first the one shown, in the Wall tab), and its finish and
 *   color. A wall changed on its own keeps its own look; a change for All goes to every wall. In the Wall tab, "Add a
 *   wall area" ends the list.
 * - "Trim & mouldings", with the walls: see `TrimFields`.
 * - "Ceiling": its shape (and the beams' color), its color, and its lights (see `CeilingLightList`).
 * - "Light & mood": the time of day the photo is taken at, the
 *   lights' color, and where north is on the plan (which decides where the sun comes in from).
 * @param props.plan - The room.
 * @param props.walls - Whether to show "Walls".
 * @param props.ceiling - Whether to show "Ceiling".
 * @param props.light - Whether to show "Light & mood".
 * @param props.shownWall - The wall shown in the Wall tab, which "Walls" starts on; null elsewhere (it starts on All).
 * @param props.onShowWall - Shows a wall in the Wall tab: picking a wall in the list shows it (All keeps the one shown).
 */
export function FinishFields({
  plan,
  walls: showWalls,
  ceiling: showCeiling,
  light: showLight,
  shownWall = null,
  onShowWall,
}: {
  plan: Plan
  walls: boolean
  ceiling: boolean
  light: boolean
  shownWall?: number | null
  onShowWall?: (wall: number) => void
}) {
  const { setRoom, addZone } = useBuilderStore()
  const startOn = shownWall === null ? BUILDER.allWalls : String(shownWall)
  const [picked, setPicked] = useState<string>(startOn)
  const [pickedFor, setPickedFor] = useState(shownWall)
  const finish = plan.finish
  // A wall the room no longer has (its shape changed) falls back to All.
  const target = picked !== BUILDER.allWalls && Number(picked) >= walls(plan).length ? BUILDER.allWalls : picked
  const wall = target === BUILDER.allWalls ? null : Number(target)
  const own = wall === null ? undefined : finish.ownWalls.find((w) => w.wall === wall)
  const [look, color] = wall === null ? [finish.walls, plan.wallColor] : wallSurface(plan, wall)
  const lights = plan.items.filter((item) => isCeilingLight(item.shape)).length
  // The paint's sheen matters only where a wall is painted.
  const painted = finish.walls === WALL_FINISH.Paint || finish.ownWalls.some((w) => w.finish === WALL_FINISH.Paint)
  const lightCount = lights === 0 ? "no lights" : `${lights} light${lights === 1 ? "" : "s"}`
  const wallChips = [
    { value: BUILDER.allWalls, name: "All" },
    ...walls(plan).map(({ index }) => ({ value: String(index), name: wallName(plan, index).replace(" wall", "") })),
  ]
  const set = (change: Partial<RoomFinish>) => {
    setRoom({ finish: { ...finish, ...change } })
  }
  // In the Wall tab a wall picked in the list is shown; All keeps the wall shown.
  const choose = (value: string) => {
    setPicked(value)

    if (value !== BUILDER.allWalls && shownWall !== null) {
      onShowWall?.(Number(value))
    }
  }
  // A change for All goes to every wall: the walls' own looks give way to it. One wall's change is its own look,
  // unless it is the room's look again. Picking what is already picked changes nothing.
  const pick = (change: { finish?: WallFinish; color?: string }) => {
    const next = { finish: change.finish ?? look, color: change.color ?? color }
    const others = finish.ownWalls.filter((w) => w.wall !== wall)
    const asRoom = next.finish === finish.walls && next.color === plan.wallColor

    if (next.finish === look && next.color === color) {
      return
    }

    if (wall === null) {
      setRoom({ wallColor: next.color, finish: { ...finish, walls: next.finish, ownWalls: [] } })

      return
    }

    set({ ownWalls: asRoom ? others : [...others, { wall, ...next }].sort((a, b) => a.wall - b.wall) })
  }

  // Showing another wall in the Wall tab starts the list on it again (adjusted while rendering).
  if (pickedFor !== shownWall) {
    setPickedFor(shownWall)
    setPicked(startOn)
  }

  return (
    <>
      {showWalls && (
        <PanelSection name="settings-walls" title="Walls" summary={WALL_FINISH_NAMES[finish.walls]} attributes={{ "data-finish-section": "walls" }}>
          <ChoiceChips
            label="Wall"
            chips={wallChips}
            value={target}
            onPick={choose}
            attribute="finish-wall"
            after={
              shownWall !== null && (
                <Button variant="outline" size="sm" className="h-auto rounded-lg px-2.5 py-1 font-normal" onClick={() => addZone("wall", shownWall)} data-add-wall-zone>
                  <PlusIcon data-icon="inline-start" />
                  Add a wall area
                </Button>
              )
            }
          />
          {wall === null && finish.ownWalls.length > 0 && (
            <p className="text-xs text-muted-foreground" data-all-walls-note>
              A change here goes to every wall, also the {finish.ownWalls.length === 1 ? "one" : finish.ownWalls.length} in {finish.ownWalls.length === 1 ? "its" : "their"} own finish.
            </p>
          )}
          <ChoiceChips label="Finish" chips={FINISH_CHIPS} value={look} onPick={(next) => pick({ finish: next })} attribute="wall-finish" />
          <ColorChoice label={wall === null ? "Walls" : wallName(plan, wall)} value={color} colors={BUILDER.wallColors} onPick={(next) => pick({ color: next })} />
          {painted && (
            <ChoiceChips label="Paint sheen" chips={PAINT_SHEEN_CHIPS} value={finish.wallSheen} onPick={(wallSheen) => set({ wallSheen })} attribute="paint-sheen" />
          )}
          {own && (
            <Button variant="ghost" size="sm" onClick={() => set({ ownWalls: finish.ownWalls.filter((w) => w.wall !== wall) })} data-match-walls>
              Same as the other walls
            </Button>
          )}
        </PanelSection>
      )}
      {showWalls && <TrimFields finish={finish} onChange={set} />}
      {showCeiling && (
        <PanelSection
          name="settings-ceiling"
          title="Ceiling"
          summary={`${CEILING_STYLE_NAMES[finish.details.ceiling].name.toLowerCase()}, ${lightCount}`}
          attributes={{ "data-finish-section": "ceiling" }}
        >
          <ChoiceChips
            label="Style"
            chips={CEILING_CHIPS}
            value={finish.details.ceiling}
            onPick={(ceiling) => set({ details: { ...finish.details, ceiling } })}
            attribute="ceiling-style"
          />
          {finish.details.ceiling === CEILING_STYLE.Beams && (
            <ColorChoice label="Beams" value={finish.details.beamColor} colors={BUILDER.beamColors} onPick={(beamColor) => set({ details: { ...finish.details, beamColor } })} />
          )}
          <ColorChoice label="Ceiling" value={finish.ceilingColor} colors={BUILDER.ceilingColors} onPick={(ceilingColor) => set({ ceilingColor })} />
          <CeilingLightList plan={plan} />
        </PanelSection>
      )}
      {showLight && (
        <PanelSection
          name="settings-light"
          title="Light & mood"
          summary={`${TIME_OF_DAY_NAMES[finish.timeOfDay].name}, ${LIGHT_TONE_NAMES[finish.tone].name.toLowerCase()} light`}
          attributes={{ "data-finish-section": "light" }}
          toggleAttributes={{ "data-finish-toggle": "light" }}
        >
          <ChoiceChips label="Time of day" chips={TIME_CHIPS} value={finish.timeOfDay} onPick={(timeOfDay) => set({ timeOfDay })} attribute="time-of-day" />
          <ChoiceChips label="Light color" chips={TONE_CHIPS} value={finish.tone} onPick={(tone) => set({ tone })} attribute="light-tone" />
          <ChoiceChips label="North is at the plan's" chips={NORTH_CHIPS} value={finish.north} onPick={(north) => set({ north })} attribute="north" />
          <p className="text-xs text-muted-foreground">North decides where the sun comes in from: the east in the morning, the south at midday, the west at golden hour.</p>
        </PanelSection>
      )}
    </>
  )
}
