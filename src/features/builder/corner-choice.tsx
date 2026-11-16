import { cn } from "cn"

import { VIEW_CORNER, VIEW_CORNER_NAMES, type ViewCorner } from "@/lib/constants"

/**
 * Where the camera stands to look at the wall in view, as a row of buttons each as wide as its words, which never wrap:
 * straight across from the wall's middle, or in the near left or right corner, looking diagonally across the room.
 * @param props.value - Where it stands now.
 * @param props.label - What the choice is for, for screen readers.
 * @param props.onPick - Takes the new place.
 */
export function CornerChoice({ value, label, onPick }: { value: ViewCorner; label: string; onPick: (corner: ViewCorner) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 gap-1 rounded-xl border bg-muted/40 p-1 text-sm">
      {Object.values(VIEW_CORNER).map((corner) => (
        <button
          key={corner}
          type="button"
          role="radio"
          aria-checked={value === corner}
          data-corner-choice={corner}
          onClick={() => onPick(corner)}
          className={cn(
            "whitespace-nowrap rounded-lg px-2 py-1 font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            value === corner ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {VIEW_CORNER_NAMES[corner]}
        </button>
      ))}
    </div>
  )
}
