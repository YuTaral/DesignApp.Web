import { useEffect, useRef, type ReactNode } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import type { PhotoTake } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"
import { PhotoStrip } from "./photo-strip"

/**
 * Style of the round arrows on either side of the big photo. They are centred with auto margins, not a translate: a
 * button's press effect sets its own translate, which would drop the arrow by half its height under the pointer and
 * lose the click when it was pressed in its upper half.
 */
const arrowClass = "absolute inset-y-0 my-auto rounded-full bg-background/85 shadow-soft backdrop-blur-sm hover:bg-background"

/**
 * A position in a list that goes round: one before the first is the last, one after the last the first.
 * @param index - The position, at most one outside the list.
 * @param count - The list's length.
 */
function around(index: number, count: number) {
  return (index + count) % count
}

/**
 * A room's photos: the shown one's number and note, then the photo large, with arrows on its left and right (and the
 * arrow keys) to switch, then all of them as small pictures. Used on the photo page and in a design's room photos.
 * @param props.takes - The photos; at least one.
 * @param props.shown - The position of the one shown.
 * @param props.onShow - Shows another photo, by its position.
 * @param props.keys - Where the arrow keys switch photos: anywhere on the page (one viewer on it), or, when the page
 * has several viewers, only while the focus or the pointer is on this one.
 * @param props.imageClassName - Extra classes for the big photo (its height limit).
 * @param props.children - More about the shown photo, after its note (badges).
 */
export function PhotoViewer({
  takes,
  shown,
  onShow,
  keys = "page",
  imageClassName,
  children,
}: {
  takes: PhotoTake[]
  shown: number
  onShow: (index: number) => void
  keys?: "page" | "focus"
  imageClassName?: string
  children?: ReactNode
}) {
  const rootRef = useRef<HTMLElement>(null)

  // The arrow keys switch photos: not while typing, nor while a dialog asks something (unless this is in that dialog),
  // nor, for one of several viewers, while the focus and the pointer are elsewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const root = rootRef.current
      const typing = (event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]")
      const dialog = document.querySelector("[role=dialog], [role=alertdialog]")
      const asking = dialog !== null && !dialog.contains(root)
      const others = document.querySelectorAll("[data-photo-viewer]").length > 1
      const elsewhere = keys === "focus" && others && !root?.contains(document.activeElement) && !root?.matches(":hover")

      if (typing || asking || elsewhere || takes.length < 2 || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
        return
      }

      event.preventDefault()
      onShow(around(shown + (event.key === "ArrowLeft" ? -1 : 1), takes.length))
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [takes.length, shown, onShow, keys])

  const take = takes[shown]
  const several = takes.length > 1

  return (
    <figure ref={rootRef} className="flex min-h-0 min-w-0 flex-col gap-2" data-photo-viewer>
      <figcaption className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {shown + 1} of {takes.length}
        </span>
        <span className="min-w-0 truncate">{take.changedFrom ? `Changed: ${take.note}` : take.note}</span>
        {children}
      </figcaption>
      <div className="relative overflow-hidden rounded-2xl border bg-muted">
        <img
          src={apiUrl(take.photoUrl)}
          alt={take.note || "The room"}
          className={cn("mx-auto w-full object-contain", imageClassName)}
          style={{ aspectRatio: `${take.width} / ${take.height}` }}
          data-photo-shown={take.id}
        />
        {several && (
          <>
            <Button variant="outline" size="icon" className={cn(arrowClass, "left-3")} aria-label="Previous photo" onClick={() => onShow(around(shown - 1, takes.length))} data-previous-photo>
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="icon" className={cn(arrowClass, "right-3")} aria-label="Next photo" onClick={() => onShow(around(shown + 1, takes.length))} data-next-photo>
              <ChevronRightIcon />
            </Button>
          </>
        )}
      </div>
      <PhotoStrip takes={takes} shown={shown} onShow={onShow} />
    </figure>
  )
}
