import { LoaderCircleIcon, RotateCcwIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import type { Room } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"
import type { Plan } from "./api"
import { keyOf, viewName, type Made, type Picture } from "./generate-views"

/**
 * The photos asked for on the Generate photo screen, each shown as it is made: its 3D view with a spinner while it is
 * made, then the photo with a button that opens it, or why it failed with a button that tries again. As many columns as
 * photos, up to three, so one or two photos fill the width rather than leave gaps.
 * @param props.plan - The room.
 * @param props.made - The photos.
 * @param props.onOpen - Opens a made photo's room in the editor.
 * @param props.onRetry - Makes a failed photo again.
 */
export function PhotoResults({
  plan,
  made,
  onOpen,
  onRetry,
}: {
  plan: Plan
  made: Made[]
  onOpen: (room: Room) => void
  onRetry: (picture: Picture) => void
}) {
  return (
    <ul
      className={cn("grid gap-3", made.length === 1 ? "mx-auto w-full max-w-md" : made.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}
      data-results
    >
      {made.map((m) => (
        <li key={keyOf(m.picture.shot)} className="space-y-2" data-result={m.state}>
          <div className="relative overflow-hidden rounded-xl border bg-muted">
            <img
              src={m.state === "done" ? apiUrl(m.room.photoUrl) : m.picture.url}
              alt={`${viewName(plan, m.picture.shot)}${m.state === "done" ? ", the photo" : ", the 3D view"}`}
              className={cn("aspect-[4/3] w-full object-cover", m.state !== "done" && "opacity-60")}
            />
            {m.state === "making" && (
              <div className="absolute inset-0 grid place-items-center" role="status" aria-label="Making the photo">
                <LoaderCircleIcon className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{viewName(plan, m.picture.shot)}</p>
          {m.state === "done" && (
            <Button size="sm" className="w-full" onClick={() => onOpen(m.room)} data-open-photo>
              Open in the editor
            </Button>
          )}
          {m.state === "failed" && (
            <div className="space-y-1.5">
              <p className="text-xs text-destructive">{m.error}</p>
              <Button size="sm" variant="outline" className="w-full" onClick={() => onRetry(m.picture)}>
                <RotateCcwIcon data-icon="inline-start" />
                Try again
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
