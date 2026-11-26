import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"

import type { BoundingBox, Room } from "@/features/rooms/types"
import { LIMITS } from "@/lib/constants"
import type { PhotoRect } from "./renderer"

/** The user's zoom and pan: zoom 1 fits the photo; the offset moves its center, in CSS px. */
type View = { zoom: number; x: number; y: number }

/**
 * The photo's zoom and pan on a canvas that fills its container: the container's size, where the photo is drawn, wheel
 * zoom around the pointer, and a first zoom on a focused box.
 * @param room - The room, for the photo's size.
 * @param focus - Starts zoomed in on this part of the photo, if given.
 * @param containerRef - The element whose size the canvas fills.
 * @param canvasRef - The canvas, for wheel zoom.
 * @returns `size` and `view`; `rect`, where the photo is drawn; `zoomAround` (a factor around a point, for pinches);
 * `panBy`; `zoomStep` (the buttons: in or out around the middle); and `fit`.
 */
export function useZoomPan(room: Room, focus: BoundingBox | undefined, containerRef: RefObject<HTMLDivElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const focused = useRef(false)
  const rect = useMemo(() => photoRect(size, room, view), [size, room, view])

  const zoomAround = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const zoom = clamp(v.zoom * factor, LIMITS.zoom.min, LIMITS.zoom.max)
        const applied = zoom / v.zoom
        // Keep the point under (cx, cy) fixed while zooming.
        const centerX = size.width / 2 + v.x
        const centerY = size.height / 2 + v.y

        return clampView(size, room, { zoom, x: v.x + (cx - centerX) * (1 - applied), y: v.y + (cy - centerY) * (1 - applied) })
      })
    },
    [size, room]
  )

  const panBy = (dx: number, dy: number) => {
    setView((v) => clampView(size, room, { ...v, x: v.x + dx, y: v.y + dy }))
  }

  const zoomStep = (zoomIn: boolean) => {
    zoomAround(zoomIn ? LIMITS.zoom.step : 1 / LIMITS.zoom.step, size.width / 2, size.height / 2)
  }

  const fit = () => {
    setView({ zoom: 1, x: 0, y: 0 })
  }

  // Track the container's size, so the canvas fills it at any width.
  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })

    observer.observe(container)

    return () => observer.disconnect()
  }, [containerRef])

  // Zoom in on the focused box once the canvas has a size: the box with a margin fills the canvas.
  useEffect(() => {
    if (!focus || focused.current || size.width === 0 || size.height === 0) {
      return
    }

    const fitted = photoRect(size, room, { zoom: 1, x: 0, y: 0 })
    const zoom = clamp(
      Math.min(size.width / (fitted.width * focus.width * LIMITS.focusMargin), size.height / (fitted.height * focus.height * LIMITS.focusMargin)),
      1, LIMITS.zoom.max
    )
    const [cx, cy] = [focus.x + focus.width / 2, focus.y + focus.height / 2]

    focused.current = true
    setView(clampView(size, room, { zoom, x: fitted.width * zoom * (0.5 - cx), y: fitted.height * zoom * (0.5 - cy) }))
  }, [focus, size, room])

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()

      zoomAround(Math.exp(-event.deltaY * LIMITS.zoom.wheel), event.clientX - bounds.left, event.clientY - bounds.top)
    }

    canvas.addEventListener("wheel", onWheel, { passive: false })

    return () => canvas.removeEventListener("wheel", onWheel)
  }, [zoomAround, canvasRef])

  return { size, view, rect, zoomAround, panBy, zoomStep, fit }
}

/**
 * Limits a value to a range.
 * @param value - The value.
 * @param min - Lowest allowed.
 * @param max - Highest allowed.
 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Where the photo is drawn: fitted inside the canvas, then zoomed and panned.
 * @param size - The canvas's CSS size.
 * @param room - The room, for the photo's aspect ratio.
 * @param view - The zoom and pan.
 */
function photoRect(size: { width: number; height: number }, room: Room, view: View): PhotoRect {
  const fit = Math.min(size.width / room.width, size.height / room.height) || 0
  const width = room.width * fit * view.zoom
  const height = room.height * fit * view.zoom

  return { x: size.width / 2 - width / 2 + view.x, y: size.height / 2 - height / 2 + view.y, width, height }
}

/**
 * Keeps a zoomed photo covering the canvas (no panning into empty space) and a fitted one centered.
 * @param size - The canvas's CSS size.
 * @param room - The room.
 * @param view - The requested zoom and pan.
 */
function clampView(size: { width: number; height: number }, room: Room, view: View): View {
  const rect = photoRect(size, room, { ...view, x: 0, y: 0 })
  const maxX = Math.max(0, (rect.width - size.width) / 2)
  const maxY = Math.max(0, (rect.height - size.height) / 2)

  return { zoom: view.zoom, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) }
}
