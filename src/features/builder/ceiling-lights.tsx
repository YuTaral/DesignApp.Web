import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BUILDER, CEILING_LIGHTS } from "@/lib/constants"
import { useCatalog, type Plan } from "./api"
import { useBuilderStore } from "./builder-store"
import { isCeilingLight } from "./lights"
import { extent, fitInside } from "./room-outline"

/**
 * The room's ceiling lights in the Ceiling tab: each one by name (clicking it selects it, to change it here or drag it on
 * the plan), then a button per kind of light that adds one, selected: in the room's middle, or the nearest free spot to
 * it on a grid `BUILDER.scene.lights.apart` wide, so lights added one after another don't hide each other.
 * @param props.plan - The room.
 * @param props.heading - Whether it says "Ceiling lights" above (not when a section of that name holds it).
 */
export function CeilingLightList({ plan, heading = true }: { plan: Plan; heading?: boolean }) {
  const { selected, select, add } = useBuilderStore()
  const catalog = useCatalog(plan.roomType).data ?? []
  const lights = plan.items.map((item, index) => ({ item, index })).filter(({ item }) => isCeilingLight(item.shape))
  const full = plan.items.length >= BUILDER.maxItems
  const { clear, apart } = BUILDER.scene.lights
  const size = extent(plan)
  // Spots on a grid out from the middle, nearest first, kept inside the room (on its floor when it isn't a rectangle).
  const spots = [0, 1, -1, 2, -2]
    .flatMap((across) => [0, 1, -1, 2, -2].map((down) => ({ across, down })))
    .sort((a, b) => Math.hypot(a.across, a.down) - Math.hypot(b.across, b.down))
    .map(({ across, down }) => fitInside(plan, size.width / 2 + across * apart, size.length / 2 + down * apart, clear, clear))
  const free = spots.find((spot) => !lights.some(({ item }) => Math.hypot(item.x - spot.x, item.y - spot.y) < apart / 2)) ?? spots[0]

  return (
    <div className="space-y-2" data-ceiling-lights>
      {heading && <p className="text-sm font-medium">Ceiling lights</p>}
      {lights.length === 0 ? (
        <p className="text-xs text-muted-foreground">No ceiling light yet. Add one: it starts in the middle, and you drag it on the plan over what it lights.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {lights.map(({ item, index }) => (
            <Button
              key={index}
              variant={index === selected ? "default" : "outline"}
              size="sm"
              className="h-auto rounded-lg px-2.5 py-1 font-normal"
              onClick={() => select(index)}
              data-ceiling-light={index}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {CEILING_LIGHTS.map((light) => {
          const object = catalog.find((o) => o.key === light.key)

          return (
            <Button
              key={light.key}
              variant="ghost"
              size="sm"
              className="h-auto rounded-lg px-2 py-1 font-normal"
              disabled={!object || full}
              onClick={() => object && add(object, free)}
              data-add-ceiling-light={light.shape}
            >
              <PlusIcon data-icon="inline-start" />
              {light.name}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
