import { VIEW_CORNER } from "@/lib/constants"
import { useBuilderStore } from "./builder-store"
import type { Plan } from "./api"
import { CornerChoice } from "./corner-choice"
import { WallChoice } from "./wall-choice"

/** The captions and screen-reader names of the view's two choices, by where they are shown. */
const WORDS = {
  panel: { wall: "The photo looks at", wallLabel: "Wall the photo looks at", corner: "Taken from", cornerLabel: "Where the photo is taken from" },
  view: { wall: "Looking at", wallLabel: "Wall in view", corner: "Taken from", cornerLabel: "Where the camera stands" },
} as const

/**
 * Which wall the photo looks at and where it is taken from, each with its caption above it.
 * @param props.plan - The room.
 * @param props.place - "panel": in the room's settings, one under the other with bold captions; "view": under the 3D
 * view, centered with small captions, side by side when there is room.
 */
export function ViewChoice({ plan, place }: { plan: Plan; place: "panel" | "view" }) {
  const setRoom = useBuilderStore((state) => state.setRoom)
  const words = WORDS[place]
  const caption = place === "panel" ? "text-sm font-medium" : "text-xs text-muted-foreground"
  const group = place === "panel" ? "space-y-2" : "flex flex-col items-center gap-1"
  const wall = <WallChoice plan={plan} value={plan.view} label={words.wallLabel} onPick={(view) => setRoom({ view })} />
  const corner = (
    <CornerChoice value={plan.corner ?? VIEW_CORNER.None} label={words.cornerLabel} spot={!!plan.cameraSpot} onPick={(corner) => setRoom({ corner })} />
  )

  if (place === "panel") {
    return (
      <>
        <div className={group}>
          <p className={caption}>{words.wall}</p>
          {wall}
        </div>
        <div className={group}>
          <p className={caption}>{words.corner}</p>
          {corner}
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-wrap items-end justify-center gap-x-6 gap-y-3 text-sm">
      <div className={group}>
        <span className={caption}>{words.wall}</span>
        {wall}
      </div>
      <div className={group}>
        <span className={caption}>{words.corner}</span>
        {corner}
      </div>
    </div>
  )
}
