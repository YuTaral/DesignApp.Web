import { Link } from "@tanstack/react-router"
import { CheckIcon, CircleIcon, LoaderCircleIcon, PlusIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEditorStore } from "@/features/editor/editor-store"
import type { Room } from "./types"
import { MESSAGES, ROOM_STATUS, type RoomStatus, ROUTES } from "@/lib/constants"

/** The visible analysis steps and the statuses during which each one is running. */
const steps: { label: string; runningFor: RoomStatus[] }[] = [
  { label: "Finding objects", runningFor: ["Uploaded", "Analyzing"] },
  { label: "Outlining objects", runningFor: ["Segmenting"] },
]

/**
 * The inspector's Objects section: analysis progress while the AI works, a summary of the detected objects once
 * it's done, or the reason it failed.
 * @param props.room - The room being edited.
 */
export function AnalysisPanel({ room }: { room: Room }) {
  if (room.status === ROOM_STATUS.Failed) return <AnalysisFailed reason={room.failureReason} />
  if (room.status === ROOM_STATUS.Ready) return <ObjectsSummary room={room} />
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
 * The Objects section once the AI is done: how many objects it found and how many are recolored, and "New object" to
 * mark one it missed. Objects are chosen by clicking them in the photo; the inspector below then shows the one chosen.
 * Objects without pixels in the outlines shown (a new object after undo) aren't counted.
 * @param props.room - The analyzed room.
 */
function ObjectsSummary({ room }: { room: Room }) {
  const { edits, marking, comparing, revision, presentObjects, startMarking } = useEditorStore()
  // Until the outlines of the version shown are loaded, every object counts (a new one must not blink out).
  const present = presentObjects?.revision === (revision ?? room.labelMapRevision) ? presentObjects.indexes : null
  const shown = room.objects.filter((o) => present?.has(o.index) ?? true)
  // An object whose parts cover all of it has no pixels of its own, but is still there; parts aren't counted.
  const count = room.objects.filter((o) => !o.parentIndex && (shown.includes(o) || shown.some((p) => p.parentIndex === o.index))).length
  const recolored = Object.keys(edits).length

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Objects</h2>
        <Button variant="outline" size="sm" disabled={marking || comparing} onClick={() => startMarking()}>
          <PlusIcon data-icon="inline-start" />
          New object
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground" data-recolored={recolored}>
        {marking
          ? "Mark the new object on the photo, then name it and save."
          : `${count === 1 ? "1 object" : `${count} objects`} in your photo${recolored > 0 ? ` · ${recolored} recolored` : ""}.`}
      </p>
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
