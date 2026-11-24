import { cn } from "cn"

/** What a built room's card or photo page shows: its photos, the room in 3D, or its 360° photo. */
export type RoomView = "photos" | "3d" | "360"

/** Each view's name on the switch. */
const LABELS: Record<RoomView, string> = { photos: "Photos", "3d": "3D", "360": "360°" }

/**
 * Switches between a built room's photos, the room in 3D and its 360° photo.
 * @param props.value - What is shown.
 * @param props.options - The views this room has, in order.
 * @param props.onPick - Shows another view.
 */
export function RoomViewSwitch({ value, options, onPick }: { value: RoomView; options: RoomView[]; onPick: (value: RoomView) => void }) {
  return (
    <div role="radiogroup" aria-label="Show" className="inline-flex gap-1 self-start rounded-xl border bg-muted/40 p-1 text-sm" data-room-view-switch>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          data-room-view={option}
          onClick={() => onPick(option)}
          className={cn(
            "rounded-lg px-2.5 py-0.5 font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            value === option ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  )
}
