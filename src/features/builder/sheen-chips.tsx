import { BUILDER, SHEEN, SHEEN_NAMES, type Sheen } from "@/lib/constants"
import { ChoiceChips } from "./choice-chips"

/** The sheens as chips, "Any" first (nothing said about the shine). */
const CHIPS = [{ value: BUILDER.none, name: "Any", title: "Not said: the photo decides" }, ...Object.values(SHEEN).map((sheen) => ({ value: sheen, name: SHEEN_NAMES[sheen] }))]

/**
 * How shiny an object is, as chips: Any (not said), Matte, Satin or Gloss.
 * @param props.value - The sheen; null for any.
 * @param props.onPick - Picks one; null for any.
 */
export function SheenChips({ value, onPick }: { value: Sheen | null | undefined; onPick: (sheen: Sheen | null) => void }) {
  return (
    <ChoiceChips
      label="Sheen"
      chips={CHIPS}
      value={value ?? BUILDER.none}
      onPick={(picked) => onPick(picked === BUILDER.none ? null : (picked as Sheen))}
      attribute="sheen"
    />
  )
}
