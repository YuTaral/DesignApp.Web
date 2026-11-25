import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangleIcon, ArrowLeftIcon, BoxIcon, CheckIcon, ImageIcon, LampCeilingIcon, LoaderCircleIcon, MapIcon, PanelTopIcon, RulerIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { generatePanorama, generateRoom, savePlan, usePlan, type Plan, type PlanShot, type RunPhoto } from "@/features/builder/api"
import { panoramaSpot, panoramaStartYaw } from "@/features/builder/panorama-spot"
import { isWallItem, useBuilderStore } from "@/features/builder/builder-store"
import { CatalogPanel } from "@/features/builder/catalog-panel"
import { GenerateDialog } from "@/features/builder/generate-dialog"
import { Inspector } from "@/features/builder/inspector"
import { PlanCanvas } from "@/features/builder/plan-canvas"
import { ReplaceBanner } from "@/features/builder/replace-banner"
import { objectBoxes, renderGuide, renderMaskPng, renderPanorama } from "@/features/builder/scene-3d"
import { View3d } from "@/features/builder/view-3d"
import { ViewChoice } from "@/features/builder/view-choice"
import { useBuilderShortcuts } from "@/features/builder/use-builder-shortcuts"
import { WallView } from "@/features/builder/wall-view"
import { useRoom } from "@/features/rooms/api"
import { errorMessage } from "@/lib/api"
import { AI_MODE, BUILDER, MESSAGES, QUERY_KEYS, ROOM_TYPE_NAMES, ROUTES, type PhotoStyle } from "@/lib/constants"

/** The middle of the builder: the floor plan, one wall seen straight on, or the 3D view. */
type View = "plan" | "wall" | "ceiling" | "3d"

/**
 * Route `/build/$planId`: step 3 of building a room. Windows, doors and common objects on the left; the floor plan, a
 * wall seen straight on (where windows and doors are placed) or the 3D view in the middle; the selected object or the
 * room on the right. Every change is saved shortly after it is made. Generate photo turns the 3D view into a realistic
 * photo and opens it in the editor as a new room; with `?replace=` (Edit in 3D on a design's page), the new room
 * replaces that room in its design.
 */
export function PlanPage() {
  const { planId } = useParams({ from: "/build/$planId" })
  const query = usePlan(planId)
  const { plan, load } = useBuilderStore()

  useEffect(() => {
    if (query.data) {
      load(query.data)
    }
  }, [query.data, load])

  if (query.isError) {
    return <p className="mx-auto max-w-md px-4 py-16 text-center text-muted-foreground">{MESSAGES.planLoadFailed}</p>
  }

  if (!plan || plan.id !== planId) {
    return (
      <div className="grid flex-1 place-items-center">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Opening the room" />
      </div>
    )
  }

  return <Builder plan={plan} />
}

/**
 * The builder for a loaded plan.
 * @param props.plan - The room as shown.
 */
