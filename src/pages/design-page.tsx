import { useState } from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  ImageOffIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/features/account/api"
import { toEditorEdits, toEditorSizes, useDesign, useRemoveDesignRoom, type Design, type DesignRoom } from "@/features/designs/api"
import { ConfirmDialog, DeleteDesignDialog, DesignDetailsDialog, Swatches } from "@/features/designs/components"
import { dateFormat, roomCount } from "@/features/designs/format"
import { PaintListDialog } from "@/features/paints/paint-list"
import { isPaintable } from "@/features/paints/paint-math"
import { RoomPhotos } from "@/features/photos/room-photos"
import { useRoom, useRoomTakes } from "@/features/rooms/api"
import { isAnalysisFinished } from "@/features/rooms/types"
import { ApiError, apiUrl, errorMessage } from "@/lib/api"
import { HTTP_STATUS, LIMITS, MESSAGES, PATHS, ROOM_STATUS, ROUTES } from "@/lib/constants"

/**
 * Route `/designs/$designId`: one design with its name, description and rooms. The details can be
 * edited, rooms opened, added (a new upload) or removed, and the design deleted.
 */
export function DesignPage() {
  const { designId } = useParams({ from: "/designs/$designId" })
  const account = useAccount()
  const signedIn = account.data?.signedIn === true
  const design = useDesign(signedIn ? designId : undefined)

  if (account.isPending || (signedIn && design.isPending)) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <EmptyState
          icon={ImageOffIcon}
          title={MESSAGES.designSignIn}
          text={MESSAGES.designsInAccount}
          action={
            <Button size="lg" asChild>
              <Link to={ROUTES.signIn} search={{ redirect: PATHS.design(designId) }}>
                Sign in
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (design.isError || !design.data) {
    const notFound = design.error instanceof ApiError && design.error.status === HTTP_STATUS.notFound

    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <EmptyState
          icon={notFound ? ImageOffIcon : TriangleAlertIcon}
          title={notFound ? MESSAGES.designNotFound : MESSAGES.designLoadFailed}
          text={notFound ? MESSAGES.designMaybeDeleted : errorMessage(design.error)}
          action={
            <Button size="lg" asChild>
              <Link to={ROUTES.designs}>My designs</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return <DesignView design={design.data} />
}

/**
 * The design's header and its rooms.
 * @param props.design - The design.
 */
function DesignView({ design }: { design: Design }) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null)
  const full = design.rooms.length >= LIMITS.design.rooms

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link to={ROUTES.designs}>
          <ArrowLeftIcon data-icon="inline-start" />
          My designs
        </Link>
      </Button>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{design.name}</h1>
          {design.description ? (
            <p className="mt-1.5 max-w-2xl text-sm whitespace-pre-line text-muted-foreground">{design.description}</p>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground italic">No description</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {roomCount(design.rooms.length)} · Saved {dateFormat.format(new Date(design.updatedAt))}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
          <div className="flex flex-wrap gap-2">
            {full ? (
              <Button disabled title={`A design holds up to ${LIMITS.design.rooms} rooms.`}>
                <PlusIcon data-icon="inline-start" />
                Add room
              </Button>
            ) : (
              <Button asChild>
                <Link to={ROUTES.build} search={{ step: undefined, design: design.id, newDesign: undefined, newDescription: undefined }} data-add-room>
                  <PlusIcon data-icon="inline-start" />
                  Add room
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialog("edit")}>
              <PencilIcon data-icon="inline-start" />
              Edit details
            </Button>
            <Button variant="destructive" onClick={() => setDialog("delete")}>
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </div>
          {full ? (
            <p className="text-xs text-muted-foreground">This design is full: it holds up to {LIMITS.design.rooms} rooms.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Builds a room in 3D for this design, or{" "}
              <Link to={ROUTES.home} search={{ design: design.id }} className="font-medium text-foreground underline-offset-4 hover:underline" data-upload-room>
                upload a photo to restyle
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {design.rooms.map((room, i) => (
          <RoomCard key={room.roomId} design={design} room={room} number={i + 1} />
        ))}
      </ul>

      <DesignDetailsDialog design={design} open={dialog === "edit"} onOpenChange={(open) => setDialog(open ? "edit" : null)} />
      <DeleteDesignDialog
        design={design}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onDeleted={() => void navigate({ to: ROUTES.designs })}
      />
    </div>
  )
}

/**
 * One room of the design: its photo, colors and analysis state, opening it in the editor. A room from the room builder
 * shows all its photos instead, across the page. A room can be removed unless it is the design's only room.
 * @param props.design - The design.
 * @param props.room - The room.
 * @param props.number - Its place in the design, from 1.
 */
function RoomCard({ design, room, number }: { design: Design; room: DesignRoom; number: number }) {
  const details = useRoom(room.roomId).data
  const takes = useRoomTakes(room.roomId, Boolean(details?.planId)).data ?? []
  const remove = useRemoveDesignRoom()
  const [confirming, setConfirming] = useState(false)
  const [listing, setListing] = useState(false)
  const only = design.rooms.length === 1
  const status = details?.status
  const label = `Room ${number}`
  const photos = takes.length > 0
  const paintable = details?.objects.some((o) => isPaintable(o.category) && room.edits.some((e) => e.objectIndex === o.index)) ?? false
  // Over the photo's corner on a small card; in the row above the photos on a builder room's.
  const corner = (place: string) => (photos ? undefined : `absolute opacity-90 shadow-soft ${place}`)

  const summary = (
    <>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium">{label}</p>
        <Swatches edits={room.edits} />
      </div>
      {status && status !== ROOM_STATUS.Ready && (
        <Badge variant={status === ROOM_STATUS.Failed ? "destructive" : "secondary"} className="gap-1">
          {status === ROOM_STATUS.Failed ? (
            <TriangleAlertIcon className="size-3" aria-hidden />
          ) : status !== ROOM_STATUS.Waiting && (
            <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
          )}
          {status === ROOM_STATUS.Failed ? "Failed" : status === ROOM_STATUS.Waiting ? "Not analyzed" : "Analyzing"}
        </Badge>
      )}
      {status === ROOM_STATUS.Ready && room.edits.length > 0 && <CheckIcon className="size-4 text-muted-foreground" aria-hidden />}
      {details && !isAnalysisFinished(details.status) && <span className="sr-only">Still being analyzed</span>}
    </>
  )

  const cardButtons = (
    <>
      {paintable && (
        <Button
          variant={photos ? "outline" : "secondary"}
          size="icon-sm"
          className={corner("top-2 right-11")}
          aria-label={`Paint list for ${label}`}
          title="Paint list"
          onClick={() => setListing(true)}
        >
          <ListChecksIcon />
        </Button>
      )}
      <Button
        variant={photos ? "outline" : "secondary"}
        size="icon-sm"
        className={corner("top-2 right-2")}
        aria-label={`Remove ${label}`}
        title={only ? MESSAGES.lastRoom : `Remove ${label}`}
        disabled={only}
        onClick={() => setConfirming(true)}
      >
        <XIcon />
      </Button>
    </>
  )

  return (
    <li className={cn("group relative overflow-hidden rounded-2xl border bg-card shadow-soft", photos && "sm:col-span-2 lg:col-span-3")}>
      {details && photos ? (
        <RoomPhotos room={details} takes={takes} designId={design.id} actions={cardButtons}>
          {summary}
        </RoomPhotos>
      ) : (
        <Link
          to={ROUTES.room}
          params={{ roomId: room.roomId }}
          search={{ design: design.id }}
          className="block outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`Open ${label}`}
        >
          <div className="overflow-hidden">
            <img
              src={apiUrl(room.photoUrl)}
              alt=""
              loading="lazy"
              className="aspect-[4/3] w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
            />
          </div>
          <div className="flex items-center gap-2 p-4">{summary}</div>
        </Link>
      )}
      {!photos && cardButtons}
      {details && paintable && (
        <PaintListDialog
          open={listing}
          onOpenChange={setListing}
          objects={details.objects}
          edits={toEditorEdits(room.edits)}
          sizes={toEditorSizes(room.sizes)}
        />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={MESSAGES.removeRoomTitle(label)}
        text={MESSAGES.removeRoomText}
        action="Remove room"
        pending={remove.isPending}
        onConfirm={() => {
          remove.mutate(
            { designId: design.id, roomId: room.roomId },
            {
              onSuccess: () => {
                setConfirming(false)
                toast.success(MESSAGES.roomRemoved)
              },
              onError: (error) => toast.error(errorMessage(error)),
            },
          )
        }}
      />
    </li>
  )
}
