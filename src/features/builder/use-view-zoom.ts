import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

import { clamp } from "@/features/editor/use-zoom-pan"
import { LIMITS } from "@/lib/constants"

/** A part of a drawing, in the drawing's own units: its top-left corner and its size. */
export type Frame = { x: number; y: number; width: number; height: number }

/** How far a view is zoomed in (more than 1) and the middle of what it shows, in the drawing's units. */
type Zoom = { scale: number; x: number; y: number }

/** A point on the screen, in CSS px. */
type Point = { x: number; y: number }

/**
 * Zoom and pan for a view of the room builder (the plan, a wall, the 3D view): the mouse wheel zooms around the pointer,
 * two fingers pinch, and dragging the view's background moves it once zoomed in; the buttons step in and out around the
 * middle, or show it whole. What is shown never leaves the drawing.
 * @param whole - The whole drawing, shown when not zoomed.
 * @param target - The element the drawing fills (kept in proportion and centred, as an SVG's viewBox is), for the wheel
 *   and for finding what is under the pointer.
 * @param resetOn - Shows the drawing whole again when this changes (another wall, another room).
 * @returns `frame`, the part shown; `scale`, the zoom (1 for none); `step` and `fit` for the buttons; the pointer
 *   handlers `down` for a pointer on the view's background, `move` (true when it pans or pinches) and `up`, which says
 *   whether that pointer was a tap or a drag (null when it wasn't the view's); and `moveOn` and `endOn`, the same for a
 *   drawing whose objects have drags of their own.
 */
export function useViewZoom(whole: Frame, target: RefObject<Element | null>, resetOn: unknown) {
  const [zoom, setZoom] = useState<Zoom | null>(null)
  const [seen, setSeen] = useState(resetOn)
  const pointers = useRef(new Map<number, Point>())
  const drag = useRef({ moved: false, start: { x: 0, y: 0 }, pinch: 0 })

  /**
   * Zooms by a factor, keeping the drawing's point under a screen point where it is (the middle when none is given).
   * @param factor - More than 1 zooms in.
   * @param at - The screen point.
   */
  const zoomAt = (factor: number, at?: Point) => {
    setZoom((previous) => {
      const shown = framed(whole, previous)
      const scale = clamp((previous?.scale ?? 1) * factor, LIMITS.zoom.min, LIMITS.zoom.max)
      const fixed = at && target.current ? locate(target.current, shown, at) : { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 }
      const kept = (previous?.scale ?? 1) / scale

      if (scale <= LIMITS.zoom.min) {
        return null
      }

      return settled(whole, {
        scale,
        x: fixed.x - (fixed.x - shown.x) * kept + (shown.width * kept) / 2,
        y: fixed.y - (fixed.y - shown.y) * kept + (shown.height * kept) / 2,
      })
    })
  }

  /**
   * Moves what is shown with the pointer.
   * @param dx - How far the pointer moved across, in CSS px.
   * @param dy - How far it moved down.
   */
  const pan = (dx: number, dy: number) => {
    setZoom((previous) => {
      if (!previous || !target.current) {
        return previous
      }

      const perUnit = scaleOf(target.current, framed(whole, previous))

      return settled(whole, { ...previous, x: previous.x - dx / perUnit, y: previous.y - dy / perUnit })
    })
  }

  // The wheel needs a listener that isn't passive, to keep the page from scrolling as it zooms.
  useEffect(() => {
    const element = target.current

    if (!element) {
      return
    }

    const onWheel = (event: Event) => {
      const wheel = event as WheelEvent

      wheel.preventDefault()
      zoomAt(Math.exp(-wheel.deltaY * LIMITS.zoom.wheel), { x: wheel.clientX, y: wheel.clientY })
    }

    element.addEventListener("wheel", onWheel, { passive: false })

    return () => element.removeEventListener("wheel", onWheel)
  })

  // Another wall or room starts whole.
  if (seen !== resetOn) {
    setSeen(resetOn)
    setZoom(null)
  }

  const down = (event: ReactPointerEvent<Element>) => {
    const point = { x: event.clientX, y: event.clientY }

    pointers.current.set(event.pointerId, point)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (pointers.current.size === 1) {
      drag.current = { moved: false, start: point, pinch: 0 }
    } else if (pointers.current.size === 2) {
      drag.current = { ...drag.current, moved: true, pinch: spread([...pointers.current.values()]) }
    }
  }

  const move = (event: ReactPointerEvent<Element>) => {
    const previous = pointers.current.get(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }

    if (!previous) {
      return false
    }

    pointers.current.set(event.pointerId, point)

    if (pointers.current.size === 2 && drag.current.pinch > 0) {
      const points = [...pointers.current.values()]
      const now = spread(points)

      zoomAt(now / drag.current.pinch, { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 })
      drag.current.pinch = now

      return true
    }

    if (!drag.current.moved && Math.hypot(point.x - drag.current.start.x, point.y - drag.current.start.y) > LIMITS.tapSlop) {
      drag.current.moved = true
    }

    if (drag.current.moved) {
      pan(point.x - previous.x, point.y - previous.y)
    }

    return true
  }

  const up = (event: ReactPointerEvent<Element>): "tap" | "drag" | null => {
    const ours = pointers.current.delete(event.pointerId)

    if (!ours) {
      return null
    }

    return drag.current.moved ? "drag" : "tap"
  }

  /**
   * For a drawing whose objects have drags of their own (they stop their pointers going down from reaching the
   * background): a pointer that went down on the background pans or pinches, any other moves what the drawing's drag
   * holds.
   * @param event - The pointer moving.
   * @param drag - The drawing's own move.
   */
  const moveOn = (event: ReactPointerEvent<Element>, drag: (event: ReactPointerEvent<Element>) => void) => {
    if (!move(event)) {
      drag(event)
    }
  }

  /**
   * For a drawing whose objects have drags of their own: a pointer let go ends the drawing's drag, and a tap on the
   * background calls `onTap` (a drag there moved the view).
   * @param event - The pointer let go (or cancelled).
   * @param drag - The drawing's own end.
   * @param onTap - What a tap on the background does; nothing when missing (a cancelled pointer).
   */
  const endOn = (event: ReactPointerEvent<Element>, drag: (event: ReactPointerEvent<Element>) => void, onTap?: () => void) => {
    drag(event)

    if (up(event) === "tap") {
      onTap?.()
    }
  }

  return {
    frame: framed(whole, zoom),
    scale: zoom?.scale ?? 1,
    step: (inwards: boolean) => zoomAt(inwards ? LIMITS.zoom.step : 1 / LIMITS.zoom.step),
    fit: () => setZoom(null),
    down,
    move,
    up,
    moveOn,
    endOn,
  }
}

