import { useEffect, useState, type ReactNode } from "react"
import { Link, useParams } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  ColumnsIcon,
  FlaskConicalIcon,
  ImageOffIcon,
  LoaderCircleIcon,
  Redo2Icon,
  SaveIcon,
  SparklesIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ColorPanel } from "@/features/editor/color-panel"
import { useEditorStore } from "@/features/editor/editor-store"
import { OutlinePanel } from "@/features/editor/outline-panel"
import { useOutlineFixes } from "@/features/editor/use-outline-fixes"
import { RoomCanvas } from "@/features/editor/room-canvas"
import { useEditorShortcuts } from "@/features/editor/use-editor-shortcuts"
import { AnalysisPanel } from "@/features/rooms/analysis-panel"
import { useAiAvailability, useRoom } from "@/features/rooms/api"
import { useLiveRoom } from "@/features/rooms/live"
import { isAnalysisFinished, type Room, type RoomStatus } from "@/features/rooms/types"
import { ApiError, apiUrl, errorMessage } from "@/lib/api"
import { useUploadStore } from "@/stores/upload-store"

/** Badge text for each analysis status. */
const statusLabels: Record<RoomStatus, string> = {
  Uploaded: "Starting analysis…",
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
 * The editor: the photo on the left, the objects and color tools on the right. While the AI
 * analyzes the photo, progress arrives live; once it's ready the photo becomes the interactive
 * canvas and the tools come alive.
 * @param props.room - The room to edit.
 */
function Editor({ room }: { room: Room }) {
  const finished = isAnalysisFinished(room.status)
  const editable = room.status === "Ready" && room.labelMapUrl !== null
  useLiveRoom(room.id, finished)
  const open = useEditorStore((state) => state.open)
  useEffect(() => open(room.id), [open, room.id])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeftIcon data-icon="inline-start" />
              Back
            </Link>
          </Button>
          <Badge
            variant={room.status === "Failed" ? "destructive" : "secondary"}
            className="ml-auto gap-1.5"
            aria-live="polite"
          >
            {room.status === "Ready" && <CheckIcon className="size-3" aria-hidden />}
            {room.status === "Failed" && <TriangleAlertIcon className="size-3" aria-hidden />}
            {!finished && <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
            {statusLabels[room.status]}
          </Badge>
          <AiBadge room={room} />
          {editable && <EditorToolbar />}
        </div>
        {editable ? (
          <div
            className="relative w-full overflow-hidden rounded-2xl border bg-muted/40 p-2 shadow-soft"
            style={{ aspectRatio: `${room.width} / ${room.height}`, maxHeight: "min(72dvh, 52rem)", minHeight: "18rem" }}
          >
            <ReadyCanvas room={room} />
          </div>
        ) : (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40 p-2 shadow-soft">
            <RoomPhoto room={room} />
          </div>
        )}
      </section>

      <aside
        aria-label="Inspector"
        className="flex w-full shrink-0 flex-col gap-5 rounded-2xl border bg-card p-5 shadow-soft lg:w-80"
      >
        <AnalysisPanel room={room} />

        <Separator />

        {editable ? (
          <>
            <ColorPanel room={room} />
            <OutlinePanel room={room} />
          </>
        ) : (
          <div aria-disabled="true" className="space-y-2 opacity-60">
            <h2 className="font-medium">Color</h2>
            <p className="text-sm text-muted-foreground">Available once the AI has mapped your room.</p>
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mt-auto" tabIndex={0}>
              <Button size="lg" className="w-full" disabled>
                <SaveIcon data-icon="inline-start" />
                Save design
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Saving designs arrives with accounts.</TooltipContent>
        </Tooltip>
      </aside>
    </div>
  )
}

/**
 * Shows the stored photo from the API. Right after an upload, the local preview of the same
 * photo sits underneath (same size, same place) until the stored copy has faded in on top, so
 * there's never a blank frame.
 * @param props.room - The room whose photo to show.
 */
function RoomPhoto({ room }: { room: Room }) {
  const preview = useUploadStore((state) => (state.roomId === room.id ? state.previewUrl : null))
  const [loaded, setLoaded] = useState(false)
  const [shown, setShown] = useState(false)
  const imageClass = "col-start-1 row-start-1 h-auto max-h-[70dvh] w-auto max-w-full rounded-xl object-contain"

  return (
    <div className="grid place-items-center">
      {preview && !shown && <img src={preview} alt="" width={room.width} height={room.height} className={imageClass} />}
      {!preview && !loaded && (
        <Skeleton
          className="col-start-1 row-start-1 max-h-[70dvh] w-[min(100%,56rem)] rounded-xl"
          style={{ aspectRatio: `${room.width} / ${room.height}` }}
        />
      )}
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
        onTransitionEnd={() => setShown(true)}
        className={cn(imageClass, "transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
      />
    </div>
  )
}

/**
 * Which AI analyzed the room, where uploads can choose (Development), so test runs are easy to tell apart.
 * @param props.room - The room.
 */
function AiBadge({ room }: { room: Room }) {
  const canChoose = useAiAvailability().data?.canChoose
  if (!canChoose) return null
  return (
    <Badge variant="outline" className="gap-1">
      {room.aiMode === "Real" ? <SparklesIcon className="size-3" aria-hidden /> : <FlaskConicalIcon className="size-3" aria-hidden />}
      {room.aiMode === "Real" ? "Real AI" : "Fake AI"}
    </Badge>
  )
}

/**
 * The interactive canvas of a ready room, with brush strokes saved as outline fixes.
 * @param props.room - The room (Ready).
 */
function ReadyCanvas({ room }: { room: Room }) {
  const { save, saving } = useOutlineFixes(room)
  return <RoomCanvas room={room} onStroke={save} saving={saving} />
}

/** Undo, redo, before/after and reset-all, above the canvas. Also turns on the keyboard shortcuts. */
function EditorToolbar() {
  const { history, position, comparing, edits, undo, redo, toggleCompare, resetAll } = useEditorStore()
  useEditorShortcuts()
  const edited = Object.keys(edits).length > 0

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Undo" disabled={position === 0} onClick={undo}>
            <Undo2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Redo" disabled={position >= history.length - 1} onClick={redo}>
            <Redo2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>
      <Button variant={comparing ? "secondary" : "ghost"} size="sm" aria-pressed={comparing} disabled={!edited} onClick={toggleCompare}>
        <ColumnsIcon data-icon="inline-start" />
        Compare
      </Button>
      <Button variant="ghost" size="sm" disabled={!edited} onClick={resetAll} className="hidden sm:inline-flex">
        Reset all
      </Button>
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
