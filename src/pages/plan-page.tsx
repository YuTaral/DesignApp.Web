import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, BoxIcon, CheckIcon, ImageIcon, LoaderCircleIcon, MapIcon, PanelTopIcon, RulerIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { generateRoom, savePlan, usePlan, type Plan, type PlanShot } from "@/features/builder/api"
import { isWallItem, useBuilderStore } from "@/features/builder/builder-store"
import { CatalogPanel } from "@/features/builder/catalog-panel"
import { GenerateDialog } from "@/features/builder/generate-dialog"
import { Inspector } from "@/features/builder/inspector"
import { PlanCanvas } from "@/features/builder/plan-canvas"
import { objectBoxes, renderGuide } from "@/features/builder/scene-3d"
import { View3d } from "@/features/builder/view-3d"
import { useBuilderShortcuts } from "@/features/builder/use-builder-shortcuts"
import { WallView } from "@/features/builder/wall-view"
import { errorMessage } from "@/lib/api"
import { AI_MODE, BUILDER, MESSAGES, QUERY_KEYS, ROOM_TYPE_NAMES, ROUTES, type PhotoStyle } from "@/lib/constants"

/** The middle of the builder: the floor plan, one wall seen straight on, or the 3D view. */
type View = "plan" | "wall" | "3d"

/**
 * Route `/build/$planId`: step 3 of building a room. Windows, doors and common objects on the left; the floor plan, a
 * wall seen straight on (where windows and doors are placed) or the 3D view in the middle; the selected object or the
 * room on the right. Every change is saved shortly after it is made. Generate photo turns the 3D view into a realistic
 * photo and opens it in the editor as a new room.
 */
export function PlanPage() {
  const { planId } = useParams({ from: "/build/$planId" })
  const query = usePlan(planId)
  const { plan, load } = useBuilderStore()

  useEffect(() => {
    if (query.data) load(query.data)
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
  const { saving, flush } = useAutosave(plan)
  const make = usePhotoMaker(plan, flush)
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
   * Shows another wall; a window or door selected on the wall left behind is let go.
   * @param next - The wall.
   */
  const showWall = (next: number) => {
    if (openingWall !== null && openingWall !== next) select(-1)
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
          {/* A fixed width, so "Saving…" and "Saved" don't move the buttons beside it under the pointer. */}
          <span className="flex w-16 shrink-0 items-center gap-1 text-xs text-muted-foreground" aria-live="polite" data-save-state>
            {saving ? <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckIcon className="size-3" aria-hidden />}
            {saving ? "Saving…" : "Saved"}
          </span>
        </div>
        {/*
          The tabs come first on a row of their own, so they stay put whichever tab is open; Room shape (on the plan
          only) and Generate photo follow them.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="View" className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/40 p-1 text-sm">
            {(
              [
                ["plan", "Plan", MapIcon],
                ["wall", "Wall", PanelTopIcon],
                ["3d", "3D view", BoxIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
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
        <div className="relative min-h-80 flex-1 overflow-hidden rounded-2xl border bg-muted/40 p-2 shadow-soft lg:min-h-0">
          {view === "plan" ? (
            <PlanCanvas
              plan={plan}
              shaping={shaping}
              onWall={(next) => {
                showWall(next)
                setView("wall")
              }}
            />
          ) : view === "wall" ? (
            <WallView plan={plan} wall={wall} onWall={showWall} />
          ) : (
            <View3d plan={plan} />
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
        onOpen={(room) => void navigate({ to: ROUTES.room, params: { roomId: room.id }, search: {} })}
      />

      <aside aria-label="Inspector" className="rounded-2xl border bg-card p-4 shadow-soft lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:[scrollbar-gutter:stable]">
        <Inspector plan={plan} />
      </aside>
    </div>
  )
}

/**
 * Saves the plan shortly after each change.
 * @param plan - The room as shown.
 * @returns Whether it is saving, and `flush`, which saves now (resolves once saved).
 */
function useAutosave(plan: Plan) {
  const queryClient = useQueryClient()
  const { unsaved, saved } = useBuilderStore()
  const [saving, setSaving] = useState(false)
  const latest = useRef(plan)
  latest.current = plan

  /** Saves the plan as shown now. */
  const flush = async () => {
    const changes = useBuilderStore.getState().unsaved
    if (changes === 0) return
    setSaving(true)
    try {
      const result = await savePlan(latest.current)
      queryClient.setQueryData(QUERY_KEYS.plan(result.id), result)
      saved(changes)
    } catch (error) {
      toast.error(`${MESSAGES.planSaveFailed} ${errorMessage(error)}`)
      throw error
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (unsaved === 0) return
    const timer = setTimeout(() => void flush().catch(() => {}), BUILDER.autosaveMs)
    return () => clearTimeout(timer)
    // flush reads the latest plan itself; only a new change restarts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsaved])

  return { saving: saving || unsaved > 0, flush }
}

/**
 * Makes one photo for Generate photo: saves the plan, draws the 3D view of the chosen view, and has the AI make a photo
 * of it in the chosen style, as a new room. The plan keeps its own view.
 * @param plan - The room.
 * @param flush - Saves the plan now.
 * @returns The function that makes a photo of one view.
 */
function usePhotoMaker(plan: Plan, flush: () => Promise<void>) {
  return async (shot: PlanShot, style: PhotoStyle, instructions: string) => {
    await flush()
    const seen = { ...plan, ...shot }
    const guide = await renderGuide(seen)
    // Each object's box in the view keeps the image model to the plan's layout (it kept sizes and places better so).
    return generateRoom(plan.id, guide, style, instructions, undefined, objectBoxes(seen), shot)
  }
}
