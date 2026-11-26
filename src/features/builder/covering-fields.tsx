import { BUILDER, COVERING, COVERING_KIND, COVERING_KIND_NAMES, CURTAIN_LENGTH, CURTAIN_LENGTH_NAMES, type CoveringKind, type CurtainLength } from "@/lib/constants"
import type { WindowCovering } from "./api"
import { ChoiceChips } from "./choice-chips"
import { isCurtains } from "./covering"
import { ColorChoice } from "./fields"

/** The window coverings as chips, after "None". */
const KIND_CHIPS = [
  { value: BUILDER.none, name: "None" },
  ...Object.values(COVERING_KIND).map((kind) => ({ value: kind, name: COVERING_KIND_NAMES[kind] })),
]

/** The curtain lengths as chips. */
const LENGTH_CHIPS = Object.values(CURTAIN_LENGTH).map((length) => ({ value: length, name: CURTAIN_LENGTH_NAMES[length] }))

/**
 * A window's curtains or blinds: which (or none), what they are made of, how far curtains hang, and their color. A new
 * one starts in a warm white, in its kind's first fabric, to the floor; changing between curtains and blinds keeps the
 * color and takes the new kind's fabric when the old one isn't among them.
 * @param props.covering - The window's covering; null for none.
 * @param props.onChange - Sets it (null for none).
 */
export function CoveringFields({ covering, onChange }: { covering: WindowCovering | null; onChange: (covering: WindowCovering | null) => void }) {
  const fabrics: readonly string[] = covering && isCurtains(covering.kind) ? COVERING.curtainFabrics : COVERING.blindFabrics
  // A fabric typed elsewhere (or from an older list) is still shown, as picked.
  const fabricChips = [...new Set([...fabrics, ...(covering?.fabric ? [covering.fabric] : [])])].map((fabric) => ({ value: fabric, name: fabric }))
  const pickKind = (value: string) => {
    if (value === BUILDER.none) {
      onChange(null)

      return
    }

    const kind = value as CoveringKind
    const list: readonly string[] = isCurtains(kind) ? COVERING.curtainFabrics : COVERING.blindFabrics
    const fabric = covering && list.includes(covering.fabric) ? covering.fabric : list[0]

    onChange({ kind, fabric, color: covering?.color ?? COVERING.start.color, length: covering?.length ?? COVERING.start.length })
  }

  return (
    <div className="space-y-3" data-covering-fields>
      <ChoiceChips label="Curtains & blinds" chips={KIND_CHIPS} value={covering?.kind ?? BUILDER.none} onPick={pickKind} attribute="covering" />
      {covering && (
        <>
          <ChoiceChips label="Made of" chips={fabricChips} value={covering.fabric} onPick={(fabric) => onChange({ ...covering, fabric })} attribute="covering-fabric" />
          {isCurtains(covering.kind) && (
            <ChoiceChips
              label="Length"
              chips={LENGTH_CHIPS}
              value={covering.length}
              onPick={(length) => onChange({ ...covering, length: length as CurtainLength })}
              attribute="curtain-length"
            />
          )}
          <ColorChoice
            label={isCurtains(covering.kind) ? "Curtains" : "Blind"}
            value={covering.color}
            colors={COVERING.colors}
            onPick={(color) => onChange({ ...covering, color })}
          />
        </>
      )}
    </div>
  )
}
