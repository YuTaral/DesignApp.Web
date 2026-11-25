import { useState } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BUILDER, CEILING_LIGHT, CEILING_LIGHT_NAMES, TIME_OF_DAY, TIME_OF_DAY_NAMES, type WallFinish } from "@/lib/constants"
import type { Plan, RoomFinish } from "./api"
import { useBuilderStore } from "./builder-store"
import { ChoiceChips } from "./choice-chips"
import { ColorChoice } from "./fields"
import { FINISH_CHIPS } from "./finish-chips"
import { FoldToggle } from "./fold-toggle"
import { wallName, walls } from "./room-outline"
import { wallSurface } from "./wall-texture"

/** The ceiling lights as chips. */
const LIGHT_CHIPS = Object.values(CEILING_LIGHT).map((light) => ({ value: light, name: CEILING_LIGHT_NAMES[light] }))

/** The times of day as chips, with what each looks like on hover. */
const TIME_CHIPS = Object.values(TIME_OF_DAY).map((time) => ({ value: time, name: TIME_OF_DAY_NAMES[time].name, title: TIME_OF_DAY_NAMES[time].looks }))

/**
 * The room's finish, in up to three sections:
 * - "Walls": which wall to change (All, or one wall: at first the one shown, in the Wall tab), its finish and color,
 *   and the skirting's color. A wall changed on its own keeps its own look; a change for All goes to every wall. In the
 *   Wall tab, "Add a wall area" ends the list.
 * - "Ceiling": its color and its light.
 * - "Light & mood" (opens and closes, its heading saying what is chosen): the time of day the photo is taken at.
 * @param props.plan - The room.
 * @param props.walls - Whether to show "Walls".
 * @param props.ceiling - Whether to show "Ceiling".
 * @param props.light - Whether to show "Light & mood".
 * @param props.shownWall - The wall shown in the Wall tab, which "Walls" starts on; null elsewhere (it starts on All).
 */
export function FinishFields({
  plan,
  walls: showWalls,
  ceiling: showCeiling,
  light: showLight,
  shownWall = null,
}: {
  plan: Plan
  walls: boolean
  ceiling: boolean
  light: boolean
  shownWall?: number | null
}) {
  const { setRoom, addZone } = useBuilderStore()
  const [open, setOpen] = useState(false)
  const startOn = shownWall === null ? BUILDER.allWalls : String(shownWall)
  const [picked, setPicked] = useState<string>(startOn)
  const [pickedFor, setPickedFor] = useState(shownWall)
  const finish = plan.finish
  // A wall the room no longer has (its shape changed) falls back to All.
  const target = picked !== BUILDER.allWalls && Number(picked) >= walls(plan).length ? BUILDER.allWalls : picked
  const wall = target === BUILDER.allWalls ? null : Number(target)
  const own = wall === null ? undefined : finish.ownWalls.find((w) => w.wall === wall)
  const [look, color] = wall === null ? [finish.walls, plan.wallColor] : wallSurface(plan, wall)
  const wallChips = [
    { value: BUILDER.allWalls, name: "All" },
    ...walls(plan).map(({ index }) => ({ value: String(index), name: wallName(plan, index).replace(" wall", "") })),
  ]
  const set = (change: Partial<RoomFinish>) => {
    setRoom({ finish: { ...finish, ...change } })
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
        <section className="space-y-4" aria-label="Walls" data-finish-section="walls">
          <ChoiceChips
            label="Wall"
            chips={wallChips}
            value={target}
            onPick={setPicked}
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
          {own && (
            <Button variant="ghost" size="sm" onClick={() => set({ ownWalls: finish.ownWalls.filter((w) => w.wall !== wall) })} data-match-walls>
              Same as the other walls
            </Button>
          )}
          <ColorChoice label="Skirting" value={finish.trimColor} colors={BUILDER.frameColors} onPick={(trimColor) => set({ trimColor })} />
        </section>
      )}
      {showCeiling && (
        <section className="space-y-4" aria-label="Ceiling" data-finish-section="ceiling">
          <ColorChoice label="Ceiling" value={finish.ceilingColor} colors={BUILDER.ceilingColors} onPick={(ceilingColor) => set({ ceilingColor })} />
          <ChoiceChips label="Ceiling light" chips={LIGHT_CHIPS} value={finish.ceilingLight} onPick={(ceilingLight) => set({ ceilingLight })} attribute="ceiling-light" />
        </section>
      )}
      {showLight && (
        <section className="space-y-3" aria-label="Light and mood" data-finish-section="light">
          <FoldToggle open={open} controls="finish-light" onToggle={() => setOpen(!open)} className="text-sm" data-finish-toggle="light">
            <span className="min-w-0">
              <span className="font-medium">Light &amp; mood</span>
              <span className="text-muted-foreground">: {TIME_OF_DAY_NAMES[finish.timeOfDay].name}</span>
            </span>
          </FoldToggle>
          {open && (
            <div id="finish-light" className="space-y-4">
              <ChoiceChips label="Time of day" chips={TIME_CHIPS} value={finish.timeOfDay} onPick={(timeOfDay) => set({ timeOfDay })} attribute="time-of-day" />
            </div>
          )}
        </section>
      )}
    </>
  )
}
