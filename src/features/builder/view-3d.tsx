import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react"

import { ZoomButtons } from "@/components/zoom-buttons"
import { BUILDER, MESSAGES } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { useBuilderStore } from "./builder-store"
import { PhotoReference } from "./photo-reference"
import { wallName } from "./room-outline"
import { blockingItem } from "./scene-3d"
import { usePlanScene } from "./use-plan-scene"
import { useViewZoom } from "./use-view-zoom"
import { ViewChoice } from "./view-choice"

/**
 * The room in 3D, from where the photo will be taken: the middle of the wall opposite the one in view, at a
 * photographer's height. Clicking a wall turns the view to look at it (the camera moves to the opposite wall); the
 * buttons below do the same. It is redrawn as the plan changes, and it is exactly the picture Generate sends to the
 * image model (but in the Ceiling tab, which tilts it up to show the ceiling and its light). It zooms (the wheel, a
 * pinch or the buttons) and pans by dragging once zoomed, which doesn't change the photo.
 * @param props.plan - The room.
 * @param props.tilt - How far to tilt the view up, in degrees; 0 (the photo's view) when missing.
 */
export function View3d({ plan, tilt = 0 }: { plan: Plan; tilt?: number }) {
  const setRoom = useBuilderStore((state) => state.setRoom)
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const { canvasRef, sceneRef, failed } = usePlanScene()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState(false)
  const pictureRef = useRef<HTMLCanvasElement | null>(null)
  // Another view, corner or tab starts whole.
  const zoom = useViewZoom({ x: 0, y: 0, width: size.width, height: size.height }, pictureRef, `${plan.id}-${plan.view}-${plan.corner}-${tilt}`)
  // Whether the last pointer on the picture dragged it (then its click doesn't turn the view).
  const dragged = useRef(false)
  // The scene's renderer and this component both need the canvas.
  const attach = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      pictureRef.current = canvas
      canvasRef(canvas)
    },
    [canvasRef]
  )
  const { frame } = zoom
  const crop = useMemo(
    () => (size.width > 0 ? { x: frame.x / size.width, y: frame.y / size.height, width: frame.width / size.width, height: frame.height / size.height } : undefined),
    [frame.x, frame.y, frame.width, frame.height, size]
  )
  // What was last built, so a zoom alone only frames the picture again.
  const drawn = useRef<{ plan: Plan; size: typeof size; tilt: number } | null>(null)

  // Measured before the first paint, so the room shows at once rather than a frame later, then again on every resize.
  useLayoutEffect(() => {
    const [container, controls] = [containerRef.current, controlsRef.current]

    if (!container || !controls) {
      return
    }

    const measure = () => {
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
    }
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(container)
    observer.observe(controls)

    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const scene = sceneRef.current
    const last = drawn.current

    if (!scene || !crop) {
      return
    }

    if (last && last.plan === plan && last.size === size && last.tilt === tilt) {
      scene.reframe(crop)

      return
    }

    scene.render(plan, size.width, size.height, undefined, tilt, crop)
    drawn.current = { plan, size, tilt }
  }, [plan, size, sceneRef, tilt, crop])

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
    // Filling the box's padded inside (its height can come from a minimum alone, which a percentage height can't use),
    // and padded so the picture and the choices keep clear of the frame around the view.
    <div ref={containerRef} className="absolute inset-2 flex flex-col items-center justify-center gap-3 px-2 py-4">
      {plan.fromRoomId && <PhotoReference roomId={plan.fromRoomId} />}
      {failed ? (
        <p className="text-sm text-muted-foreground">{MESSAGES.guideFailed}</p>
      ) : (
        <div className="relative">
          <canvas
            ref={attach}
            role="img"
            aria-label={`The room in 3D, looking at the ${wallName(plan, plan.view).toLowerCase()}, as the photo will see it. Click a wall to look at it.`}
            data-view-3d
            data-view={plan.view}
            data-corner={plan.corner}
            className="touch-none rounded-xl"
            style={{ width: size.width, height: size.height, cursor: hover ? "pointer" : zoom.scale > 1 ? "grab" : "default" }}
            onPointerDown={zoom.down}
            onPointerMove={zoom.move}
            onPointerUp={(event) => {
              dragged.current = zoom.up(event) === "drag"
            }}
            onPointerCancel={zoom.up}
            onMouseMove={(event) => {
              const wall = wallUnder(event)

              setHover(wall !== null && wall !== plan.view)
            }}
            onMouseLeave={() => setHover(false)}
            onClick={(event) => {
              const wall = wallUnder(event)

              if (!dragged.current && wall !== null && wall !== plan.view) {
                setRoom({ view: wall })
              }
            }}
          />
          <ZoomButtons zoom={zoom.scale} onStep={zoom.step} onFit={zoom.fit} fitLabel="Show the whole view" />
        </div>
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
