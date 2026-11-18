import { useEffect, useRef } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import type { PhotoTake } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"

/**
 * All of a room's photos as small pictures in a row, with arrows either side that show the one before or after; the
 * shown one is outlined. When the row doesn't fit it scrolls, without a scrollbar (the arrows move through it), and
 * keeps the shown one in view.
 * @param props.takes - The photos.
 * @param props.shown - The position of the one shown.
 * @param props.onShow - Shows another photo, by its position.
 */
export function PhotoStrip({ takes, shown, onShow }: { takes: PhotoTake[]; shown: number; onShow: (index: number) => void }) {
  const listRef = useRef<HTMLUListElement>(null)
  const several = takes.length > 1

  useEffect(() => {
    listRef.current?.querySelector("[aria-current=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [shown])

  return (
    <div className="flex items-center gap-2" data-photo-strip>
      <Button variant="outline" size="icon" aria-label="Previous photo" disabled={!several} onClick={() => onShow((shown - 1 + takes.length) % takes.length)} data-previous-photo>
        <ChevronLeftIcon />
      </Button>
      <ul ref={listRef} className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-1 [scrollbar-width:none]" aria-label="Photos">
        {takes.map((take, index) => (
          <li key={take.id} className="shrink-0">
            <button
              type="button"
              aria-label={`Photo ${index + 1} of ${takes.length}: ${take.note || "photo"}`}
              aria-current={index === shown}
              onClick={() => onShow(index)}
              className={cn(
                "block overflow-hidden rounded-lg outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50",
                index === shown ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
              )}
              data-photo-thumb={take.id}
            >
              <img src={apiUrl(take.photoUrl)} alt="" className="h-16 w-auto object-cover sm:h-20" style={{ aspectRatio: `${take.width} / ${take.height}` }} />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="icon" aria-label="Next photo" disabled={!several} onClick={() => onShow((shown + 1) % takes.length)} data-next-photo>
        <ChevronRightIcon />
      </Button>
    </div>
  )
}
