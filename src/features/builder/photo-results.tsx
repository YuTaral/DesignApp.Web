import { CheckIcon, LoaderCircleIcon } from "lucide-react"
import { cn } from "cn"

import type { Plan } from "./api"
import { keyOf, viewName, type Made } from "./generate-views"

/**
 * The photos being made on the Generate photo screen, each as its 3D view: a spinner while it is made, a check once it
 * is, or why it failed. As many columns as photos, up to three, so one or two photos fill the width rather than leave
 * gaps. When they are all made, the photo page opens.
 * @param props.plan - The room.
 * @param props.made - The photos.
 */
export function PhotoResults({ plan, made }: { plan: Plan; made: Made[] }) {
  return (
    <ul
      className={cn("grid gap-3", made.length === 1 ? "mx-auto w-full max-w-md" : made.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}
      data-results
    >
      {made.map((m) => (
        <li key={keyOf(m.picture.shot)} className="space-y-2" data-result={m.state}>
          <div className="relative overflow-hidden rounded-xl border bg-muted">
            <img src={m.picture.url} alt={`${viewName(plan, m.picture.shot)}, the 3D view`} className="aspect-[4/3] w-full object-cover opacity-60" />
            <div className="absolute inset-0 grid place-items-center" role="status" aria-label={m.state === "making" ? "Making the photo" : m.state === "done" ? "Made" : "Not made"}>
              {m.state === "making" && <LoaderCircleIcon className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden />}
              {m.state === "done" && (
                <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft">
                  <CheckIcon className="size-5" aria-hidden />
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{viewName(plan, m.picture.shot)}</p>
          {m.state === "failed" && <p className="text-xs text-destructive">{m.error}</p>}
        </li>
      ))}
    </ul>
  )
}
