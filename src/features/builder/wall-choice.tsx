import { cn } from "cn"

import type { Plan } from "./api"
import { wallName, walls } from "./room-outline"

/**
 * The room's walls as a row of buttons, in their order around the plan (Back, Right, Front, Left for a rectangle),
 * wrapping onto more lines for a room with many walls.
 * @param props.plan - The room.
 * @param props.value - The number of the wall chosen.
 * @param props.label - What the choice is for, for screen readers.
 * @param props.onPick - Takes a wall's number.
 */
export function WallChoice({ plan, value, label, onPick }: { plan: Pick<Plan, "outline">; value: number; label: string; onPick: (wall: number) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border bg-muted/40 p-1 text-sm">
      {walls(plan).map(({ index }) => (
        <button
          key={index}
          type="button"
          role="radio"
          aria-checked={value === index}
          data-wall-choice={index}
          onClick={() => onPick(index)}
          className={cn(
            "rounded-lg px-2.5 py-1 font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            value === index ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {wallName(plan, index).replace(" wall", "")}
        </button>
      ))}
    </div>
  )
}
