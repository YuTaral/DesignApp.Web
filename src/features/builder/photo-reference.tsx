import { useState } from "react"
import { cn } from "cn"

import { useRoom } from "@/features/rooms/api"
import { apiUrl } from "@/lib/api"

/**
 * The photo a plan was read from, small in a corner of the 3D view, to compare the two; a click makes it bigger, and
 * another smaller again. Nothing while it loads, or when the room is gone.
 * @param props.roomId - The uploaded room the plan was read from.
 */
export function PhotoReference({ roomId }: { roomId: string }) {
  const room = useRoom(roomId).data
  const [large, setLarge] = useState(false)

  if (!room) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => setLarge(!large)}
      aria-pressed={large}
      aria-label={large ? "Show your photo smaller" : "Show your photo bigger"}
      title="The photo this room was read from"
      className={cn(
        "absolute top-2 left-2 z-10 overflow-hidden rounded-lg border bg-card shadow-float outline-none transition-[width] focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
        large ? "w-1/2" : "w-24 sm:w-36"
      )}
      data-photo-reference
    >
      <img src={apiUrl(room.photoUrl)} alt="Your photo of the room" className="block w-full" />
      <span className="absolute bottom-0 left-0 rounded-tr-md bg-background/80 px-1.5 py-0.5 text-[11px] font-medium">Your photo</span>
    </button>
  )
}
