import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

import { useLibrary } from "@/features/library/api"
import { apiUrl } from "@/lib/api"
import { ROUTES } from "@/lib/constants"

/** How many room thumbnails the strip shows. */
const shown = 4

/**
 * "No photo? Try a sample house": the living room (first room) of each sample house, linking to the library.
 * Nothing shows while the library loads or when it is empty.
 * @param props.designId - The design a tried room should go into (Add room on a design's page), if any.
 */
export function SampleStrip({ designId }: { designId?: string }) {
  const houses = useLibrary().data ?? []
  if (houses.length === 0) return null
  const rooms = houses.reduce((count, house) => count + house.rooms.length, 0)
  return (
    <Link
      to={ROUTES.library}
      search={{ design: designId, house: undefined }}
      className="group flex items-center gap-4 rounded-2xl border bg-card p-3 shadow-soft outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex shrink-0 -space-x-3" aria-hidden>
        {houses.slice(0, shown).map((house) => (
          <img
            key={house.id}
            src={apiUrl(house.rooms[0].layouts[0].thumbnailUrl)}
            alt=""
            loading="lazy"
            className="size-12 rounded-xl border-2 border-card object-cover"
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">No photo? Try a sample house</p>
        <p className="text-sm text-pretty text-muted-foreground">
          {houses.length === 1 ? houses[0].name : `${houses.length} houses`} · {rooms} rooms, already outlined
        </p>
      </div>
      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
    </Link>
  )
}
