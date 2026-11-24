import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router"
import { ArrowLeftIcon, ImageOffIcon, LayoutGridIcon, LogInIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccount } from "@/features/account/api"
import { usePlan } from "@/features/builder/api"
import { useDesign } from "@/features/designs/api"
import { ConfirmDialog } from "@/features/designs/components"
import { AnalyzeOption, ChangeOption } from "@/features/photos/photo-options"
import { PanoramaViewer } from "@/features/photos/panorama-viewer"
import { PhotoViewer } from "@/features/photos/photo-viewer"
import { RoomViewSwitch, type RoomView } from "@/features/photos/room-view-switch"
import { chooseRoomTake, saveRoomToPlanDesign, startRoomAnalysis, useRoom, useRoomTakes } from "@/features/rooms/api"
import type { PhotoTake } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import { MESSAGES, QUERY_KEYS, ROOM_STATUS, ROOM_TYPE_NAMES, ROUTES } from "@/lib/constants"

/**
 * Route `/rooms/$roomId/photos`: the photos of a room builder run, one room. The room's photo is shown large, with arrows
 * on either side (and the arrow keys) to switch, and all of them as small pictures below. On the right: "Change with AI" makes a new version
 * of the photo shown from the user's words, and "Analyze this photo" makes it the room's photo and opens it in the
 * editor, to recolor it and remove objects. The room is in the plan's own design; a guest's goes there once they sign in.
 */
