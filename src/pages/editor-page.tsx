import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react"
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

import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAccount } from "@/features/account/api"
import { DesignFields } from "@/features/designs/design-fields"
import {
  toDesignEdits,
  toDesignSizes,
  toEditorEdits,
  toEditorSizes,
  useAddDesignRoom,
  useCreateDesign,
  useDesign,
  useDesigns,
  useSaveRoomColors,
  type Design,
} from "@/features/designs/api"
import { ColorPanel } from "@/features/editor/color-panel"
import { sameEdits, sameSizes, useEditorStore, type Edits, type SurfaceSizes } from "@/features/editor/editor-store"
import { PaintListButton } from "@/features/paints/paint-list"
import { NewObjectPanel } from "@/features/editor/new-object-panel"
import { OutlinePanel } from "@/features/editor/outline-panel"
import { PartsButton, PartsDialog } from "@/features/editor/parts-dialog"
import { RemoveObjectPanel } from "@/features/editor/remove-object-panel"
import { useOutlineFixes } from "@/features/editor/use-outline-fixes"
import { RoomCanvas } from "@/features/editor/room-canvas"
import { useEditorShortcuts } from "@/features/editor/use-editor-shortcuts"
import { AnalysisPanel } from "@/features/rooms/analysis-panel"
import { useAiAvailability, useRoom } from "@/features/rooms/api"
import { useLiveRoom } from "@/features/rooms/live"
import { isAnalysisFinished, type Room } from "@/features/rooms/types"
import { ApiError, apiUrl, errorMessage } from "@/lib/api"
import { useUploadStore } from "@/stores/upload-store"
import { toast } from "sonner"
import { AI_MODE, HTTP_STATUS, LIMITS, MESSAGES, ROOM_STATUS, type RoomStatus, ROUTES } from "@/lib/constants"

