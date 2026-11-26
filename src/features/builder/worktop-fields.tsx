import { BACKSPLASH, BACKSPLASH_NAMES, BUILDER, WORKTOP, WORKTOP_SPOT, type Backsplash } from "@/lib/constants"
import { useCatalog, type Plan } from "./api"
import { useBuilderStore, variationOf } from "./builder-store"
import { ChoiceChips } from "./choice-chips"
import { ColorChoice } from "./fields"
import { PanelSection } from "./panel-section"

/** The backsplashes as chips. */
const BACKSPLASH_CHIPS = Object.values(BACKSPLASH).map((kind) => ({ value: kind, name: BACKSPLASH_NAMES[kind] }))

/**
 * A kitchen unit's worktop, apart from the unit's own color: what it is made of (or none), its color, and, along a
 * wall, the backsplash behind it (an island has none), with its own color for tiles or glass. Shown only for the
 * catalog's kitchen units (base cabinets, a sink unit, a dishwasher, an island).
 * @param props.plan - The room.
 * @param props.index - The unit's position in the plan's objects.
 */
export function WorktopFields({ plan, index }: { plan: Plan; index: number }) {
  const update = useBuilderStore((state) => state.update)
  const catalog = useCatalog(plan.roomType).data ?? []
  const item = plan.items[index]
  const worktop = item.worktop ?? null
  // Found in the catalog by its name; one renamed or brought from another room type keeps its worktop's panel, an island
  // known by its having no backsplash.
  const known = variationOf(catalog, item)?.object.worktop ?? null
  const spot = known ?? (worktop ? (worktop.backsplash === BACKSPLASH.None ? WORKTOP_SPOT.Island : WORKTOP_SPOT.Wall) : null)
  // A material typed elsewhere is still shown, as picked.
  const materials = [...new Set([...WORKTOP.materials, ...(worktop ? [worktop.material] : [])])]
  const chips = [{ value: BUILDER.none, name: "None" }, ...materials.map((material) => ({ value: material, name: material }))]
  const ownColor = worktop?.backsplash === BACKSPLASH.Tiles || worktop?.backsplash === BACKSPLASH.Glass
  const pickBacksplash = (value: string) => {
    const backsplash = value as Backsplash
    const own = backsplash === BACKSPLASH.Tiles || backsplash === BACKSPLASH.Glass
    // Tiles or glass in the worktop's own color would look like the worktop: they start in a color of their own.
    const backsplashColor = own && worktop!.backsplashColor === worktop!.color ? WORKTOP.ownStart : worktop!.backsplashColor

    update(index, { worktop: { ...worktop!, backsplash, backsplashColor } })
  }
  const pickMaterial = (material: string) => {
    if (material === BUILDER.none) {
      update(index, { worktop: null })

      return
    }

    update(index, { worktop: worktop ? { ...worktop, material } : { ...WORKTOP.start, material, backsplash: spot === WORKTOP_SPOT.Island ? BACKSPLASH.None : WORKTOP.start.backsplash } })
  }

  if (!spot) {
    return null
  }

  return (
    <PanelSection name="settings-worktop" title="Worktop" summary={worktop?.material ?? "none"}>
      <div className="space-y-3" data-worktop-fields>
        <ChoiceChips label="Material" chips={chips} value={worktop?.material ?? BUILDER.none} onPick={pickMaterial} attribute="worktop" />
        {worktop && (
          <>
            <ColorChoice label="Color" value={worktop.color} colors={WORKTOP.colors} onPick={(color) => update(index, { worktop: { ...worktop, color } })} />
            {spot === WORKTOP_SPOT.Wall && (
              <ChoiceChips
                label="Backsplash"
                chips={BACKSPLASH_CHIPS}
                value={worktop.backsplash}
                onPick={pickBacksplash}
                attribute="backsplash"
              />
            )}
            {ownColor && (
              <ColorChoice
                label="Backsplash color"
                value={worktop.backsplashColor}
                colors={WORKTOP.backsplashColors}
                onPick={(backsplashColor) => update(index, { worktop: { ...worktop, backsplashColor } })}
              />
            )}
          </>
        )}
      </div>
    </PanelSection>
  )
}
