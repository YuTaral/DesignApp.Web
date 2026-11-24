import { useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { PencilRulerIcon, WandSparklesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PlanPreview } from "@/features/builder/plan-preview"
import type { PhotoTake, Room } from "@/features/rooms/types"
import { ROUTES } from "@/lib/constants"
import { PanoramaViewer } from "./panorama-viewer"
import { PhotoViewer } from "./photo-viewer"
import { RoomViewSwitch, type RoomView } from "./room-view-switch"

/**
 * All the photos of a room made in the room builder, shown in its card on a design's page: at the top the room's name,
 * links to change or analyze the photos (the photo page) and to the editor, and the card's own buttons; then the room's
 * photo first, large, with arrows to switch, and all of them as small pictures. A switch shows the room in 3D instead,
 * as it was last saved, with a way into the room builder to change it, or its 360° photo to look around and save views of.
 * @param props.room - The room.
 * @param props.takes - Its photos; at least one.
 * @param props.designId - The design it is shown in, for the editor link.
 * @param props.label - The room's name on the page, such as "Room 2".
 * @param props.canAdd - Whether the design has space for another room (Edit in 3D may make one).
 * @param props.actions - The card's own buttons (paint list, remove), after the links.
 * @param props.children - What the card says about the room (its name, colors and analysis), beside the links.
 */
export function RoomPhotos({
  room,
  takes,
  designId,
  label,
  canAdd,
  actions,
  children,
}: {
  room: Room
  takes: PhotoTake[]
  designId: string
  label: string
  canAdd: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const [shownId, setShownId] = useState<string | null>(null)
  const [view, setView] = useState<RoomView>("photos")
  const views: RoomView[] = ["photos", ...(room.planId ? (["3d"] as const) : []), ...(room.panorama ? (["360"] as const) : [])]
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
          {views.length > 1 && <RoomViewSwitch value={view} options={views} onPick={setView} />}
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
        {room.planId && view === "3d" ? (
          <PlanPreview planId={room.planId} roomId={room.id} label={label} canAdd={canAdd} />
        ) : room.panorama && view === "360" ? (
          <PanoramaViewer roomId={room.id} panorama={room.panorama} />
        ) : (
          <PhotoViewer takes={takes} shown={index} onShow={show} keys="focus" imageClassName="max-h-[60dvh]">
            {takes[index].id === room.chosenTakeId && <Badge variant="secondary">Room&apos;s photo</Badge>}
          </PhotoViewer>
        )}
      </div>
    </div>
  )
}
