import { AlertTriangleIcon, CheckIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { MESSAGES, VIEW_CORNER_NAMES } from "@/lib/constants"
import type { Plan, PlanShot } from "./api"
import { keyOf, viewName, type Picture } from "./generate-views"
import { wallName, walls } from "./room-outline"

/**
 * The Generate photo screen's views: a small picture of each, grouped by wall, to pick one or more of; a blocked view
 * is marked. Views not drawn yet show a placeholder of the same size.
 * @param props.plan - The room.
 * @param props.shots - Every view, in order.
 * @param props.pictures - The pictures drawn so far.
 * @param props.drawn - Whether they all are.
 * @param props.failed - Whether drawing them failed (then no photo can be made).
 * @param props.chosen - The picked views' keys.
 * @param props.onChoose - Picks a new set of views.
 */
export function ViewPicker({
  plan,
  shots,
  pictures,
  drawn,
  failed,
  chosen,
  onChoose,
}: {
  plan: Plan
  shots: PlanShot[]
  pictures: Picture[]
  drawn: boolean
  failed: boolean
  chosen: Set<string>
  onChoose: (chosen: Set<string>) => void
}) {
  /**
   * Picks or unpicks a view.
   * @param key - The view's key.
   */
  const toggle = (key: string) => {
    const next = new Set(chosen)

    if (!next.delete(key)) {
      next.add(key)
    }

    onChoose(next)
  }

  return (
    <section className="space-y-3" aria-label="Views">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Views</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="xs" disabled={!drawn || failed} onClick={() => onChoose(new Set(pictures.filter((p) => !p.blocking).map((p) => keyOf(p.shot))))}>
            All open views
          </Button>
          <Button variant="ghost" size="xs" disabled={chosen.size === 0 || failed} onClick={() => onChoose(new Set())}>
            None
          </Button>
        </div>
      </div>
      {failed && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-views-failed>
          {MESSAGES.guideFailed} Photos can't be made in this browser.
        </p>
      )}
      <div className={cn("grid gap-x-4 gap-y-3 sm:grid-cols-2", failed && "hidden")}>
        {walls(plan).map((wall) => (
          <div key={wall.index} className="space-y-1.5" data-view-wall={wall.index}>
            <p className="text-xs font-medium text-muted-foreground">Looking at the {wallName(plan, wall.index).toLowerCase()}</p>
            <div className="grid grid-cols-3 gap-2">
              {shots
                .filter((shot) => shot.view === wall.index)
                .map((shot) => {
                  const key = keyOf(shot)
                  const picture = pictures.find((p) => keyOf(p.shot) === key)

                  return picture ? (
                    <ViewTile key={key} plan={plan} picture={picture} on={chosen.has(key)} onToggle={() => toggle(key)} />
                  ) : (
                    <div key={key} className="space-y-1 p-1" aria-hidden data-view-drawing>
                      <span className="block aspect-[4/3] w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                      <span className="block truncate text-[11px] text-muted-foreground">{VIEW_CORNER_NAMES[shot.corner]}</span>
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * One drawn view: its picture, a check when picked, and a badge when something blocks it.
 * @param props.plan - The room.
 * @param props.picture - The view and its picture.
 * @param props.on - Whether it is picked.
 * @param props.onToggle - Picks or unpicks it.
 */
function ViewTile({ plan, picture, on, onToggle }: { plan: Plan; picture: Picture; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={`${viewName(plan, picture.shot)}${picture.blocking ? `, blocked by the ${picture.blocking.label}` : ""}`}
      data-view-pick={keyOf(picture.shot)}
      onClick={onToggle}
      className={cn(
        "group space-y-1 rounded-lg p-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        on && "bg-accent ring-2 ring-primary hover:bg-accent"
      )}
    >
      <span className="relative block overflow-hidden rounded-md">
        <img src={picture.url} alt="" className="aspect-[4/3] w-full object-cover" />
        {on && (
          <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft">
            <CheckIcon className="size-3.5" aria-hidden />
          </span>
        )}
        {picture.blocking && (
          <span
            className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/65 px-1.5 py-0.5 text-[11px] leading-tight text-amber-300"
            title={`The ${picture.blocking.label} stands in front of the camera`}
            data-view-blocked-badge
          >
            <AlertTriangleIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">Blocked</span>
          </span>
        )}
      </span>
      <span className="block truncate text-[11px] text-muted-foreground">{VIEW_CORNER_NAMES[picture.shot.corner]}</span>
    </button>
  )
}
