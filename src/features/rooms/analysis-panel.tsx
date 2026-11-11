import { useEffect, useRef } from "react"
import { Link } from "@tanstack/react-router"
import { CheckIcon, CircleIcon, LoaderCircleIcon, PlusIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEditorStore } from "@/features/editor/editor-store"
import type { Room } from "./types"
import { CATEGORY_NAMES, MESSAGES, type ObjectCategory, ROOM_STATUS, type RoomStatus, ROUTES } from "@/lib/constants"

/** The visible analysis steps and the statuses during which each one is running. */
const steps: { label: string; runningFor: RoomStatus[] }[] = [
  { label: "Finding objects", runningFor: ["Uploaded", "Analyzing"] },
  { label: "Outlining objects", runningFor: ["Segmenting"] },
]

/** Where each category sorts in the object list: surfaces first, then furniture, then the rest. */
const categoryOrder: ObjectCategory[] = ["Wall", "Floor", "Ceiling", "Opening", "Furniture", "Textile", "Lighting", "Decor", "Fixture", "Other"]

/**
 * The inspector's Objects section: analysis progress while the AI works, the detected objects once
 * it's done, or the reason it failed.
 * @param props.room - The room being edited.
 */
export function AnalysisPanel({ room }: { room: Room }) {
  if (room.status === ROOM_STATUS.Failed) return <AnalysisFailed reason={room.failureReason} />
  if (room.status === ROOM_STATUS.Ready) return <ObjectList room={room} />
  return <AnalysisProgress status={room.status} />
}

/**
 * The two analysis steps with their state, above placeholder rows for the coming objects.
 * @param props.status - The room's current status.
 */
function AnalysisProgress({ status }: { status: RoomStatus }) {
  const current = steps.findIndex((step) => step.runningFor.includes(status))

  return (
    <div>
      <h2 className="font-medium">Objects</h2>
      <p className="mt-1 text-sm text-muted-foreground">The AI is mapping your room. This takes a few seconds.</p>
      <ol className="mt-4 space-y-2.5" aria-live="polite">
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "running" : "waiting"
          return (
            <li key={step.label} className="flex items-center gap-2.5 text-sm">
              {state === "done" && <CheckIcon className="size-4 text-primary" aria-hidden />}
              {state === "running" && (
                <LoaderCircleIcon className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              )}
              {state === "waiting" && <CircleIcon className="size-4 text-muted-foreground/50" aria-hidden />}
              <span className={cn(state === "waiting" && "text-muted-foreground")}>
                {step.label}
                <span className="sr-only">{state === "done" ? " (done)" : state === "running" ? " (in progress)" : ""}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="mt-4 space-y-2" aria-hidden>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-4/5" />
        <Skeleton className="h-9 w-3/5" />
      </div>
    </div>
  )
}

/**
 * The detected objects, surfaces first, each with its current color. Choosing one selects it in
 * the editor; pointing at one highlights it in the photo. Objects without pixels in the outlines shown (a new
 * object after undo) are left out. "New object" starts marking one the AI missed.
 * @param props.room - The analyzed room.
 */
function ObjectList({ room }: { room: Room }) {
  const { selected, edits, select, hover, marking, comparing, revision, presentObjects, startMarking } = useEditorStore()
  const listRef = useRef<HTMLUListElement>(null)
  // Until the outlines of the version shown are loaded, every object is listed (a new one must not blink out).
  const present = presentObjects?.revision === (revision ?? room.labelMapRevision) ? presentObjects.indexes : null
  const objects = room.objects.filter((o) => present?.has(o.index) ?? true).sort(
    (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || a.index - b.index
  )

  // An object selected in the photo scrolls into view here.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" })
  }, [selected])

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Objects</h2>
        <Button variant="outline" size="sm" disabled={marking || comparing} onClick={startMarking}>
          <PlusIcon data-icon="inline-start" />
          New object
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {marking
          ? "Mark the new object on the photo, then name it and save."
          : `${objects.length === 1 ? "1 object" : `${objects.length} objects`} in your photo.`}
      </p>
      <ul ref={listRef} className="-mx-2 mt-3 max-h-[9.5rem] space-y-0.5 overflow-y-auto sm:max-h-72 lg:max-h-[min(24rem,38dvh)]" onMouseLeave={() => hover(0)}>
        {objects.map((object) => (
          <li key={object.index}>
            <button
              type="button"
              data-index={object.index}
              aria-pressed={selected === object.index}
              disabled={marking}
              onClick={() => select(selected === object.index ? 0 : object.index)}
              onMouseEnter={() => hover(object.index)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                selected === object.index && "bg-accent text-accent-foreground hover:bg-accent"
              )}
            >
              <span
                className="size-5 shrink-0 rounded-md border shadow-soft"
                style={{ backgroundColor: edits[object.index]?.color ?? object.dominantColor }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm first-letter:uppercase">{object.label}</span>
              {edits[object.index] && <span className="size-1.5 rounded-full bg-primary" aria-label="recolored" />}
              <span className="text-xs text-muted-foreground">{CATEGORY_NAMES[object.category] ?? object.category}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Why the analysis failed, with a way to start over.
 * @param props.reason - The API's message for the user.
 */
function AnalysisFailed({ reason }: { reason: string | null }) {
  return (
    <div>
      <h2 className="font-medium">Objects</h2>
      <div role="alert" className="mt-3 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium">We couldn't analyze this photo</p>
          <p className="text-sm text-muted-foreground">{reason ?? MESSAGES.analysisFailedHint}</p>
        </div>
      </div>
      <Button size="lg" variant="outline" className="mt-3 w-full" asChild>
        <Link to={ROUTES.home}>Upload another photo</Link>
      </Button>
    </div>
  )
}
