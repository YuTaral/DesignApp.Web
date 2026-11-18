import { useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { PencilRulerIcon, WandSparklesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PhotoTake, Room } from "@/features/rooms/types"
import { ROUTES } from "@/lib/constants"
import { PhotoViewer } from "./photo-viewer"

/**
 * All the photos of a room made in the room builder, shown in its card on a design's page: at the top the room's name,
 * links to change or analyze the photos (the photo page) and to the editor, and the card's own buttons; then the room's
 * photo first, large, with arrows to switch, and all of them as small pictures.
 * @param props.room - The room.
 * @param props.takes - Its photos; at least one.
 * @param props.designId - The design it is shown in, for the editor link.
 * @param props.actions - The card's own buttons (paint list, remove), after the links.
 * @param props.children - What the card says about the room (its name, colors and analysis), beside the links.
 */
export function RoomPhotos({
  room,
  takes,
  designId,
  actions,
  children,
}: {
  room: Room
  takes: PhotoTake[]
  designId: string
  actions?: ReactNode
  children: ReactNode
}) {
  const [shownId, setShownId] = useState<string | null>(null)
  const index = Math.max(0, takes.findIndex((t) => t.id === (shownId ?? room.chosenTakeId)))
  const show = (position: number) => {
    setShownId(takes[position]?.id ?? null)
  }

  return (
    <div data-room-photos>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 p-4 pb-3">
        {/* At least this wide, so on a phone the links wrap under it rather than squeeze the room's name. */}
        <div className="flex min-w-48 flex-1 items-center gap-2">{children}</div>
        {/* Beside the room's name on a phone (the links wrap under both), after the links from tablet width up. */}
        {actions && <div className="flex gap-2 sm:order-last">{actions}</div>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={ROUTES.photos} params={{ roomId: room.id }} data-room-photos-page>
              <WandSparklesIcon data-icon="inline-start" />
              Change or analyze
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to={ROUTES.room} params={{ roomId: room.id }} search={{ design: designId }}>
              <PencilRulerIcon data-icon="inline-start" />
              Open in the editor
            </Link>
          </Button>
        </div>
      </div>
      <div className="px-3 pb-3">
        <PhotoViewer takes={takes} shown={index} onShow={show} keys="focus" imageClassName="max-h-[60dvh]">
          {takes[index].id === room.chosenTakeId && <Badge variant="secondary">Room&apos;s photo</Badge>}
        </PhotoViewer>
      </div>
    </div>
  )
}
