import {
  BASIN,
  BASIN_NAMES,
  CABINET_FRONTS,
  CABINET_FRONTS_NAMES,
  HANDLE_STYLE,
  HANDLE_STYLE_NAMES,
  HARDWARE,
  HARDWARE_NAMES,
  KITCHEN_SINK,
  KITCHEN_SINK_NAMES,
  KITCHEN_TAP,
  KITCHEN_TAP_NAMES,
  TILE_PATTERN,
  TILE_PATTERN_NAMES,
} from "@/lib/constants"
import type { Plan, RoomFittings } from "./api"
import { useBuilderStore } from "./builder-store"
import { ChoiceChips } from "./choice-chips"
import { hasCabinets, hasSink, hasUpperCabinets, hasVanity, usesTiles } from "./fittings"
import { PanelSection } from "./panel-section"

/**
 * A choice's values as chips, named from its names (with what each looks like on hover).
 * @param values - The choice's values.
 * @param names - Each value's name, and what it looks like.
 */
function chipsOf<T extends string>(values: Record<string, T>, names: Record<T, { name: string; looks?: string }>) {
  return Object.values(values).map((value) => ({ value, name: names[value].name, title: names[value].looks }))
}

/** The glass upper cabinets switch as one chip. */
const GLASS = "glass"

/**
 * How the room is fitted, for the whole room, in a section that opens and closes; each choice shows only where it
 * applies: the cabinets' fronts and handles (with cabinetry, and glass doors for upper cabinets), the metal of the
 * handles, taps and fittings (with cabinetry, a sink or a vanity), the kitchen sink and tap (with a sink unit), the vanity's basin (with a vanity), and the
 * tile pattern (with tiles anywhere). Its heading sums up the cabinets, the metal and the tiles.
 * @param props.plan - The room.
 */
export function FittingsFields({ plan }: { plan: Plan }) {
  const setRoom = useBuilderStore((state) => state.setRoom)
  const fittings = plan.finish.fittings
  const [cabinets, uppers, sink, vanity, tiles] = [hasCabinets(plan), hasUpperCabinets(plan), hasSink(plan), hasVanity(plan), usesTiles(plan)]
  // Metal only matters where there are handles, taps or fittings.
  const metal = cabinets || sink || vanity
  const summary = [
    ...(cabinets ? [`${CABINET_FRONTS_NAMES[fittings.fronts].name}, ${HARDWARE_NAMES[fittings.hardware].name.toLowerCase()}`] : []),
    ...(!cabinets && metal ? [HARDWARE_NAMES[fittings.hardware].name] : []),
    ...(tiles ? [`${TILE_PATTERN_NAMES[fittings.tiles].name.toLowerCase()} tiles`] : []),
  ].join(" · ")
  const set = (change: Partial<RoomFittings>) => {
    setRoom({ finish: { ...plan.finish, fittings: { ...fittings, ...change } } })
  }

  return (
    <PanelSection name="settings-fittings" title="Cabinets & fittings" summary={summary} attributes={{ "data-finish-section": "fittings" }}>
      {cabinets && (
        <>
          <ChoiceChips
            label="Cabinet fronts"
            chips={chipsOf(CABINET_FRONTS, CABINET_FRONTS_NAMES)}
            value={fittings.fronts}
            onPick={(fronts) => set({ fronts })}
            attribute="fronts"
          />
          {uppers && (
            <ChoiceChips
              label="Upper cabinets"
              chips={[{ value: GLASS, name: "Glass doors", title: "Glass-fronted upper cabinets" }]}
              value={fittings.glassUppers ? [GLASS] : []}
              onPick={() => set({ glassUppers: !fittings.glassUppers })}
              attribute="glass-uppers"
            />
          )}
          <ChoiceChips label="Handles" chips={chipsOf(HANDLE_STYLE, HANDLE_STYLE_NAMES)} value={fittings.handles} onPick={(handles) => set({ handles })} attribute="handles" />
        </>
      )}
      {metal && (
        <ChoiceChips
          label="Handles, taps and fittings"
          chips={chipsOf(HARDWARE, HARDWARE_NAMES)}
          value={fittings.hardware}
          onPick={(hardware) => set({ hardware })}
          attribute="hardware"
        />
      )}
      {sink && (
        <>
          <ChoiceChips label="Kitchen sink" chips={chipsOf(KITCHEN_SINK, KITCHEN_SINK_NAMES)} value={fittings.sink} onPick={(next) => set({ sink: next })} attribute="sink" />
          <ChoiceChips label="Tap" chips={chipsOf(KITCHEN_TAP, KITCHEN_TAP_NAMES)} value={fittings.tap} onPick={(tap) => set({ tap })} attribute="tap" />
        </>
      )}
      {vanity && <ChoiceChips label="Basin" chips={chipsOf(BASIN, BASIN_NAMES)} value={fittings.basin} onPick={(basin) => set({ basin })} attribute="basin" />}
      {tiles && (
        <ChoiceChips label="Tile pattern" chips={chipsOf(TILE_PATTERN, TILE_PATTERN_NAMES)} value={fittings.tiles} onPick={(next) => set({ tiles: next })} attribute="tile-pattern" />
      )}
    </PanelSection>
  )
}
