import { Button } from "@/components/ui/button"
import { TIME_OF_DAY_NAMES } from "@/lib/constants"
import type { Plan } from "./api"
import { useBuilderStore } from "./builder-store"
import { ChoiceChips } from "./choice-chips"
import { PanelSection } from "./panel-section"
import { givesLight, isLightOn } from "./lights"

/** The switch's two positions as chips. */
const SWITCH_CHIPS = [
  { value: "on", name: "On" },
  { value: "off", name: "Off" },
]

/**
 * The On and Off switch of something that gives light (a lamp, a ceiling light, a wall sconce, a piece with a table lamp,
 * cabinets with under-cabinet lights): it shows whether the light is on now. Until it is switched it follows the time of
 * day (on in the evening), which it says; once switched it stays so, with a way back to following the time of day.
 * Nothing for what gives no light.
 * @param props.plan - The room, for its time of day.
 * @param props.index - The object's position in the plan's objects.
 */
export function LightSwitch({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const item = plan.items[index]
  const on = isLightOn(item, plan.finish.timeOfDay)
  const following = item.lit == null

  if (!givesLight(item)) {
    return null
  }

  return (
    <PanelSection name="settings-light-switch" title="Light" summary={on ? "on" : "off"}>
      <div className="space-y-1.5" data-light-switch={on ? "on" : "off"}>
        <ChoiceChips label="Switch" chips={SWITCH_CHIPS} value={on ? "on" : "off"} onPick={(value) => update(index, { lit: value === "on" })} attribute="light" />
        {following ? (
          <p className="text-xs text-muted-foreground">
            As the time of day ({TIME_OF_DAY_NAMES[plan.finish.timeOfDay].name.toLowerCase()}): on in the evening, off by day, until you switch it.
          </p>
        ) : (
          <Button variant="ghost" size="xs" onClick={() => update(index, { lit: null })} data-light-follow>
            Follow the time of day
          </Button>
        )}
      </div>
    </PanelSection>
  )
}