function Builder({ plan }: { plan: Plan }) {
  const [view, setView] = useState<View>("plan")
  // Room shape mode on the plan: the walls are edited instead of the objects.
  const [shaping, setShaping] = useState(false)
  const [wall, setWall] = useState<number>(plan.view)
  const { replace } = useSearch({ from: ROUTES.plan })
  // The room the next photos replace, while it still exists (a run replaces it once).
  const replacing = useRoom(replace).data
  const { saving, failed, flush } = useAutosave(plan)
  const make = usePhotoMaker(plan, flush, replacing?.id)
  const makePanorama = usePanoramaMaker(plan, flush, replacing?.id)
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)

  // Copy, paste, duplicate, delete and deselect by keyboard; off while the photo dialog is open.
  useBuilderShortcuts(asking)
  const { selected, select } = useBuilderStore()
  const opening = plan.items[selected]
  const openingWall = opening && isWallItem(opening) ? opening.wall : null

  // Choosing a window or door shows its wall, where it is placed exactly (adjusted while rendering, when the
  // selection changes).
  const [shownFor, setShownFor] = useState(selected)

  if (shownFor !== selected) {
    setShownFor(selected)

    if (openingWall !== null) {
      setWall(openingWall)
      setView("wall")
    }
  }

  /**
   * Opens a tab; on the Wall tab an object selected on the floor is let go, so the right column shows the wall's.
   * @param next - The tab.
   */
  const open = (next: View) => {
    if ((next === "wall" && opening && !isWallItem(opening)) || (next === "ceiling" && opening)) {
      select(-1)
    }

    // Room shape mode belongs to the plan: coming back (as Add a floor area in 3D does) shows the objects.
    if (next !== "plan") {
      setShaping(false)
    }

    setView(next)
  }

  /**
   * Shows another wall; a window or door selected on the wall left behind is let go.
   * @param next - The wall.
   */
  const showWall = (next: number) => {
    if (openingWall !== null && openingWall !== next) {
      select(-1)
    }

    setWall(next)
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:h-[calc(100dvh-3.5rem-1px)] lg:flex-none lg:flex-row lg:overflow-hidden">
      <aside aria-label="Objects" className="order-2 rounded-2xl border bg-card p-4 shadow-soft lg:order-none lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
        <CatalogPanel plan={plan} wall={view === "wall" ? wall : null} onOpenWall={() => setView("wall")} />
      </aside>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={ROUTES.build}>
              <ArrowLeftIcon data-icon="inline-start" />
              New room
            </Link>
          </Button>
          <h1 className="min-w-0 truncate text-sm font-medium">
            {plan.name || ROOM_TYPE_NAMES[plan.roomType]} · {plan.width} × {plan.length} m
          </h1>
          {/* A fixed width, so "Saving…", "Saved" and "Not saved" don't move the buttons beside it under the pointer. */}
          <span
            className={cn("flex w-20 shrink-0 items-center gap-1 text-xs", failed ? "text-destructive" : "text-muted-foreground")}
            aria-live="polite"
            data-save-state={failed ? "failed" : saving ? "saving" : "saved"}
          >
            {failed ? (
              <AlertTriangleIcon className="size-3" aria-hidden />
            ) : saving ? (
              <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <CheckIcon className="size-3" aria-hidden />
            )}
            {failed ? "Not saved" : saving ? "Saving…" : "Saved"}
          </span>
        </div>
        {replacing && <ReplaceBanner planId={plan.id} room={replacing} />}
        {/*
          The tabs come first on a row of their own, so they stay put whichever tab is open; Room shape (on the plan
          only) and Generate photo follow them.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="View" className="flex w-full gap-1 rounded-xl border bg-muted/40 p-1 text-sm sm:w-auto">
            {(
              [
                ["plan", "Plan", MapIcon],
                ["wall", "Wall", PanelTopIcon],
                ["ceiling", "Ceiling", LampCeilingIcon],
                ["3d", "3D view", BoxIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => open(value)}
                className={cn(
                  "flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 font-medium sm:px-3 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  view === value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {view === "plan" && (
              <Button
                variant={shaping ? "default" : "outline"}
                aria-pressed={shaping}
                data-shape-toggle
                onClick={() => {
                  select(-1)
                  setShaping(!shaping)
                }}
              >
                <RulerIcon data-icon="inline-start" />
                {shaping ? "Done shaping" : "Room shape"}
              </Button>
            )}
            <Button disabled={plan.items.length === 0} onClick={() => setAsking(true)}>
              <ImageIcon data-icon="inline-start" />
              Generate photo
            </Button>
          </div>
        </div>
        {/* The 3D view needs room for its 4:3 picture and the choices under it, which wrap on a phone. */}
        <div className={cn("relative min-h-80 flex-1 overflow-hidden rounded-2xl border bg-muted/40 p-2 shadow-soft lg:min-h-0", (view === "3d" || view === "ceiling") && "min-h-[28rem]")}>
          {view === "plan" ? (
            // The plan, and under it the view the photo takes (marked on the plan), as under the 3D view.
            <div className="flex size-full flex-col gap-3">
              <div className="min-h-0 flex-1">
                <PlanCanvas
                  plan={plan}
                  shaping={shaping}
                  onWall={(next) => {
                    showWall(next)
                    open("wall")
                  }}
                />
              </div>
              {!shaping && (
                <div className="pb-2" data-plan-view-choice>
                  <ViewChoice plan={plan} place="view" />
                </div>
              )}
            </div>
          ) : view === "wall" ? (
            <WallView plan={plan} wall={wall} onWall={showWall} />
          ) : (
            // The ceiling's own tab shows the room in 3D tilted up, where its color and light are seen.
            <View3d plan={plan} tilt={view === "ceiling" ? BUILDER.scene.ceilingTilt : 0} />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {plan.items.length === 0
            ? "Add furniture to make a photo of the room."
            : plan.aiMode === AI_MODE.Real
              ? "Generate photo makes photos of the views you pick with the real AI (FLUX 3 Image Klein on fal.ai): about 1 cent each. Each is saved as a room, not analyzed until you ask."
              : "Generate photo uses the fake AI: each photo is its 3D view itself. Each is saved as a room."}
        </p>
      </section>

      <GenerateDialog
        open={asking}
        plan={plan}
        onClose={() => setAsking(false)}
        make={make}
        makePanorama={makePanorama}
        onDone={(roomId, failures) => {
          if (failures.length > 0) {
            toast.error(MESSAGES.photosFailed(failures.length, failures[0]))
          }

          void navigate({ to: ROUTES.photos, params: { roomId } })
        }}
      />

      <aside aria-label="Inspector" className="rounded-2xl border bg-card p-4 shadow-soft lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
        <Inspector plan={plan} focus={view === "plan" && shaping ? "shape" : view} shownWall={view === "wall" ? wall : null} onShowWall={showWall} onPlan={() => open("plan")} />
      </aside>
    </div>
  )
}

/**
 * Saves the plan shortly after each change. A failed save is tried again every few seconds until it gets through
 * (the error is shown once); leaving the builder saves what is left at once, and closing the tab first asks while
 * changes aren't saved.
 * @param plan - The room as shown.
 * @returns Whether it is saving, whether the last save failed, and `flush`, which saves now (resolves once saved).
 */
function useAutosave(plan: Plan) {
  const queryClient = useQueryClient()
  const { unsaved, saved } = useBuilderStore()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // A new number after each failure, so the wait for the next try starts again.
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(plan)

  /**
   * Says that the room couldn't be saved, and why.
   * @param error - What went wrong.
   */
  const showFailure = (error: unknown) => {
    toast.error(`${MESSAGES.planSaveFailed} ${errorMessage(error)}`)
  }

  /**
   * Sends the plan as shown now.
   * @param changes - How many changes it holds.
   */
  const send = async (changes: number) => {
    const result = await savePlan(latest.current)

    queryClient.setQueryData(QUERY_KEYS.plan(result.id), result)
    saved(changes)
  }

  /** Saves the plan as shown now. */
  const flush = async () => {
    const changes = useBuilderStore.getState().unsaved

    if (changes === 0) {
      return
    }

    setSaving(true)

    try {
      await send(changes)
      setFailed(false)
    } catch (error) {
      if (!failed) {
        showFailure(error)
      }

      setFailed(true)
      setAttempt((n) => n + 1)
      throw error
    } finally {
      setSaving(false)
    }
  }

  // The plan as shown now, for the saves to send.
  latest.current = plan

  useEffect(() => {
    if (unsaved === 0) {
      return
    }

    const timer = setTimeout(() => void flush().catch(() => {}), failed ? BUILDER.saveRetryMs : BUILDER.autosaveMs)

    return () => clearTimeout(timer)
    // flush reads the latest plan itself; a new change or a failed try restarts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsaved, attempt])

  // Leaving the builder sends what isn't saved yet at once; closing or reloading the tab asks first while it isn't.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (useBuilderStore.getState().unsaved > 0) {
        event.preventDefault()
      }
    }

    window.addEventListener("beforeunload", warn)

    return () => {
      const changes = useBuilderStore.getState().unsaved

      window.removeEventListener("beforeunload", warn)

      if (changes > 0) {
        send(changes).catch(showFailure)
      }
    }
    // Set up once: everything it reads is read when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { saving: saving || unsaved > 0, failed, flush }
}

/**
 * Makes the 360° view for Generate photo: saves the plan, draws the room's 360° 3D view from its clearest spot, and has
 * the AI make one photo of it, as a new room.
 * @param plan - The room.
 * @param flush - Saves the plan now.
 * @param replaces - The room the new room replaces in its design; missing to add a room.
 * @returns The function that makes the 360° photo.
 */
function usePanoramaMaker(plan: Plan, flush: () => Promise<void>, replaces?: string) {
  return async (style: PhotoStyle, instructions: string) => {
    const spot = panoramaSpot(plan)
    const startYaw = panoramaStartYaw(plan, spot)

    await flush()
    const { guide, boxes } = await renderPanorama(plan, spot)

    return generatePanorama(plan.id, guide, boxes, spot, startYaw, style, instructions, replaces)
  }
}

/**
 * Makes one photo for Generate photo: saves the plan, draws the 3D view of the chosen view and its object masks, and has
 * the AI make a photo of it in the chosen style, as a new room, its colors brought back to the plan's by the masks; a
 * run's later photos send where each object is in its first photo, for the AI to copy them from it. The plan keeps its
 * own view.
 * @param plan - The room.
 * @param flush - Saves the plan now.
 * @param replaces - The room a run's new room replaces in its design; missing to add a room.
 * @returns The function that makes a photo of one view.
 */
function usePhotoMaker(plan: Plan, flush: () => Promise<void>, replaces?: string) {
  return async (shot: PlanShot, style: PhotoStyle, instructions: string, photos: RunPhoto) => {
    const seen = { ...plan, ...shot }
    // Only a run's first photo makes the room, which replaces the old one.
    const run = {
      roomId: photos.roomId,
      note: photos.note,
      replaces: photos.roomId ? undefined : replaces,
      referenceBoxes: photos.reference && objectBoxes({ ...plan, ...photos.reference }),
    }

    await flush()
    const guide = await renderGuide(seen)
    const masks = await renderMaskPng(seen)

    // Each object's box in the view keeps the image model to the plan's layout (it kept sizes and places better so).
    return generateRoom(plan.id, guide, style, instructions, photos.seed, objectBoxes(seen), shot, run, masks)
  }
}
