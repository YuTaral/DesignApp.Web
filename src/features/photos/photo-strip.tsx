import { useEffect, useRef } from "react"
import { cn } from "cn"

import type { PhotoTake } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"

/**
 * All of a room's photos as small pictures in a row; the shown one is outlined. When the row doesn't fit it scrolls,
 * without a scrollbar, and keeps the shown one in view. The arrows that move through them sit beside the big photo
 * (`PhotoViewer`).
 * @param props.takes - The photos.
 * @param props.shown - The position of the one shown.
 * @param props.onShow - Shows another photo, by its position.
 */
export function PhotoStrip({ takes, shown, onShow }: { takes: PhotoTake[]; shown: number; onShow: (index: number) => void }) {
  const listRef = useRef<HTMLUListElement>(null)

  // Brings the shown one into view by scrolling the row only: scrollIntoView would also scroll the page when the row is
  // below the fold, moving the big photo's arrows away from the pointer between two clicks.
  useEffect(() => {
    const list = listRef.current
    const item = list?.querySelector("[aria-current=true]")

    if (!list || !item) {
      return
    }

    const row = list.getBoundingClientRect()
    const box = item.getBoundingClientRect()

    if (box.left < row.left) {
      list.scrollLeft -= row.left - box.left
    } else if (box.right > row.right) {
      list.scrollLeft += box.right - row.right
    }
  }, [shown])

  return (
    <ul ref={listRef} className="flex min-w-0 justify-center-safe gap-2 overflow-x-auto p-1 [scrollbar-width:none]" aria-label="Photos" data-photo-strip>
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
  )
}