export function PhotosPage() {
  const { roomId } = useParams({ from: ROUTES.photos })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const here = useRouterState({ select: (state) => state.location.href })
  const signedIn = useAccount().data?.signedIn === true
  const room = useRoom(roomId)
  const takes = useRoomTakes(roomId)
  const plan = usePlan(room.data?.planId ?? undefined)
  const design = useDesign(signedIn ? (plan.data?.designId ?? undefined) : undefined)
  const [shownId, setShownId] = useState<string | null>(null)
  // The photos, or the room's 360° photo to look around and save views of.
  const [view, setView] = useState<RoomView>("photos")
  // The photo the "Analyze this photo instead?" question is about, while it is asked.
  const [confirmFor, setConfirmFor] = useState<PhotoTake | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const saving = useRef(false)
  const list = useMemo(() => takes.data ?? [], [takes.data])
  const index = Math.max(0, list.findIndex((t) => t.id === (shownId ?? room.data?.chosenTakeId)))
  const shown = list[index]
  const inDesign = design.data?.rooms.some((r) => r.roomId === roomId) ?? false

  const show = (position: number) => {
    setShownId(list[position]?.id ?? null)
  }

  /**
   * Makes a photo the room's (when it isn't, or to analyze it afresh after its analysis failed), starts its analysis
   * (when it waits for one) and opens the editor.
   * @param take - The photo.
   */
  const analyze = async (take: PhotoTake) => {
    const current = room.data

    if (!current) {
      return
    }

    setAnalyzing(true)

    try {
      const kept = take.id === current.chosenTakeId && current.status !== ROOM_STATUS.Failed
      const chosen = kept ? current : await chooseRoomTake(roomId, take.id)
      const started = chosen.status === ROOM_STATUS.Waiting ? await startRoomAnalysis(roomId) : chosen

      queryClient.setQueryData(QUERY_KEYS.room(roomId), started)
      void navigate({ to: ROUTES.room, params: { roomId }, search: { design: inDesign ? design.data?.id : undefined } })
    } catch (error) {
      toast.error(errorMessage(error))
      setAnalyzing(false)
    }
  }

  /** Analyzes the photo shown; asks first when another photo was analyzed (its outlines and colors are replaced). */
  const onAnalyze = () => {
    const current = room.data
    const replaces = current && shown && shown.id !== current.chosenTakeId && current.status === ROOM_STATUS.Ready

    if (replaces) {
      setConfirmFor(shown)
    } else if (shown) {
      void analyze(shown)
    }
  }

  // A guest's photos go into the plan's design once they sign in (a signed-in user's went there as they were made, so
  // this only runs again when that design was deleted or was full).
  useEffect(() => {
    if (!signedIn || !room.data?.planId || !plan.data || design.isLoading || inDesign || saving.current) {
      return
    }

    saving.current = true
    saveRoomToPlanDesign(roomId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.plan(plan.data.id) })
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.designs })
        toast.success(MESSAGES.savedToPlanDesign)
      })
      .catch((error: unknown) => toast.error(errorMessage(error)))
  }, [signedIn, room.data?.planId, plan.data, design.isLoading, inDesign, roomId, queryClient])

  if (room.isError || takes.isError) {
    return (
      <EmptyState
        look="page"
        icon={ImageOffIcon}
        title={MESSAGES.roomNotFound}
        text={MESSAGES.roomMaybeRemoved}
        action={
          <Button size="lg" asChild>
            <Link to={ROUTES.build}>Build a room</Link>
          </Button>
        }
      />
    )
  }

  // A room with only its own photo (an upload, a sample room) has nothing to choose from here: its editor is the place.
  if (room.data && takes.data?.length === 0) {
    return (
      <EmptyState
        look="page"
        icon={ImageOffIcon}
        title="No photos to choose from"
        text="This room has only its own photo. Open it in the editor to restyle it."
        action={
          <Button size="lg" asChild>
            <Link to={ROUTES.room} params={{ roomId }} search={{}}>
              Open in the editor
            </Link>
          </Button>
        }
      />
    )
  }

  if (!room.data || !takes.data || !shown) {
    return (
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_20rem]">
        <Skeleton className="min-h-80 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  const title = plan.data ? plan.data.name || ROOM_TYPE_NAMES[plan.data.roomType] : "Your photos"

  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_20rem]" data-photos-page>
      <section className="flex min-w-0 flex-col gap-3" aria-label="Photos">
        <div className="flex flex-wrap items-center gap-2">
          {room.data.planId && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={ROUTES.plan} params={{ planId: room.data.planId }}>
                <ArrowLeftIcon data-icon="inline-start" />
                Room builder
              </Link>
            </Button>
          )}
          <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            {signedIn && inDesign && design.data && (
              <Button variant="outline" size="sm" asChild>
                <Link to={ROUTES.design} params={{ designId: design.data.id }} data-photos-design>
                  <LayoutGridIcon data-icon="inline-start" />
                  <span className="max-w-40 truncate">{design.data.name}</span>
                </Link>
              </Button>
            )}
            {!signedIn && (
              <Button variant="outline" size="sm" asChild>
                <Link to={ROUTES.signIn} search={{ redirect: here }} data-photos-sign-in>
                  <LogInIcon data-icon="inline-start" />
                  Sign in to save
                </Link>
              </Button>
            )}
          </div>
        </div>

        {room.data.panorama && <RoomViewSwitch value={view} options={["photos", "360"]} onPick={setView} />}
        {room.data.panorama && view === "360" ? (
          <PanoramaViewer roomId={room.data.id} panorama={room.data.panorama} />
        ) : (
          <PhotoViewer takes={list} shown={index} onShow={show} imageClassName="max-h-[70dvh]">
            {shown.id === room.data.chosenTakeId && room.data.status === ROOM_STATUS.Ready && <Badge variant="secondary">Analyzed</Badge>}
            {shown.id === room.data.chosenTakeId && room.data.status === ROOM_STATUS.Failed && <Badge variant="destructive">Analysis failed</Badge>}
          </PhotoViewer>
        )}
      </section>

      <aside className="flex flex-col gap-3" aria-label="What to do with this photo">
        <ChangeOption room={room.data} take={shown} onChanged={(made) => setShownId(made.id)} />
        <AnalyzeOption room={room.data} take={shown} busy={analyzing} onAnalyze={onAnalyze} />
      </aside>

      <ConfirmDialog
        open={confirmFor !== null}
        onOpenChange={(open) => !open && setConfirmFor(null)}
        title="Analyze this photo instead?"
        text={MESSAGES.replaceAnalysis}
        action="Analyze this photo"
        pending={analyzing}
        onConfirm={() => {
          const take = confirmFor

          setConfirmFor(null)

          if (take) {
            void analyze(take)
          }
        }}
      />
    </div>
  )
}
