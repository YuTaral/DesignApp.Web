import { useLayoutEffect, useRef, useState } from "react"
import { BoxIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MESSAGES } from "@/lib/constants"
import { usePlan } from "./api"
import { EditPlanDialog } from "./edit-plan-dialog"
import { wallName } from "./room-outline"
import { usePlanScene } from "./use-plan-scene"

/**
 * A built room in 3D as it was last saved, seen as its photo would be, without changing it; with a way into the room
 * builder to change it, which first asks whether the photos generated there replace the room or add one. Shown in place
 * of the room's photos on a design's page.
 * @param props.planId - The room's plan.
 * @param props.roomId - The room.
 * @param props.label - The room's name on the page, such as "Room 2".
 * @param props.canAdd - Whether the design has space for another room.
 */
export function PlanPreview({ planId, roomId, label, canAdd }: { planId: string; roomId: string; label: string; canAdd: boolean }) {
  const plan = usePlan(planId).data
  const [asking, setAsking] = useState(false)
  const { canvasRef, sceneRef, failed } = usePlanScene()
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const facing = plan ? `, looking at the ${wallName(plan, plan.view).toLowerCase()}` : ""

  // The picture fills its 4:3 box, measured again on every resize.
  useLayoutEffect(() => {
    const box = boxRef.current

    if (!box) {
      return
    }

    const measure = () => {
      setSize({ width: box.clientWidth, height: box.clientHeight })
    }
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(box)

    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (plan && sceneRef.current && size.width > 0) {
      sceneRef.current.render(plan, size.width, size.height)
    }
  }, [plan, size, sceneRef])

  return (
    <figure className="flex min-w-0 flex-col gap-2" data-plan-preview>
      <figcaption className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 flex-1">
          {plan?.name || "The room"} in 3D{facing}
        </span>
        <Button size="sm" onClick={() => setAsking(true)} data-edit-in-3d>
          <BoxIcon data-icon="inline-start" />
          Edit in 3D
        </Button>
      </figcaption>
      {/* Framed like the photos it stands in for: as wide as the card allows, and no taller than 60% of the screen. */}
      <div className="overflow-hidden rounded-2xl border bg-muted">
        <div ref={boxRef} className="relative mx-auto aspect-[4/3] w-full max-w-[80dvh]">
          {failed ? (
            <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">{MESSAGES.guideFailed}</p>
          ) : (
            <>
              {!plan && <Skeleton className="absolute inset-0 rounded-none" />}
              <canvas ref={canvasRef} role="img" aria-label={`The room in 3D${facing}`} className="block size-full" data-plan-preview-canvas />
            </>
          )}
        </div>
      </div>
      <EditPlanDialog open={asking} onOpenChange={setAsking} planId={planId} roomId={roomId} label={label} canAdd={canAdd} />
    </figure>
  )
}
