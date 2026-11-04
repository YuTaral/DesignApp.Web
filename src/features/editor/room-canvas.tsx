import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { LoaderCircleIcon, MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import type { Room } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"
import { useEditorStore } from "./editor-store"
import { labelAt, loadLabelMap, type LabelMap } from "./label-map"
import { hexToOklab } from "./oklab"
import { RoomRenderer, type PhotoRect, type RenderEdit } from "./renderer"

const MIN_ZOOM = 1
const MAX_ZOOM = 8
/** A press that moves less than this (CSS px) is a tap, not a drag. */
const TAP_SLOP = 5

/** The user's zoom and pan: zoom 1 fits the photo; the offset moves its center, in CSS px. */
type View = { zoom: number; x: number; y: number }

/**
 * The interactive photo: shows the room with its recolors, outlines the object under the pointer
 * and the selected one, and handles tap/click to select, drag to pan, wheel/pinch/buttons to zoom,
 * and the before/after handle.
 * @param props.room - A room whose analysis is Ready.
 */
export function RoomCanvas({ room }: { room: Room }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<RoomRenderer | null>(null)
  const [map, setMap] = useState<LabelMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const [split, setSplit] = useState(0.5)

  const { edits, selected, hovered, comparing, select, hover } = useEditorStore()

  // Load the photo and label map, then hand both to a renderer on the canvas.
  useEffect(() => {
    const abort = new AbortController()
    const photo = new Image()
    photo.crossOrigin = "anonymous" // same mode as the <img> before it, so the cached copy is reused
    photo.src = apiUrl(room.photoUrl)

    Promise.all([photo.decode(), loadLabelMap(room.labelMapUrl!, abort.signal)])
      .then(([, labelMap]) => {
        if (abort.signal.aborted || !canvasRef.current) return
        const renderer = new RoomRenderer(canvasRef.current)
        renderer.setRoom(photo, labelMap)
        rendererRef.current = renderer
        setMap(labelMap)
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "The editor couldn't start.")
      })

    return () => {
      abort.abort()
      rendererRef.current?.dispose()
      rendererRef.current = null
      setMap(null)
    }
  }, [room.photoUrl, room.labelMapUrl])

  // Track the container's size, so the canvas fills it at any width.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const rect = useMemo(() => photoRect(size, room, view), [size, room, view])

  // Recolors in the shader's terms: each object's target color and its original main color.
  const renderEdits = useMemo(() => {
    const byIndex = new Map(room.objects.map((o) => [o.index, o]))
    const result = new Map<number, RenderEdit>()
    for (const [index, edit] of Object.entries(edits)) {
      const object = byIndex.get(Number(index))
      if (object) result.set(object.index, { target: hexToOklab(edit.color), source: hexToOklab(object.dominantColor), strength: edit.strength })
    }
    return result
  }, [edits, room.objects])

  useEffect(() => {
    rendererRef.current?.setEdits(renderEdits)
  }, [renderEdits, map])

  // Draw on the next frame whenever anything visible changes.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer || !map) return
    const frame = requestAnimationFrame(() =>
      renderer.render({ rect, edits: renderEdits, hovered, selected, split: comparing ? rect.x + rect.width * split : null })
    )
    return () => cancelAnimationFrame(frame)
  }, [map, rect, renderEdits, hovered, selected, comparing, split])

  const zoomAround = useCallback(
    (factor: number, cx: number, cy: number) =>
      setView((v) => {
        const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
        const applied = zoom / v.zoom
        // Keep the point under (cx, cy) fixed while zooming.
        const centerX = size.width / 2 + v.x
        const centerY = size.height / 2 + v.y
        return clampView(size, room, { zoom, x: v.x + (cx - centerX) * (1 - applied), y: v.y + (cy - centerY) * (1 - applied) })
      }),
    [size, room]
  )

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()
      zoomAround(Math.exp(-event.deltaY * 0.0015), event.clientX - bounds.left, event.clientY - bounds.top)
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [zoomAround])

  // Pointer gestures: one pointer taps or pans, two pointers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; pinch: number | null }>({ startX: 0, startY: 0, moved: false, pinch: null })

  const localPoint = (event: ReactPointerEvent) => {
    const bounds = canvasRef.current!.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }
  const objectAt = (x: number, y: number) => (map ? labelAt(map, (x - rect.x) / rect.width, (y - rect.y) / rect.height) : 0)

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = localPoint(event)
    pointers.current.set(event.pointerId, point)
    if (pointers.current.size === 1) gesture.current = { startX: point.x, startY: point.y, moved: false, pinch: null }
    if (pointers.current.size === 2) gesture.current.pinch = distance([...pointers.current.values()])
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    const previous = pointers.current.get(event.pointerId)
    if (!previous) {
      if (event.pointerType === "mouse") hover(objectAt(point.x, point.y))
      return
    }
    pointers.current.set(event.pointerId, point)
    const g = gesture.current

    if (pointers.current.size === 2 && g.pinch) {
      const points = [...pointers.current.values()]
      const now = distance(points)
      zoomAround(now / g.pinch, (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2)
      g.pinch = now
      g.moved = true
      return
    }
    if (!g.moved && Math.hypot(point.x - g.startX, point.y - g.startY) > TAP_SLOP) g.moved = true
    if (g.moved) setView((v) => clampView(size, room, { ...v, x: v.x + point.x - previous.x, y: v.y + point.y - previous.y }))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    const wasTap = pointers.current.size === 1 && !gesture.current.moved
    pointers.current.delete(event.pointerId)
    if (wasTap) select(objectAt(point.x, point.y))
  }

  const hoveredLabel = room.objects.find((o) => o.index === hovered)?.label

  return (
    <div ref={containerRef} className="relative h-full min-h-72 w-full overflow-hidden rounded-xl">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Your room. Click an object in the photo, or choose it from the list, to restyle it."
        data-photo-rect={JSON.stringify(rect)}
        className={cn(
          "absolute inset-0 size-full touch-none",
          hovered ? "cursor-pointer" : view.zoom > 1 ? "cursor-grab" : "cursor-default"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => hover(0)}
      />

      {!map && !error && (
        <div className="absolute inset-0 grid place-items-center">
          <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Preparing the editor" />
        </div>
      )}
      {error && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {map && comparing && (
        <CompareHandle
          x={rect.x + rect.width * split}
          top={Math.max(0, rect.y)}
          height={Math.min(size.height, rect.y + rect.height) - Math.max(0, rect.y)}
          onMove={(x) => setSplit(clamp((x - rect.x) / rect.width, 0, 1))}
        />
      )}

      {map && hoveredLabel && (
        <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-background/85 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur first-letter:uppercase">
          {hoveredLabel}
        </div>
      )}

      {map && (
        <div className="absolute right-3 bottom-3 flex gap-1 rounded-xl bg-background/85 p-1 shadow-soft backdrop-blur">
          <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={view.zoom <= MIN_ZOOM}
            onClick={() => zoomAround(1 / 1.5, size.width / 2, size.height / 2)}>
            <ZoomOutIcon />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={view.zoom >= MAX_ZOOM}
            onClick={() => zoomAround(1.5, size.width / 2, size.height / 2)}>
            <ZoomInIcon />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Fit photo" disabled={view.zoom === 1}
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>
            <MaximizeIcon />
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * The draggable before/after divider: the original photo shows to its left.
 * @param props.x - Its position, in CSS px from the canvas's left edge.
 * @param props.top - Top of the visible photo.
 * @param props.height - Height of the visible photo.
 * @param props.onMove - Called with the new x while dragging.
 */
function CompareHandle({ x, top, height, onMove }: { x: number; top: number; height: number; onMove: (x: number) => void }) {
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect()
    onMove(event.clientX - bounds.left)
  }
  return (
    <div
      role="separator"
      aria-label="Before and after divider"
      aria-orientation="vertical"
      className="absolute z-10 w-8 -translate-x-1/2 cursor-ew-resize touch-none"
      style={{ left: x, top, height }}
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={drag}
    >
      <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]" />
      <span className="absolute top-3 right-full mr-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium shadow-soft">Before</span>
      <span className="absolute top-3 left-full ml-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium shadow-soft">After</span>
      <div className="absolute top-1/2 left-1/2 size-7 -translate-1/2 rounded-full border-2 border-white bg-black/30 shadow-float backdrop-blur" />
    </div>
  )
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

/**
 * Limits a value to a range.
 * @param value - The value.
 * @param min - Lowest allowed.
 * @param max - Highest allowed.
 */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Distance between the first two points.
 * @param points - Two or more points.
 */
function distance(points: { x: number; y: number }[]) {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}
