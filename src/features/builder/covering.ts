import { COVERING_KIND, type CoveringKind } from "@/lib/constants"

/**
 * Whether a window covering is curtains (which hang to a length), not blinds.
 * @param kind - The covering.
 */
export function isCurtains(kind: CoveringKind) {
  return kind === COVERING_KIND.Sheers || kind === COVERING_KIND.Curtains || kind === COVERING_KIND.SheersAndCurtains
}
