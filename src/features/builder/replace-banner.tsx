import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import type { Room } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"
import { ROUTES } from "@/lib/constants"

/**
 * Says, in the room builder opened with Edit in 3D, that the photos generated next replace a room of the design, with
 * a way to make a new room instead.
 * @param props.planId - The plan being built.
 * @param props.room - The room the photos replace.
 */
export function ReplaceBanner({ planId, room }: { planId: string; room: Room }) {
  return (
    // On a phone the button goes under the text rather than squeezing it.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border bg-accent/40 p-2 pr-3" role="status" data-replace-banner>
      <div className="flex min-w-60 flex-1 items-center gap-3">
        <img src={apiUrl(room.photoUrl)} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
        <p className="min-w-0 flex-1 text-sm">New photos will replace this room in its design; its current photos and colors are deleted.</p>
      </div>
      <Button variant="ghost" size="sm" className="ml-auto" asChild>
        <Link to={ROUTES.plan} params={{ planId }} search={{ replace: undefined }} replace data-add-instead>
          Add a new room instead
        </Link>
      </Button>
    </div>
  )
}
