import { useState, type ReactNode } from "react"
import { Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon, ImageOffIcon, ScanSearchIcon, SaveIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { useRoom } from "@/features/rooms/api"
import type { Room, RoomStatus } from "@/features/rooms/types"
import { ApiError, apiUrl, errorMessage } from "@/lib/api"
import { useUploadStore } from "@/stores/upload-store"

/** Preset colors offered in the Color panel. */
const swatches = ["#e8dcc8", "#c9a27e", "#b5543c", "#7d8b6a", "#4a6274", "#2f2c2a", "#f4f1ea", "#d8c3a5"]

/** Badge text for each analysis status. */
const statusLabels: Record<RoomStatus, string> = {
  Uploaded: "Waiting for analysis",
  Analyzing: "Finding objects…",
  Segmenting: "Outlining objects…",
  Ready: "Ready",
  Failed: "Analysis failed",
}

/** Route `/rooms/$roomId`: loads the room and shows the editor, a loading state, or an error. */
export function EditorPage() {
  const { roomId } = useParams({ from: "/rooms/$roomId" })
  const room = useRoom(roomId)

  if (room.isPending) return <EditorSkeleton />

  if (room.isError) {
    const notFound = room.error instanceof ApiError && room.error.status === 404
    return (
      <CenteredMessage
        icon={notFound ? ImageOffIcon : TriangleAlertIcon}
        title={notFound ? "We couldn't find that room" : "We couldn't load this room"}
        text={notFound ? "It may have been removed. Upload a photo to start a new design." : errorMessage(room.error)}
        action={
          notFound ? (
            <Button size="lg" asChild>
              <Link to="/">Upload a photo</Link>
            </Button>
          ) : (
            <Button size="lg" onClick={() => room.refetch()}>
              Try again
            </Button>
          )
        }
      />
    )
  }

  return <Editor room={room.data} />
}

/**
 * The editor: the photo on the left, the objects and color tools on the right.
 * The tools stay disabled until the AI pipeline (milestone 3) provides objects.
 * @param props.room - The room to edit.
 */
function Editor({ room }: { room: Room }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeftIcon data-icon="inline-start" />
              Back
            </Link>
          </Button>
          <Badge variant="secondary" className="ml-auto gap-1.5">
            <ScanSearchIcon className="size-3" />
            {statusLabels[room.status]}
          </Badge>
        </div>
        <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40 p-2 shadow-soft">
          <RoomPhoto room={room} />
        </div>
      </section>

      <aside
        aria-label="Inspector"
        className="flex w-full shrink-0 flex-col gap-5 rounded-2xl border bg-card p-5 shadow-soft lg:w-80"
      >
        <div>
          <h2 className="font-medium">Objects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Objects in your photo will appear here once the AI has analyzed it.
          </p>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
            <Skeleton className="h-9 w-3/5" />
          </div>
        </div>

        <Separator />

        <div aria-disabled="true" className="space-y-4 opacity-60">
          <h2 className="font-medium">Color</h2>
          <div className="grid grid-cols-8 gap-2">
            {swatches.map((color) => (
              <button
                key={color}
                type="button"
                disabled
                aria-label={`Color ${color}`}
                className="aspect-square rounded-lg border shadow-soft"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Strength</span>
              <span className="text-muted-foreground">80%</span>
            </div>
            <Slider defaultValue={[80]} max={100} step={1} disabled aria-label="Recolor strength" />
          </div>
        </div>

        <Button size="lg" className="mt-auto w-full" disabled>
          <SaveIcon data-icon="inline-start" />
          Save design
        </Button>
      </aside>
    </div>
  )
}

/**
 * Shows the stored photo from the API. Right after an upload, the local preview of the same
 * photo sits underneath so there's no blank gap while the stored copy downloads.
 * @param props.room - The room whose photo to show.
 */
function RoomPhoto({ room }: { room: Room }) {
  const preview = useUploadStore((state) => (state.roomId === room.id ? state.previewUrl : null))
  const [loaded, setLoaded] = useState(false)
  const imageClass = "col-start-1 row-start-1 h-auto max-h-[70dvh] w-auto max-w-full rounded-xl object-contain"

  return (
    <div className="grid place-items-center">
      {!loaded &&
        (preview ? (
          <img src={preview} alt="" width={room.width} height={room.height} className={imageClass} />
        ) : (
          <Skeleton
            className="col-start-1 row-start-1 max-h-[70dvh] w-[min(100%,56rem)] rounded-xl"
            style={{ aspectRatio: `${room.width} / ${room.height}` }}
          />
        ))}
      <img
        // CORS mode from the start (before src), so the WebGL editor can read the same cached photo.
        crossOrigin="anonymous"
        src={apiUrl(room.photoUrl)}
        alt="Your room"
        width={room.width}
        height={room.height}
        // A photo already in the browser cache can finish before onLoad is attached.
        ref={(image) => {
          if (image?.complete && image.naturalWidth > 0) setLoaded(true)
        }}
        onLoad={() => setLoaded(true)}
        className={cn(imageClass, "transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
      />
    </div>
  )
}

/** Placeholder with the editor's layout while the room loads. */
function EditorSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row">
      <section className="flex flex-1 flex-col gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="min-h-80 flex-1 rounded-2xl" />
      </section>
      <Skeleton className="h-96 w-full rounded-2xl lg:w-80" />
    </div>
  )
}

/**
 * A centered icon, title, text and button, for not-found and error states.
 * @param props.icon - The icon to show.
 * @param props.title - The headline.
 * @param props.text - The explanation.
 * @param props.action - The button to offer.
 */
function CenteredMessage({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof ImageOffIcon
  title: string
  text: string
  action: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  )
}
