import { Link } from "@tanstack/react-router"
import { LayoutGridIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/lib/constants"
import type { Design } from "@/features/designs/api"

/**
 * Says which design a new room is added to, with a way back to it; or, for a design not made yet (one typed in Build a
 * room, made with the room's first photo), its name.
 * @param props.design - The design: its id when it exists, and its name.
 * @param props.what - What is added: "photo" on the upload page, "room" in the library.
 * @param props.className - Extra classes, for its spacing on the page.
 */
export function TargetBanner({ design, what, className }: { design: Pick<Design, "name"> & { id?: string }; what: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border bg-accent/40 p-4", className)} role="status">
      <LayoutGridIcon className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        {design.id ? "The" : "A new design will be made with the first photo, and the"} {what} will be added to{" "}
        <span className="font-medium">{design.name}</span>.
      </p>
      {design.id && (
        <Button variant="ghost" size="sm" asChild>
          <Link to={ROUTES.design} params={{ designId: design.id }}>
            Cancel
          </Link>
        </Button>
      )}
    </div>
  )
}
