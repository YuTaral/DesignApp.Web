import { useState } from "react"

import {
  BUILDER,
  CEILING_LIGHT,
  CEILING_LIGHT_NAMES,
  TIME_OF_DAY,
  TIME_OF_DAY_NAMES,
  WALL_FINISH_NAMES,
} from "@/lib/constants"
import type { Plan, RoomFinish } from "./api"
import { useBuilderStore } from "./builder-store"
import { ChoiceChips } from "./choice-chips"
import { ColorChoice } from "./fields"
import { FINISH_CHIPS } from "./finish-chips"
import { FoldToggle } from "./fold-toggle"
import { wallName, walls } from "./room-outline"

/** The ceiling lights as chips. */
const LIGHT_CHIPS = Object.values(CEILING_LIGHT).map((light) => ({ value: light, name: CEILING_LIGHT_NAMES[light] }))

/** The times of day as chips, with what each looks like on hover. */
const TIME_CHIPS = Object.values(TIME_OF_DAY).map((time) => ({ value: time, name: TIME_OF_DAY_NAMES[time].name, title: TIME_OF_DAY_NAMES[time].looks }))

/**
 * The room's finish, in two sections that open and close (both closed at first, their headings saying what is chosen):
 * "Walls & ceiling" (the walls' finish, an accent wall in its own finish and color, the ceiling's and the skirting's
 * colors) and "Light & mood" (the ceiling light and the time of day the photo is taken at).
 * @param props.plan - The room.
 * @param props.walls - Whether to show "Walls & ceiling".
 * @param props.light - Whether to show "Light & mood".
 */
export function FinishFields({ plan, walls: showWalls, light: showLight }: { plan: Plan; walls: boolean; light: boolean }) {
  const setRoom = useBuilderStore((state) => state.setRoom)
  const [open, setOpen] = useState<"walls" | "light" | null>(null)
  const finish = plan.finish
  const accent = finish.accentWall
  const accentChips = [
    { value: BUILDER.none, name: "None" },
    ...walls(plan).map(({ index }) => ({ value: String(index), name: wallName(plan, index).replace(" wall", "") })),
  ]
  const wallsSummary = accent === null ? WALL_FINISH_NAMES[finish.walls] : `${WALL_FINISH_NAMES[finish.walls]}, ${wallName(plan, accent).toLowerCase()} accent`
  const set = (change: Partial<RoomFinish>) => {
    setRoom({ finish: { ...finish, ...change } })
  }
  const toggle = (section: "walls" | "light") => {
    setOpen(open === section ? null : section)
  }

  return (
    <>
      {showWalls && (
        <section className="space-y-3" aria-label="Walls and ceiling" data-finish-section="walls">
          <FoldToggle open={open === "walls"} controls="finish-walls" onToggle={() => toggle("walls")} className="text-sm" data-finish-toggle="walls">
            <span className="min-w-0">
              <span className="font-medium">Walls &amp; ceiling</span>
              <span className="text-muted-foreground">: {wallsSummary}</span>
            </span>
          </FoldToggle>
          {open === "walls" && (
            <div id="finish-walls" className="space-y-4">
              <ChoiceChips label="Wall finish" chips={FINISH_CHIPS} value={finish.walls} onPick={(walls) => set({ walls })} attribute="wall-finish" />
              <ChoiceChips
                label="Accent wall"
                chips={accentChips}
                value={accent === null ? BUILDER.none : String(accent)}
                onPick={(wall) => set({ accentWall: wall === BUILDER.none ? null : Number(wall) })}
                attribute="accent-wall"
              />
              {accent !== null && (
                <>
                  <ChoiceChips label="Accent finish" chips={FINISH_CHIPS} value={finish.accentFinish} onPick={(accentFinish) => set({ accentFinish })} attribute="accent-finish" />
                  <ColorChoice label="Accent" value={finish.accentColor} colors={BUILDER.wallColors} onPick={(accentColor) => set({ accentColor })} />
                </>
              )}
              <ColorChoice label="Ceiling" value={finish.ceilingColor} colors={BUILDER.ceilingColors} onPick={(ceilingColor) => set({ ceilingColor })} />
              <ColorChoice label="Skirting" value={finish.trimColor} colors={BUILDER.frameColors} onPick={(trimColor) => set({ trimColor })} />
            </div>
          )}
        </section>
      )}
      {showLight && (
        <section className="space-y-3" aria-label="Light and mood" data-finish-section="light">
          <FoldToggle open={open === "light"} controls="finish-light" onToggle={() => toggle("light")} className="text-sm" data-finish-toggle="light">
            <span className="min-w-0">
              <span className="font-medium">Light &amp; mood</span>
              <span className="text-muted-foreground">: {TIME_OF_DAY_NAMES[finish.timeOfDay].name}, {CEILING_LIGHT_NAMES[finish.ceilingLight].toLowerCase()}</span>
            </span>
          </FoldToggle>
          {open === "light" && (
            <div id="finish-light" className="space-y-4">
              <ChoiceChips label="Time of day" chips={TIME_CHIPS} value={finish.timeOfDay} onPick={(timeOfDay) => set({ timeOfDay })} attribute="time-of-day" />
              <ChoiceChips label="Ceiling light" chips={LIGHT_CHIPS} value={finish.ceilingLight} onPick={(ceilingLight) => set({ ceilingLight })} attribute="ceiling-light" />
            </div>
          )}
        </section>
      )}
    </>
  )
}
