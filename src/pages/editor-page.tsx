import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useParams, useRouterState, useSearch } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  LogInIcon,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAccount } from "@/features/account/api"
import {
  MAX_DESIGN_NAME,
  toDesignEdits,
  toEditorEdits,
  useCreateDesign,
  useDesign,
  useUpdateDesign,
} from "@/features/designs/api"
import { ColorPanel } from "@/features/editor/color-panel"
import { sameEdits, useEditorStore, type Edits } from "@/features/editor/editor-store"
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
import { toast } from "sonner"

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
  const designName = useOpenDesign(room)

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
          {designName && (
            <h1 className="min-w-0 truncate text-sm font-medium" title={designName}>
              {designName}
            </h1>
          )}
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

        <SaveDesign room={room} editable={editable} />
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

/**
 * Opens the saved design named by the `?design=` search parameter: once the room is ready, its
 * recolors replace what the editor shows (unless that design is already open). A design that
 * can't be opened, or belongs to another room, is dropped from the address with a message.
 * @param room - The room shown.
 * @returns The name of the design being edited, if any.
 */
function useOpenDesign(room: Room) {
  const { design: requested } = useSearch({ from: "/rooms/$roomId" })
  const navigate = useNavigate()
  const loadDesign = useEditorStore((state) => state.loadDesign)
  const openId = useEditorStore((state) => (state.roomId === room.id ? state.designId : null))
  const design = useDesign(requested)
  const ready = room.status === "Ready"

  useEffect(() => {
    if (ready && design.data && design.data.roomId === room.id) {
      loadDesign(room.id, design.data.id, toEditorEdits(design.data.edits))
    }
  }, [ready, design.data, room.id, loadDesign])

  const failed = requested !== undefined && (design.isError || (design.data !== undefined && design.data.roomId !== room.id))
  useEffect(() => {
    if (!failed) return
    toast.error("We couldn't open that design. It may have been deleted.")
    void navigate({ to: "/rooms/$roomId", params: { roomId: room.id }, search: {}, replace: true })
  }, [failed, navigate, room.id])

  // The design being edited: the one just opened, or one saved here.
  return useDesign(openId ?? undefined).data?.name ?? null
}

/**
 * Saving the recolors. Guests are asked to sign in first (the recolors stay while they do). A new
 * design asks for a name; an open design saves its changes, or can be saved as a new one.
 * @param props.room - The room shown.
 * @param props.editable - Whether the room is ready to edit.
 */
function SaveDesign({ room, editable }: { room: Room; editable: boolean }) {
  const account = useAccount().data
  const here = useRouterState({ select: (state) => state.location.href })
  const { roomId, edits, designId, savedEdits, markSaved } = useEditorStore()
  const design = useDesign(roomId === room.id && designId !== null ? designId : undefined).data
  const update = useUpdateDesign()
  const [naming, setNaming] = useState(false)
  const recolored = Object.keys(edits).length > 0
  const dirty = savedEdits ? !sameEdits(edits, savedEdits) : recolored

  if (!account?.signedIn) {
    return (
      <div className="mt-auto space-y-2">
        <Button size="lg" className="w-full" variant={recolored ? "default" : "outline"} disabled={!account} asChild>
          <Link to="/sign-in" search={{ redirect: here }}>
            <LogInIcon data-icon="inline-start" />
            Sign in to save
          </Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">Your colors stay here while you sign in.</p>
      </div>
    )
  }

  const saveChanges = () => {
    if (!design) return
    const snapshot = edits
    update.mutate(
      { id: design.id, name: design.name, edits: toDesignEdits(snapshot) },
      {
        onSuccess: (saved) => {
          markSaved(saved.id, snapshot)
          toast.success("Changes saved")
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <div className="mt-auto space-y-2">
      {design ? (
        <>
          <Button size="lg" className="w-full" disabled={!editable || !dirty || update.isPending} onClick={saveChanges}>
            {update.isPending ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
            ) : dirty ? (
              <SaveIcon data-icon="inline-start" />
            ) : (
              <CheckIcon data-icon="inline-start" />
            )}
            {update.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
          <Button variant="ghost" size="sm" className="w-full" disabled={!editable} onClick={() => setNaming(true)}>
            Save as new design
          </Button>
        </>
      ) : (
        <Button size="lg" className="w-full" disabled={!editable} onClick={() => setNaming(true)}>
          <SaveIcon data-icon="inline-start" />
          Save design
        </Button>
      )}
      <NameDesignDialog room={room} edits={edits} open={naming} onOpenChange={setNaming} />
    </div>
  )
}

/**
 * Asks for a name, then saves the recolors as a new design and puts it in the address, so a
 * reload or a bookmark opens it again.
 * @param props.room - The room.
 * @param props.edits - The recolors to save.
 * @param props.open - Whether the dialog is shown.
 * @param props.onOpenChange - Shows or hides it.
 */
function NameDesignDialog({
  room,
  edits,
  open,
  onOpenChange,
}: {
  room: Room
  edits: Edits
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The dialog drops its content once closed, so the name starts empty on every open. */}
        <NameDesignForm room={room} edits={edits} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * The name field and buttons of {@link NameDesignDialog}.
 * @param props.room - The room.
 * @param props.edits - The recolors to save.
 * @param props.onDone - Closes the dialog (after saving, or on Cancel).
 */
function NameDesignForm({ room, edits, onDone }: { room: Room; edits: Edits; onDone: () => void }) {
  const create = useCreateDesign()
  const markSaved = useEditorStore((state) => state.markSaved)
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const id = useId()

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const snapshot = edits
    create.mutate(
      { roomId: room.id, name: name.trim(), edits: toDesignEdits(snapshot) },
      {
        onSuccess: (design) => {
          markSaved(design.id, snapshot)
          onDone()
          toast.success("Design saved")
          void navigate({ to: "/rooms/$roomId", params: { roomId: room.id }, search: { design: design.id }, replace: true })
        },
      },
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Save design</DialogTitle>
        <DialogDescription>Give it a name so you can find it in My designs.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_DESIGN_NAME}
          placeholder="Sage walls, oak floor"
          autoFocus
          aria-invalid={create.isError}
        />
        {create.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(create.error)}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={name.trim().length === 0 || create.isPending}>
          {create.isPending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
          Save
        </Button>
      </DialogFooter>
    </form>
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