/** Badge text for each analysis status. */
const statusLabels: Record<RoomStatus, string> = {
  Waiting: "Not analyzed",
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

  if (room.isPending) {
    return <EditorSkeleton />
  }

  if (room.isError) {
    const notFound = room.error instanceof ApiError && room.error.status === HTTP_STATUS.notFound

    return (
      <EmptyState
        look="page"
        icon={notFound ? ImageOffIcon : TriangleAlertIcon}
        title={notFound ? MESSAGES.roomNotFound : MESSAGES.roomLoadFailed}
        text={notFound ? MESSAGES.roomMaybeRemoved : errorMessage(room.error)}
        action={
          notFound ? (
            <Button size="lg" asChild>
              <Link to={ROUTES.home}>Upload a photo</Link>
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
  const editable = room.status === ROOM_STATUS.Ready && room.labelMapUrl !== null

  useLiveRoom(room.id, finished)
  const open = useEditorStore((state) => state.open)
  const marking = useEditorStore((state) => state.marking)

  useEffect(() => open(room.id), [open, room.id])
  const openDesign = useOpenDesign(room)

  // On a PC the editor fills the window under the header: the photo keeps its place, with the outline tools in a bar
  // across its width, and only the inspector scrolls, with Save pinned under it. On a phone the photo and the outline
  // bar sit above the inspector and the page scrolls as usual.
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:h-[calc(100dvh-3.5rem-1px)] lg:flex-none lg:flex-row lg:overflow-hidden">
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            {openDesign ? (
              <Link to={ROUTES.design} params={{ designId: openDesign.id }}>
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Link>
            ) : (
              <Link to={ROUTES.home}>
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Link>
            )}
          </Button>
          {openDesign && (
            <h1 className="min-w-0 truncate text-sm font-medium" title={openDesign.name}>
              {openDesign.name}
            </h1>
          )}
          <Badge
            variant={room.status === ROOM_STATUS.Failed ? "destructive" : "secondary"}
            className="ml-auto gap-1.5"
            aria-live="polite"
          >
            {room.status === ROOM_STATUS.Ready && <CheckIcon className="size-3" aria-hidden />}
            {room.status === ROOM_STATUS.Failed && <TriangleAlertIcon className="size-3" aria-hidden />}
            {!finished && <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
            {statusLabels[room.status]}
          </Badge>
          {room.libraryRoom && <Badge variant="outline">Sample room</Badge>}
          <AiBadge room={room} />
          {editable && <EditorToolbar />}
        </div>
        {editable ? (
          <div
            className="relative aspect-(--photo-ratio) max-h-[min(72dvh,52rem)] min-h-72 w-full overflow-hidden rounded-2xl border bg-muted/40 p-2 shadow-soft lg:aspect-auto lg:max-h-none lg:min-h-0 lg:flex-1"
            style={{ "--photo-ratio": `${room.width} / ${room.height}` } as CSSProperties}
          >
            <ReadyCanvas room={room} />
          </div>
        ) : (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40 p-2 shadow-soft">
            <RoomPhoto room={room} />
          </div>
        )}
        {editable && !marking && <OutlinePanel room={room} />}
        {editable && <PartsDialog room={room} />}
      </section>

      <aside
        aria-label="Inspector"
        className="flex w-full shrink-0 flex-col rounded-2xl border bg-card shadow-soft lg:min-h-0 lg:w-80"
      >
        <div className="flex flex-col gap-5 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto [&>*]:shrink-0" data-inspector-scroll>
          <AnalysisPanel room={room} />

          <Separator />

          {editable && marking ? (
            <NewObjectPanel room={room} />
          ) : editable ? (
            <>
              <ColorPanel room={room} />
              <PartsButton room={room} />
              <PaintListButton room={room} />
              <RemoveObjectPanel room={room} />
            </>
          ) : (
            <div aria-disabled="true" className="space-y-2 opacity-60">
              <h2 className="font-medium">Color</h2>
              <p className="text-sm text-muted-foreground">Available once the AI has mapped your room.</p>
            </div>
          )}
        </div>

        <div className="border-t p-5 pt-4">
          <SaveDesign room={room} editable={editable} design={openDesign} />
        </div>
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
          if (image?.complete && image.naturalWidth > 0) {
            setLoaded(true)
          }
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

  if (!canChoose) {
    return null
  }

  return (
    <Badge variant="outline" className="gap-1">
      {room.aiMode === AI_MODE.Real ? <SparklesIcon className="size-3" aria-hidden /> : <FlaskConicalIcon className="size-3" aria-hidden />}
      {room.aiMode === AI_MODE.Real ? "Real AI" : "Fake AI"}
    </Badge>
  )
}

/**
 * The interactive canvas of a ready room, with brush strokes saved as outline fixes.
 * @param props.room - The room (Ready).
 */
function ReadyCanvas({ room }: { room: Room }) {
  const { save, saving } = useOutlineFixes(room)
  const partsObject = useEditorStore((state) => state.partsObject)

  return <RoomCanvas room={room} onStroke={save} saving={saving} active={partsObject === null} />
}

/** Undo, redo, before/after and reset-all, above the canvas. Also turns on the keyboard shortcuts. */
function EditorToolbar() {
  const { history, position, comparing, edits, marking, removing, undo, redo, toggleCompare, resetAll } = useEditorStore()
  const busy = marking || removing.length > 0
  const edited = Object.keys(edits).length > 0

  useEditorShortcuts()

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Undo" disabled={busy || position === 0} onClick={undo}>
            <Undo2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Redo" disabled={busy || position >= history.length - 1} onClick={redo}>
            <Redo2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>
      <Button variant={comparing ? "secondary" : "ghost"} size="sm" aria-pressed={comparing} disabled={marking || !edited} onClick={toggleCompare}>
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
 * Opens the design named by the `?design=` search parameter, when this room is in it: once the
 * room is ready, the room's saved colors replace what the editor shows (unless that design is
 * already open here, so unsaved changes stay). A design that can't be opened, or doesn't hold this
 * room, is dropped from the address with a message.
 * @param room - The room shown.
 * @returns The design the room is in, or null.
 */
function useOpenDesign(room: Room): Design | null {
  const { design: requested } = useSearch({ from: "/rooms/$roomId" })
  const navigate = useNavigate()
  const loadDesign = useEditorStore((state) => state.loadDesign)
  const design = useDesign(requested)
  const entry = design.data?.rooms.find((r) => r.roomId === room.id)
  const ready = room.status === ROOM_STATUS.Ready

  useEffect(() => {
    if (ready && design.data && entry) {
      loadDesign(room.id, design.data.id, toEditorEdits(entry.edits), toEditorSizes(entry.sizes))
    }
  }, [ready, design.data, entry, room.id, loadDesign])

  const failed = requested !== undefined && (design.isError || (design.data !== undefined && !entry))

  useEffect(() => {
    if (!failed) {
      return
    }

    toast.error(MESSAGES.designOpenFailed)
    void navigate({ to: ROUTES.room, params: { roomId: room.id }, search: {}, replace: true })
  }, [failed, navigate, room.id])

  return entry && design.data ? design.data : null
}

/**
 * Saving the colors. Guests are asked to sign in first (the colors stay while they do). A room in
 * a design saves its colors there; any other room is saved into a new design or an existing one.
 * While a new object is being marked, saving is off until the object is saved or cancelled, so a design is
 * never saved with a half-finished mark left out.
 * @param props.room - The room shown.
 * @param props.editable - Whether the room is ready to edit.
 * @param props.design - The design the room is in, if any.
 */
function SaveDesign({ room, editable, design }: { room: Room; editable: boolean; design: Design | null }) {
  const account = useAccount().data
  const here = useRouterState({ select: (state) => state.location.href })
  const { edits, savedEdits, sizes, savedSizes, markSaved, marking } = useEditorStore()
  const saveColors = useSaveRoomColors()
  const [choosing, setChoosing] = useState(false)
  const recolored = Object.keys(edits).length > 0
  const dirty = savedEdits ? !sameEdits(edits, savedEdits) || !sameSizes(sizes, savedSizes ?? {}) : recolored

  if (marking) {
    return (
      <div className="space-y-2">
        <Button size="lg" className="w-full" disabled>
          <SaveIcon data-icon="inline-start" />
          {!account?.signedIn ? "Sign in to save" : design ? "Save changes" : "Save design"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Save or cancel the new object first.</p>
      </div>
    )
  }

  if (!account?.signedIn) {
    return (
      <div className="space-y-2">
        <Button size="lg" className="w-full" variant={recolored ? "default" : "outline"} disabled={!account} asChild>
          <Link to={ROUTES.signIn} search={{ redirect: here }}>
            <LogInIcon data-icon="inline-start" />
            Sign in to save
          </Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Your colors stay here while you sign in. Rooms not saved to a design are deleted after a day.
        </p>
      </div>
    )
  }

  if (design) {
    const save = () => {
      const [snapshot, sizesSnapshot] = [edits, sizes]

      saveColors.mutate(
        { designId: design.id, roomId: room.id, edits: toDesignEdits(snapshot), sizes: toDesignSizes(sizesSnapshot) },
        {
          onSuccess: (saved) => {
            markSaved(saved.id, snapshot, sizesSnapshot)
            toast.success(MESSAGES.colorsSaved)
          },
          onError: (error) => toast.error(errorMessage(error)),
        },
      )
    }

    return (
      <div className="space-y-2">
        <Button size="lg" className="w-full" disabled={!editable || !dirty || saveColors.isPending} onClick={save}>
          {saveColors.isPending ? (
            <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
          ) : dirty ? (
            <SaveIcon data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          {saveColors.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Saved in {design.name}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Button size="lg" className="w-full" disabled={!editable} onClick={() => setChoosing(true)}>
        <SaveIcon data-icon="inline-start" />
        Save design
      </Button>
      <p className="text-center text-xs text-muted-foreground">Rooms not saved to a design are deleted after a day.</p>
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent>
          {/* The dialog drops its content once closed, so the form starts fresh on every open. */}
          <SaveToDesignForm room={room} edits={edits} sizes={sizes} onDone={() => setChoosing(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Saves the room with its colors into a new design (a name and an optional description) or into
 * one of the account's designs, then puts that design in the address so a reload opens it again.
 * @param props.room - The room.
 * @param props.edits - Its colors.
 * @param props.sizes - The sizes of its surfaces.
 * @param props.onDone - Closes the dialog (after saving, or on Cancel).
 */
function SaveToDesignForm({ room, edits, sizes, onDone }: { room: Room; edits: Edits; sizes: SurfaceSizes; onDone: () => void }) {
  const designs = useDesigns(true)
  const create = useCreateDesign()
  const addRoom = useAddDesignRoom()
  const markSaved = useEditorStore((state) => state.markSaved)
  const navigate = useNavigate()
  const existing = designs.data ?? []
  const [mode, setMode] = useState<"new" | "existing">("new")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [target, setTarget] = useState<string | null>(null)
  const id = useId()
  const pending = create.isPending || addRoom.isPending
  const error = create.error ?? addRoom.error
  const canSave = mode === "new" ? name.trim().length > 0 : target !== null

  const saved = (design: Design, snapshot: Edits, sizesSnapshot: SurfaceSizes) => {
    markSaved(design.id, snapshot, sizesSnapshot)
    onDone()
    toast.success(mode === "new" ? MESSAGES.designSaved : MESSAGES.addedTo(design.name))
    void navigate({ to: ROUTES.room, params: { roomId: room.id }, search: { design: design.id }, replace: true })
  }

  const onSubmit = (event: FormEvent) => {
    const [snapshot, sizesSnapshot] = [edits, sizes]

    event.preventDefault()

    if (mode === "new") {
      create.mutate(
        { roomId: room.id, name: name.trim(), description: description.trim(), edits: toDesignEdits(snapshot), sizes: toDesignSizes(sizesSnapshot) },
        { onSuccess: (design) => saved(design, snapshot, sizesSnapshot) },
      )
    } else if (target) {
      addRoom.mutate(
        { designId: target, roomId: room.id, edits: toDesignEdits(snapshot), sizes: toDesignSizes(sizesSnapshot) },
        { onSuccess: (design) => saved(design, snapshot, sizesSnapshot) },
      )
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Save design</DialogTitle>
        <DialogDescription>Start a new design with this room, or add it to one of yours.</DialogDescription>
      </DialogHeader>

      {existing.length > 0 && (
        <div role="radiogroup" aria-label="Where to save" className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1">
          {(["new", "existing"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                mode === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "new" ? "New design" : "Add to a design"}
            </button>
          ))}
        </div>
      )}

      {mode === "new" ? (
        <DesignFields
          id={id}
          name={name}
          description={description}
          onName={setName}
          onDescription={setDescription}
          rows={2}
          placeholders={{ name: "Sage walls, oak floor", description: "Calm greens for the whole flat" }}
        />
      ) : (
        <div role="radiogroup" aria-label="Design" className="grid max-h-64 gap-1 overflow-y-auto">
          {existing.map((design) => {
            const full = design.rooms.length >= LIMITS.design.rooms

            return (
              <button
                key={design.id}
                type="button"
                role="radio"
                aria-checked={target === design.id}
                disabled={full}
                onClick={() => setTarget(design.id)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                  target === design.id ? "border-primary bg-accent/50" : "hover:bg-muted/60",
                )}
              >
                <span className="min-w-0 truncate font-medium">{design.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {full ? "Full" : `${design.rooms.length} ${design.rooms.length === 1 ? "room" : "rooms"}`}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave || pending}>
          {pending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
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
