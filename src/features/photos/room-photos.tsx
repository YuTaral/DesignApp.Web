import { useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { PencilRulerIcon, WandSparklesIcon } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PlanPreview } from "@/features/builder/plan-preview"
import type { PhotoTake, Room } from "@/features/rooms/types"
import { ROUTES } from "@/lib/constants"
import { PhotoViewer } from "./photo-viewer"

/**
 * All the photos of a room made in the room builder, shown in its card on a design's page: at the top the room's name,
 * links to change or analyze the photos (the photo page) and to the editor, and the card's own buttons; then the room's
 * photo first, large, with arrows to switch, and all of them as small pictures. A switch shows the room in 3D instead,
 * as it was last saved, with a way into the room builder to change it.
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
  const [view, setView] = useState<"photos" | "3d">("photos")
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
          {room.planId && <ViewSwitch value={view} onPick={setView} />}
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
        ) : (
          <PhotoViewer takes={takes} shown={index} onShow={show} keys="focus" imageClassName="max-h-[60dvh]">
            {takes[index].id === room.chosenTakeId && <Badge variant="secondary">Room&apos;s photo</Badge>}
          </PhotoViewer>
        )}
      </div>
    </div>
  )
}

/**
 * Switches a built room's card between its photos and the room in 3D.
 * @param props.value - What is shown.
 * @param props.onPick - Shows the photos or the 3D view.
 */
function ViewSwitch({ value, onPick }: { value: "photos" | "3d"; onPick: (value: "photos" | "3d") => void }) {
  const options = [
    { value: "photos", label: "Photos" },
    { value: "3d", label: "3D" },
  ] as const

  return (
    <div role="radiogroup" aria-label="Show" className="inline-flex gap-1 rounded-xl border bg-muted/40 p-1 text-sm" data-room-view-switch>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-room-view={option.value}
          onClick={() => onPick(option.value)}
          className={cn(
            "rounded-lg px-2.5 py-0.5 font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            value === option.value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
