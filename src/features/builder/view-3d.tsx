import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"

import { BUILDER, MESSAGES } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { useBuilderStore } from "./builder-store"
import { wallName } from "./room-outline"
import { blockingItem, PlanScene } from "./scene-3d"
import { ViewChoice } from "./view-choice"

/**
 * The room in 3D, from where the photo will be taken: the middle of the wall opposite the one in view, at a
 * photographer's height. Clicking a wall turns the view to look at it (the camera moves to the opposite wall); the
 * buttons below do the same. It is redrawn as the plan changes, and it is exactly the picture Generate sends to the
 * image model.
 * @param props.plan - The room.
 */
export function View3d({ plan }: { plan: Plan }) {
  const setRoom = useBuilderStore((state) => state.setRoom)
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PlanScene | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [failed, setFailed] = useState(false)
  const [hover, setHover] = useState(false)

  // The renderer lives as long as its canvas.
  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    sceneRef.current?.dispose()
    sceneRef.current = null

    if (!canvas) {
      return
    }

    try {
      sceneRef.current = new PlanScene(canvas)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    const [container, controls] = [containerRef.current, controlsRef.current]

    if (!container || !controls) {
      return
    }

    const observer = new ResizeObserver(() => {
      // The photo's 4:3, as large as fits above the choices below it (measured, as they wrap on narrow screens and
      // grow with the blocked-view note), less the gap between them.
      const { clientWidth, clientHeight } = container
      const style = getComputedStyle(container)
      const [width, height] = [
        clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - controls.offsetHeight - parseFloat(style.rowGap),
      ]
      const fitted = Math.min(width, (height * 4) / 3)

      setSize({ width: Math.max(0, Math.floor(fitted)), height: Math.max(0, Math.floor((fitted * 3) / 4)) })
    })

    observer.observe(container)
    observer.observe(controls)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (sceneRef.current && size.width > 0) {
      sceneRef.current.render(plan, size.width, size.height)
    }
  }, [plan, size])

  // Whether something blocks the view (a cabinet in the corner the photo is taken from), checked once the room stops
  // changing, as each check draws the room again.
  const [blocking, setBlocking] = useState<PlanItem | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setBlocking(blockingItem(plan))
      } catch {
        setBlocking(null)
      }
    }, BUILDER.blockedCheckMs)

    return () => window.clearTimeout(timer)
  }, [plan])

  /**
   * The wall under the pointer, if any.
   * @param event - The pointer event on the canvas.
   */
  const wallUnder = (event: MouseEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * 2 - 1
    const y = -(((event.clientY - box.top) / box.height) * 2 - 1)

    return sceneRef.current?.wallAt(plan, x, y) ?? null
  }

  return (
    // Padded so the picture and the choices keep clear of the frame around the view.
    <div ref={containerRef} className="flex size-full min-h-64 flex-col items-center justify-center gap-3 px-2 py-4">
      {failed ? (
        <p className="text-sm text-muted-foreground">{MESSAGES.guideFailed}</p>
      ) : (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`The room in 3D, looking at the ${wallName(plan, plan.view).toLowerCase()}, as the photo will see it. Click a wall to look at it.`}
          data-view-3d
          data-view={plan.view}
          data-corner={plan.corner}
          className="rounded-xl"
          style={{ width: size.width, height: size.height, cursor: hover ? "pointer" : "default" }}
          onMouseMove={(event) => {
            const wall = wallUnder(event)

            setHover(wall !== null && wall !== plan.view)
          }}
          onMouseLeave={() => setHover(false)}
          onClick={(event) => {
            const wall = wallUnder(event)

            if (wall !== null && wall !== plan.view) {
              setRoom({ view: wall })
            }
          }}
        />
      )}
      {/* The choices and the blocked-view note, measured together to size the picture above them. */}
      <div ref={controlsRef} className="flex flex-col items-center gap-3">
        {/* Each choice has its caption above it; the two sit side by side when there is room, else one above the other. */}
        <ViewChoice plan={plan} place="view" />
        {blocking && (
          <p className="max-w-md text-center text-xs text-amber-600 dark:text-amber-400" role="status" data-view-blocked>
            The {blocking.label} stands in front of the camera and fills much of the photo. Try another corner or wall, or move it.
          </p>
        )}
      </div>
    </div>
  )
}
