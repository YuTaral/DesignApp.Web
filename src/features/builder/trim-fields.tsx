import { BUILDER, CASING, CASING_NAMES, MOULDING, MOULDING_NAMES, WAINSCOT, WAINSCOT_NAMES, type Moulding } from "@/lib/constants"
import type { RoomFinish } from "./api"
import { ChoiceChips } from "./choice-chips"
import { ColorChoice } from "./fields"
import { PanelSection } from "./panel-section"

/** The mouldings as chips to switch on and off, with where each runs on hover. */
const MOULDING_CHIPS = Object.values(MOULDING).map((moulding) => ({ value: moulding, name: MOULDING_NAMES[moulding].name, title: MOULDING_NAMES[moulding].looks }))

/** The wainscoting as chips, with what each looks like on hover. */
const WAINSCOT_CHIPS = Object.values(WAINSCOT).map((wainscot) => ({ value: wainscot, name: WAINSCOT_NAMES[wainscot].name, title: WAINSCOT_NAMES[wainscot].looks }))

/** The casings as chips, with what each looks like on hover. */
const CASING_CHIPS = Object.values(CASING).map((casing) => ({ value: casing, name: CASING_NAMES[casing].name, title: CASING_NAMES[casing].looks }))

/**
 * The room's trim, for every wall, in a section that opens and closes: the mouldings along the walls (any of crown,
 * picture rail and dado rail), the wainscoting up to the dado height, the casings around the doors, windows and
 * archways, and the color of all of it and the skirting. Its heading sums up what the walls have, such as "crown,
 * dado rail · Shaker".
 * @param props.finish - The room's finish.
 * @param props.onChange - Changes part of the finish.
 */
export function TrimFields({ finish, onChange }: { finish: RoomFinish; onChange: (change: Partial<RoomFinish>) => void }) {
  const details = finish.details
  const parts = [
    ...details.mouldings.map((moulding) => MOULDING_NAMES[moulding].name.toLowerCase()),
    ...(details.wainscot === WAINSCOT.None ? [] : [WAINSCOT_NAMES[details.wainscot].name.toLowerCase()]),
  ]
  const summary = parts.length === 0 ? `${CASING_NAMES[details.casing].name.toLowerCase()} casings` : parts.join(", ")
  // Switches a moulding on or off, keeping them in their order.
  const switchMoulding = (moulding: Moulding) => {
    const on = details.mouldings.includes(moulding) ? details.mouldings.filter((m) => m !== moulding) : [...details.mouldings, moulding]
    const mouldings = Object.values(MOULDING).filter((m) => on.includes(m))

    onChange({ details: { ...details, mouldings } })
  }

  return (
    <PanelSection name="settings-trim" title="Trim & mouldings" summary={summary} attributes={{ "data-finish-section": "trim" }}>
      <ChoiceChips label="Mouldings" chips={MOULDING_CHIPS} value={details.mouldings} onPick={switchMoulding} attribute="moulding" />
      <ChoiceChips
        label={`Wainscoting, up to ${BUILDER.wainscotHeight} cm`}
        chips={WAINSCOT_CHIPS}
        value={details.wainscot}
        onPick={(wainscot) => onChange({ details: { ...details, wainscot } })}
        attribute="wainscot"
      />
      <ChoiceChips
        label="Door and window casings"
        chips={CASING_CHIPS}
        value={details.casing}
        onPick={(casing) => onChange({ details: { ...details, casing } })}
        attribute="casing"
      />
      <ColorChoice label="Trim color" value={finish.trimColor} colors={BUILDER.frameColors} onPick={(trimColor) => onChange({ trimColor })} />
    </PanelSection>
  )
}
