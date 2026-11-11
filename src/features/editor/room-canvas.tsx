import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { LoaderCircleIcon, MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { labelMapUrl, type Room } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"
import { stampStroke, type StrokePoint } from "./brush"
import { useEditorStore } from "./editor-store"
import { labelAt, loadLabelMap, type LabelMap } from "./label-map"
import { hexToOklab } from "./oklab"
import { RoomRenderer, type PhotoRect, type RenderEdit } from "./renderer"
import { LIMITS, MESSAGES, OUTLINE_BRUSH_MODE, type OutlineBrushMode } from "@/lib/constants"

/** A brush stroke being drawn: painted into a copy of the label map for the live preview. */
type Stroke = {
  pointerId: number
  working: Uint8Array
  points: StrokePoint[]
  /** The last point, in CSS px, to skip moves under a pixel. */
  lastScreen: { x: number; y: number }
  radius: number
  changed: number
}

/** The user's zoom and pan: zoom 1 fits the photo; the offset moves its center, in CSS px. */
type View = { zoom: number; x: number; y: number }

/** A finished stroke, as the canvas hands it over. */
export type CanvasStroke = { mode: OutlineBrushMode; radius: number; points: StrokePoint[] }

/**
 * The interactive photo: shows the room with its recolors, outlines the object under the pointer
 * and the selected one, and handles tap/click to select, drag to pan, wheel/pinch/buttons to zoom,
 * and the before/after handle. While an outline brush is on, a click or drag paints or erases the
 * selected object under a round brush instead, shown live; the middle mouse button still pans.
 * @param props.room - A room whose analysis is Ready.
 * @param props.onStroke - Saves a finished stroke; resolves to whether it was saved (if not, the preview is undone).
 * @param props.saving - Whether a stroke is being saved (new strokes wait until it's done).
 */
export function RoomCanvas({
  room,
  onStroke,
  saving = false,
}: {
  room: Room
  onStroke?: (stroke: CanvasStroke) => Promise<boolean>
  saving?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<RoomRenderer | null>(null)
  const [map, setMap] = useState<(LabelMap & { url: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const [split, setSplit] = useState(0.5)

  const { edits, selected, hovered, comparing, select, hover, revision, outlineTool, brushSize } = useEditorStore()
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [previewTick, setPreviewTick] = useState(0)
  // The outlines shown: the version the editor is on (it changes with fixes, undo and redo).
  const labelsUrl = labelMapUrl(room.id, revision ?? room.labelMapRevision)
  const firstLabelsUrl = useRef(labelsUrl)

  // Load the photo and the first label map, then hand both to a renderer on the canvas.
  useEffect(() => {
    const abort = new AbortController()
    const photo = new Image()
    photo.crossOrigin = "anonymous" // same mode as the <img> before it, so the cached copy is reused
    photo.src = apiUrl(room.photoUrl)

    Promise.all([photo.decode(), loadLabelMap(firstLabelsUrl.current, abort.signal)])
      .then(([, labelMap]) => {
        if (abort.signal.aborted || !canvasRef.current) return
        const renderer = new RoomRenderer(canvasRef.current)
        renderer.setRoom(photo, labelMap)
        rendererRef.current = renderer
        setMap({ url: firstLabelsUrl.current, ...labelMap })
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : MESSAGES.editorFailed)
      })

    return () => {
      abort.abort()
      rendererRef.current?.dispose()
      rendererRef.current = null
      setMap(null)
    }
  }, [room.photoUrl])

  // Swap in another label map version (after a fix, undo or redo) without reloading the photo.
  // Until it arrives the previous outlines stay on screen.
  useEffect(() => {
    if (!map || map.url === labelsUrl) return
    const abort = new AbortController()
    loadLabelMap(labelsUrl, abort.signal)
      .then((labelMap) => {
        if (abort.signal.aborted || !rendererRef.current) return
        rendererRef.current.setLabels(labelMap)
        setMap({ url: labelsUrl, ...labelMap })
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : MESSAGES.outlinesFailed)
      })
    return () => abort.abort()
  }, [labelsUrl, map])

  // Track the container's size, so the canvas fills it at any width.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
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
    const frame = requestAnimationFrame(() => {
      renderer.render({ rect, edits: renderEdits, hovered, selected, split: comparing ? rect.x + rect.width * split : null })
    })
    return () => cancelAnimationFrame(frame)
  }, [map, rect, renderEdits, hovered, selected, comparing, split, previewTick])

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

  // Pointer gestures: one pointer taps or pans (or brushes, with an outline tool on), two pointers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; pinch: number | null }>({ startX: 0, startY: 0, moved: false, pinch: null })
  const stroke = useRef<Stroke | null>(null)
  const previewFrame = useRef(0)

  const localPoint = (event: ReactPointerEvent) => {
    const bounds = canvasRef.current!.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }
  const objectAt = (x: number, y: number) => (map ? labelAt(map, (x - rect.x) / rect.width, (y - rect.y) / rect.height) : 0)
  const toPhoto = (x: number, y: number): StrokePoint => ({ x: (x - rect.x) / rect.width, y: (y - rect.y) / rect.height })
  const brushing = !!outlineTool && !!onStroke && selected > 0

  /** Shows the stroke's working copy on the next frame. */
  const showPreview = () => {
    if (previewFrame.current) return
    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = 0
      const s = stroke.current
      if (s && map && rendererRef.current) {
        rendererRef.current.setLabels({ width: map.width, height: map.height, labels: s.working })
        setPreviewTick((n) => n + 1)
      }
    })
  }

  /** Drops the stroke being drawn and shows the saved outlines again. */
  const cancelStroke = () => {
    if (!stroke.current) return
    stroke.current = null
    if (map) rendererRef.current?.setLabels(map)
    setPreviewTick((n) => n + 1)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = localPoint(event)
    pointers.current.set(event.pointerId, point)
    if (pointers.current.size === 1) gesture.current = { startX: point.x, startY: point.y, moved: false, pinch: null }
    if (pointers.current.size === 2) {
      cancelStroke() // a second finger means zoom, not paint
      gesture.current.pinch = distance([...pointers.current.values()])
    }

    if (brushing && map && !saving && pointers.current.size === 1 && event.button === 0) {
      const radius = Math.max(0.5, (brushSize / 2 / rect.width) * map.width)
      const first = toPhoto(point.x, point.y)
      const working = map.labels.slice()
      const changed = stampStroke(working, map.width, map.height, [first], radius, outlineTool!, selected)
      stroke.current = { pointerId: event.pointerId, working, points: [first], lastScreen: point, radius, changed }
      showPreview()
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    if (brushing && event.pointerType !== "touch") setCursor(point)
    const previous = pointers.current.get(event.pointerId)
    if (!previous) {
      if (event.pointerType === "mouse" && !brushing) hover(objectAt(point.x, point.y))
      return
    }
    pointers.current.set(event.pointerId, point)
    const g = gesture.current

    const s = stroke.current
    if (s && s.pointerId === event.pointerId && map) {
      if (Math.hypot(point.x - s.lastScreen.x, point.y - s.lastScreen.y) < 1 || s.points.length >= LIMITS.maxStrokePoints) return
      const next = toPhoto(point.x, point.y)
      s.changed += stampStroke(s.working, map.width, map.height, [next], s.radius, outlineTool!, selected, s.points[s.points.length - 1])
      s.points.push(next)
      s.lastScreen = point
      showPreview()
      return
    }

    if (pointers.current.size === 2 && g.pinch) {
      const points = [...pointers.current.values()]
      const now = distance(points)
      zoomAround(now / g.pinch, (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2)
      g.pinch = now
      g.moved = true
      return
    }
    if (!g.moved && Math.hypot(point.x - g.startX, point.y - g.startY) > LIMITS.tapSlop) g.moved = true
    if (g.moved) setView((v) => clampView(size, room, { ...v, x: v.x + point.x - previous.x, y: v.y + point.y - previous.y }))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    const wasTap = pointers.current.size === 1 && !gesture.current.moved
    pointers.current.delete(event.pointerId)

    const s = stroke.current
    if (s && s.pointerId === event.pointerId) {
      if (event.type === "pointercancel" || s.changed === 0 || !onStroke) {
        cancelStroke()
        return
      }
      // Keep the preview on screen while it saves; the saved version replaces it, or it is undone.
      onStroke({ mode: outlineTool!, radius: s.radius, points: s.points }).then((saved) => {
        if (stroke.current === s) stroke.current = null
        if (!saved && map) {
          rendererRef.current?.setLabels(map)
          setPreviewTick((n) => n + 1)
        }
      })
      return
    }
    if (wasTap && !brushing) select(objectAt(point.x, point.y))
  }

  const hoveredLabel = room.objects.find((o) => o.index === hovered)?.label

  return (
    <div ref={containerRef} className="relative h-full min-h-72 w-full overflow-hidden rounded-xl">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={
          brushing
            ? `Click or drag over the photo to ${outlineTool === OUTLINE_BRUSH_MODE.Paint ? "add to" : "erase from"} the selected object.`
            : "Your room. Click an object in the photo, or choose it from the list, to restyle it."
        }
        data-photo-rect={JSON.stringify(rect)}
        data-label-map={map?.url}
        className={cn(
          "absolute inset-0 size-full touch-none",
          brushing ? (saving ? "cursor-progress" : "cursor-none") : hovered ? "cursor-pointer" : view.zoom > 1 ? "cursor-grab" : "cursor-default"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          hover(0)
          setCursor(null)
        }}
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

      {map && brushing && (
        <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-background/85 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur">
          {saving && <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
          {saving ? "Saving…" : outlineTool === OUTLINE_BRUSH_MODE.Paint ? "Adding: drag over what's missing" : "Erasing: drag over what's wrong"}
        </div>
      )}

      {map && brushing && cursor && (
        <div
          aria-hidden
          data-brush-cursor
          className={cn(
            "pointer-events-none absolute rounded-full border-2 shadow-[0_0_0_1px_rgb(0_0_0/0.45)]",
            outlineTool === OUTLINE_BRUSH_MODE.Paint ? "border-white" : "border-dashed border-white"
          )}
          style={{ left: cursor.x - brushSize / 2, top: cursor.y - brushSize / 2, width: brushSize, height: brushSize }}
        />
      )}

      {map && hoveredLabel && (
        <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-background/85 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur first-letter:uppercase">
          {hoveredLabel}
        </div>
      )}

      {map && (
        <div className="absolute right-3 bottom-3 flex gap-1 rounded-xl bg-background/85 p-1 shadow-soft backdrop-blur">
          <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={view.zoom <= LIMITS.zoom.min}
            onClick={() => zoomAround(1 / 1.5, size.width / 2, size.height / 2)}>
            <ZoomOutIcon />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={view.zoom >= LIMITS.zoom.max}
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