/**
 * The part of the drawing a zoom shows, kept inside the drawing.
 * @param whole - The whole drawing.
 * @param zoom - The zoom; null shows it whole.
 */
function framed(whole: Frame, zoom: Zoom | null): Frame {
  if (!zoom) {
    return whole
  }

  const [width, height] = [whole.width / zoom.scale, whole.height / zoom.scale]

  return {
    x: clamp(zoom.x - width / 2, whole.x, whole.x + whole.width - width),
    y: clamp(zoom.y - height / 2, whole.y, whole.y + whole.height - height),
    width,
    height,
  }
}

/**
 * A zoom whose middle is where it is shown, so panning back from an edge moves at once.
 * @param whole - The whole drawing.
 * @param zoom - The zoom asked for.
 */
function settled(whole: Frame, zoom: Zoom): Zoom {
  const shown = framed(whole, zoom)

  return { scale: zoom.scale, x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 }
}

/**
 * CSS px per unit of the drawing, as an SVG fits its viewBox inside itself.
 * @param element - The element the drawing fills.
 * @param shown - The part of the drawing shown.
 */
function scaleOf(element: Element, shown: Frame) {
  const box = element.getBoundingClientRect()

  return Math.min(box.width / shown.width, box.height / shown.height)
}

/**
 * The drawing's point under a screen point.
 * @param element - The element the drawing fills, centred.
 * @param shown - The part of the drawing shown.
 * @param at - The screen point.
 */
function locate(element: Element, shown: Frame, at: Point) {
  const box = element.getBoundingClientRect()
  const perUnit = scaleOf(element, shown)
  const [left, top] = [box.left + (box.width - shown.width * perUnit) / 2, box.top + (box.height - shown.height * perUnit) / 2]

  return { x: shown.x + (at.x - left) / perUnit, y: shown.y + (at.y - top) / perUnit }
}

/**
 * How far apart two pointers are.
 * @param points - The two pointers.
 */
function spread(points: Point[]) {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}
