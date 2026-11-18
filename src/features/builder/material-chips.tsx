import { BUILDER } from "@/lib/constants"
import { ChoiceChips } from "./choice-chips"

/**
 * What an object is made of, as chips: the materials offered, then "None" (its color alone says). Hidden when there
 * are none to offer.
 * @param props.materials - The materials offered.
 * @param props.value - The one picked; empty for none.
 * @param props.onPick - Picks one; empty for none.
 */
export function MaterialChips({ materials, value, onPick }: { materials: string[]; value: string; onPick: (material: string) => void }) {
  if (materials.length === 0) {
    return null
  }

  const chips = [...materials.map((name) => ({ value: name, name })), { value: BUILDER.none, name: "None" }]

  return (
    <ChoiceChips
      label="Material"
      chips={chips}
      value={value || BUILDER.none}
      onPick={(material) => onPick(material === BUILDER.none ? "" : material)}
      attribute="material"
    />
  )
}
