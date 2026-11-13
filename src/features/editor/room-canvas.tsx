import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { LoaderCircleIcon, MaximizeIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { labelMapUrl, photoUrlFor, type Room } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"
import { stampMark, stampStroke, type StrokePoint } from "./brush"
import { useEditorStore } from "./editor-store"
import { labelAt, loadLabelMap, restingOn, type LabelMap } from "./label-map"
import { hexToOklab } from "./oklab"
import { RoomRenderer, type PhotoRect, type RenderEdit } from "./renderer"
import type { BoundingBox } from "@/features/rooms/types"
import { LIMITS, MARK_PREVIEW, MESSAGES, OUTLINE_BRUSH_MODE, STROKE_SHAPE, type OutlineBrushMode, type StrokeShape } from "@/lib/constants"

/**
 * A stroke being drawn: painted into a copy of the label map for the live preview, or, while marking a new object,
 * into the mark's mask (with the mask as it was before the stroke, to undo a cancelled one). A brush paints as it
 * moves; a box or lasso is only outlined while drawn and fills its area when the pointer is let go.
 */
type Stroke = {
  pointerId: number
  shape: StrokeShape
  /** Where the stroke started, in CSS px (a box this small in either direction is a tap). */
  startScreen: { x: number; y: number }
  working: Uint8Array
  maskBefore: Uint8Array | null
  points: StrokePoint[]
  /** The last point, in CSS px, to skip moves under a pixel. */
  lastScreen: { x: number; y: number }
  radius: number
  changed: number
}

/** The user's zoom and pan: zoom 1 fits the photo; the offset moves its center, in CSS px. */
type View = { zoom: number; x: number; y: number }

/** A finished stroke, as the canvas hands it over. */
export type CanvasStroke = { mode: OutlineBrushMode; shape: StrokeShape; radius: number; points: StrokePoint[] }

/**
 * What the drag does, for the photo's label and the hint badge.
 * @param shape - The brush shape.
 * @param action - What it does, such as "add to the selected object".
 */
function gestureLabel(shape: StrokeShape, action: string) {
  if (shape === STROKE_SHAPE.Box) return `Drag a box over the photo to ${action}.`
  if (shape === STROKE_SHAPE.Lasso) return `Draw around an area of the photo to ${action}.`
  return `Click or drag over the photo to ${action}.`
}

/**
 * The badge's short gesture for a shape: "drag over", "drag a box over" or "draw around".
 * @param shape - The brush shape.
 */
function badgeGesture(shape: StrokeShape) {
  return shape === STROKE_SHAPE.Box ? "drag a box over" : shape === STROKE_SHAPE.Lasso ? "draw around" : "drag over"
}

/**
 * The interactive photo: shows the room with its recolors, outlines the object under the pointer
 * and the selected one, and handles tap/click to select, drag to pan, wheel/pinch/buttons to zoom,
 * and the before/after handle. While an outline brush is on, a click or drag paints or erases the
 * selected object under a round brush instead, shown live, or inside a box or lasso, filled when it is let go; the
 * middle mouse button still pans. While a new
 * object is being marked, strokes build its mask instead, shown as the selected object, and nothing is saved
 * until the inspector's Save.
 * @param props.room - A room whose analysis is Ready.
 * @param props.onStroke - Saves a finished stroke; resolves to whether it was saved (if not, the preview is undone).
 * @param props.saving - Whether a stroke is being saved (new strokes wait until it's done).
 * @param props.focus - Starts zoomed in on this part of the photo (an object's box), such as in the Parts dialog.
 * @param props.only - The objects that can be pointed at and selected; others are ignored. All when missing.
 * @param props.active - False pauses drawing, while another view of the room (the Parts dialog) is in front.
 * @param props.fallbackSelect - What a click outside the objects that can be selected selects (instead of nothing).
 */
export function RoomCanvas({
  room,
  onStroke,
  saving = false,
  focus,
  only,
  active = true,
  fallbackSelect = 0,
}: {
  room: Room
  onStroke?: (stroke: CanvasStroke) => Promise<boolean>
  saving?: boolean
  focus?: BoundingBox
  only?: ReadonlySet<number>
  active?: boolean
  fallbackSelect?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<RoomRenderer | null>(null)
  const [map, setMap] = useState<(LabelMap & { url: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const [split, setSplit] = useState(0.5)

  const {
    edits, selected, hovered, comparing, select, hover, revision, outlineTool, brushSize, brushShape,
    marking, markTool, markStrokes, addMarkStroke, presentObjects, setPresentObjects, removing, highlightedTone,
  } = useEditorStore()
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  // The box or lasso being drawn, in CSS px of the canvas, for its outline.
  const [area, setArea] = useState<{ shape: StrokeShape; points: { x: number; y: number }[] } | null>(null)
  const [previewTick, setPreviewTick] = useState(0)
  // The outlines and the photo shown: the version the editor is on (it changes with fixes, removals, undo and redo).
  const labelsUrl = labelMapUrl(room.id, revision ?? room.labelMapRevision)
  const photoSrc = photoUrlFor(room, revision ?? room.labelMapRevision)
  const firstLabelsUrl = useRef(labelsUrl)
  const firstPhotoSrc = useRef(photoSrc)
  const [shownPhoto, setShownPhoto] = useState(photoSrc)

  // Load the photo and the first label map, then hand both to a renderer on the canvas.
  useEffect(() => {
    const abort = new AbortController()
    const photo = new Image()
    photo.crossOrigin = "anonymous" // same mode as the <img> before it, so the cached copy is reused
    photo.src = apiUrl(firstPhotoSrc.current)

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
  }, [room.id])

  // Swap in another photo version (after a removal, undo or redo) without restarting the editor.
  useEffect(() => {
    if (!map || shownPhoto === photoSrc) return
    const abort = new AbortController()
    const photo = new Image()
    photo.crossOrigin = "anonymous"
    photo.src = apiUrl(photoSrc)
    photo
      .decode()
      .then(() => {
        if (abort.signal.aborted || !rendererRef.current) return
        rendererRef.current.setPhoto(photo)
        setShownPhoto(photoSrc)
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(MESSAGES.editorFailed)
      })
    return () => abort.abort()
  }, [map, photoSrc, shownPhoto])

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

  // Which objects have pixels in the outlines shown (the object list hides the others, such as an undone new object),
  // and what each rests on (removing a table offers the vase on it).
  const shownRevision = revision ?? room.labelMapRevision
  const presentKnown = presentObjects?.revision === shownRevision
  useEffect(() => {
    if (!map || map.url !== labelsUrl || presentKnown) return
    const present = new Set<number>()
    for (const label of map.labels) present.add(label)
    present.delete(0)
    setPresentObjects(shownRevision, present, restingOn(map))
  }, [map, labelsUrl, shownRevision, presentKnown, setPresentObjects])

  // The mask of a new object being marked, one byte per label map pixel; dropped when marking ends.
  const markMask = useRef<Uint8Array | null>(null)
  useEffect(() => {
    if (!map) return
    if (marking && markMask.current?.length !== map.labels.length) {
      markMask.current = new Uint8Array(map.labels.length)
    } else if (!marking && markMask.current) {
      markMask.current = null
      // After a save the new outlines are on their way and replace the preview; otherwise show the outlines
      // again (the draw below runs next, since marking changed).
      if (map.url === labelsUrl) rendererRef.current?.setLabels(map)
    }
  }, [marking, map, labelsUrl])

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

  // Zoom in on the focused box once the canvas has a size: the box with a margin fills the canvas.
  const focused = useRef(false)
  useEffect(() => {
    if (!focus || focused.current || size.width === 0 || size.height === 0) return
    focused.current = true
    const fitted = photoRect(size, room, { zoom: 1, x: 0, y: 0 })
    const zoom = clamp(
      Math.min(size.width / (fitted.width * focus.width * LIMITS.focusMargin), size.height / (fitted.height * focus.height * LIMITS.focusMargin)),
      1, LIMITS.zoom.max
    )
    const [cx, cy] = [focus.x + focus.width / 2, focus.y + focus.height / 2]
    setView(clampView(size, room, { zoom, x: fitted.width * zoom * (0.5 - cx), y: fitted.height * zoom * (0.5 - cy) }))
  }, [focus, size, room])

  // Which objects are parts of others: a part follows its object's color until it has its own, and a selected
  // object is outlined with its parts.
  const parents = useMemo(
    () => new Map(room.objects.flatMap((o) => (o.parentIndex ? [[o.index, o.parentIndex] as const] : []))),
    [room.objects]
  )

  // The index the marked object will get, so the preview can show it as the selected object.
  const markIndex = Math.min(255, Math.max(0, ...room.objects.map((o) => o.index)) + 1)

  // Recolors in the shader's terms: each object's target color and its original main color. While marking, the
  // mark is tinted too, so even a small one on a pale object is easy to see.
  const renderEdits = useMemo(() => {
    const byIndex = new Map(room.objects.map((o) => [o.index, o]))
    const result = new Map<number, RenderEdit>()
    for (const [index, edit] of Object.entries(edits)) {
      const object = byIndex.get(Number(index))
      if (!object) continue
      result.set(object.index, {
        target: hexToOklab(edit.color),
        source: hexToOklab(object.dominantColor),
        strength: edit.strength,
        tones: edit.tones?.map((t) => ({ center: hexToOklab(t.center), target: t.color ? hexToOklab(t.color) : null, strength: t.strength })),
      })
    }
    // A part without a color of its own looks like the rest of its object.
    for (const [part, parent] of parents) {
      const inherited = result.get(parent)
      if (!result.has(part) && inherited) result.set(part, inherited)
    }
    if (marking) result.set(markIndex, { target: hexToOklab(MARK_PREVIEW.color), source: hexToOklab(MARK_PREVIEW.source), strength: MARK_PREVIEW.strength })
    return result
  }, [edits, room.objects, marking, markIndex, parents])

  useEffect(() => {
    rendererRef.current?.setEdits(renderEdits, parents)
  }, [renderEdits, parents, map])

  // Draw on the next frame whenever anything visible changes.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer || !map || !active) return
    const frame = requestAnimationFrame(() => {
      renderer.render({
        rect, edits: renderEdits, hovered: marking ? 0 : hovered, selected: marking ? markIndex : selected,
        split: comparing ? rect.x + rect.width * split : null, highlight: marking ? null : highlightedTone,
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [map, rect, renderEdits, hovered, selected, comparing, split, previewTick, marking, markIndex, shownPhoto, active, highlightedTone])

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
  const objectAt = (x: number, y: number) => {
    const index = map ? labelAt(map, (x - rect.x) / rect.width, (y - rect.y) / rect.height) : 0
    return only && !only.has(index) ? 0 : index
  }
  // A part's strokes only take its object's pixels, and erasing gives them back to it (as the API does).
  const selectedParent = room.objects.find((o) => o.index === selected)?.parentIndex ?? undefined
  const toPhoto = (x: number, y: number): StrokePoint => ({ x: (x - rect.x) / rect.width, y: (y - rect.y) / rect.height })
  const brushing = marking || (!!outlineTool && !!onStroke && selected > 0)
  const tool = marking ? markTool : outlineTool

  /**
   * The outlines with the mark on top: every marked pixel shows as the new object.
   * @param mask - The mark.
   * @param base - The outlines shown.
   */
  const markedLabels = (mask: Uint8Array, base: Uint8Array) => {
    const labels = base.slice()
    for (let p = 0; p < labels.length; p++) if (mask[p]) labels[p] = markIndex
    return labels
  }

  /** Shows the stroke's working copy (or the mark) on the next frame. */
  const showPreview = () => {
    if (previewFrame.current) return
    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = 0
      const s = stroke.current
      if (s && map && rendererRef.current) {
        const labels = s.maskBefore && markMask.current ? markedLabels(markMask.current, map.labels) : s.working
        rendererRef.current.setLabels({ width: map.width, height: map.height, labels })
        setPreviewTick((n) => n + 1)
      }
    })
  }

  /** Drops the stroke being drawn and shows the saved outlines (and the mark so far) again. */
  const cancelStroke = () => {
    const s = stroke.current
    if (!s) return
    stroke.current = null
    setArea(null)
    if (s.maskBefore && markMask.current) markMask.current.set(s.maskBefore)
    if (map) {
      const mask = marking ? markMask.current : null
      rendererRef.current?.setLabels(mask ? { ...map, labels: markedLabels(mask, map.labels) } : map)
    }
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
      const mask = marking ? markMask.current : null
      if (marking && markStrokes.length >= LIMITS.mark.maxStrokes) return
      const shape = brushShape
      const start = { pointerId: event.pointerId, shape, startScreen: point, points: [first], lastScreen: point, radius }
      // A box or lasso fills its area when it is let go; until then only its outline shows.
      const brush = shape === STROKE_SHAPE.Brush
      if (mask) {
        const maskBefore = mask.slice()
        const changed = brush ? stampMark(mask, map.width, map.height, [first], radius, tool!, shape) : 0
        stroke.current = { ...start, working: map.labels, maskBefore, changed }
      } else {
        const working = map.labels.slice()
        const changed = brush ? stampStroke(working, map.width, map.height, [first], radius, tool!, selected, shape, undefined, selectedParent) : 0
        stroke.current = { ...start, working, maskBefore: null, changed }
      }
      if (brush) showPreview()
      else setArea({ shape, points: [point] })
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    if (brushing && event.pointerType !== "touch" && brushShape === STROKE_SHAPE.Brush) setCursor(point)
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
      s.lastScreen = point
      if (s.shape === STROKE_SHAPE.Box) {
        s.points = [s.points[0], next]
        setArea({ shape: s.shape, points: [s.startScreen, point] })
        return
      }
      if (s.shape === STROKE_SHAPE.Lasso) {
        s.points.push(next)
        setArea((a) => (a ? { shape: a.shape, points: [...a.points, point] } : a))
        return
      }
      const last = s.points[s.points.length - 1]
      s.changed += s.maskBefore && markMask.current
        ? stampMark(markMask.current, map.width, map.height, [next], s.radius, tool!, s.shape, last)
        : stampStroke(s.working, map.width, map.height, [next], s.radius, tool!, selected, s.shape, last, selectedParent)
      s.points.push(next)
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
      if (s.shape !== STROKE_SHAPE.Brush) {
        setArea(null)
        // A box too small to see, or a lasso without an inside, is a tap: nothing to fill.
        const big = s.shape === STROKE_SHAPE.Box
          ? s.points.length === 2 && Math.abs(point.x - s.startScreen.x) >= LIMITS.minAreaPx && Math.abs(point.y - s.startScreen.y) >= LIMITS.minAreaPx
          : s.points.length >= 3
        if (event.type !== "pointercancel" && big && map) {
          s.changed = s.maskBefore && markMask.current
            ? stampMark(markMask.current, map.width, map.height, s.points, s.radius, tool!, s.shape)
            : stampStroke(s.working, map.width, map.height, s.points, s.radius, tool!, selected, s.shape, undefined, selectedParent)
          if (!s.maskBefore) showPreview()
        }
      }
      if (s.maskBefore) {
        if (event.type === "pointercancel" || s.changed === 0 || !markMask.current) {
          cancelStroke()
          return
        }
        // The whole mark is drawn now (a quick drag can end before the preview's next frame); it is saved with
        // the inspector's Save.
        stroke.current = null
        if (map) rendererRef.current?.setLabels({ ...map, labels: markedLabels(markMask.current, map.labels) })
        setPreviewTick((n) => n + 1)
        let pixels = 0
        for (const value of markMask.current) pixels += value
        addMarkStroke({ mode: tool!, shape: s.shape, radius: s.radius, points: s.points }, pixels)
        return
      }
      if (event.type === "pointercancel" || s.changed === 0 || !onStroke) {
        cancelStroke()
        return
      }
      // Keep the preview on screen while it saves; the saved version replaces it, or it is undone.
      onStroke({ mode: tool!, shape: s.shape, radius: s.radius, points: s.points }).then((saved) => {
        if (stroke.current === s) stroke.current = null
        if (!saved && map) {
          rendererRef.current?.setLabels(map)
          setPreviewTick((n) => n + 1)
        }
      })
      return
    }
    if (wasTap && !brushing) select(objectAt(point.x, point.y) || fallbackSelect)
  }

  const hoveredLabel = marking ? undefined : room.objects.find((o) => o.index === hovered)?.label

  return (
    <div ref={containerRef} className="relative h-full min-h-72 w-full overflow-hidden rounded-xl">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={
          marking
            ? gestureLabel(brushShape, `${tool === OUTLINE_BRUSH_MODE.Paint ? "mark" : "unmark"} the new object`)
            : brushing
            ? gestureLabel(brushShape, `${outlineTool === OUTLINE_BRUSH_MODE.Paint ? "add to" : "erase from"} the selected object`)
            : "Your room. Click an object in the photo, or choose it from the list, to restyle it."
        }
        data-photo-rect={JSON.stringify(rect)}
        data-label-map={map?.url}
        className={cn(
          "absolute inset-0 size-full touch-none",
          brushing ? (saving ? "cursor-progress" : brushShape === STROKE_SHAPE.Brush ? "cursor-none" : "cursor-crosshair") : hovered ? "cursor-pointer" : view.zoom > 1 ? "cursor-grab" : "cursor-default"
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

      {map && removing.length > 0 && (
        <div
          role="status"
          data-removing
          className="absolute inset-0 z-20 grid cursor-progress place-items-center bg-background/45 backdrop-blur-[2px]"
        >
          <div className="flex max-w-[80%] items-center gap-2.5 rounded-xl bg-background/90 px-4 py-2.5 text-sm font-medium shadow-float">
            <LoaderCircleIcon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
            <span className="first-letter:uppercase">
              {removing.length === 1 ? `Removing the ${removing[0]}…` : `Removing the ${removing[0]} and ${removing.length - 1} more…`}
            </span>
          </div>
        </div>
      )}

      {map && brushing && (
        <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-background/85 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur">
          {saving && <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
          {saving
            ? "Saving…"
            : marking
              ? tool === OUTLINE_BRUSH_MODE.Paint ? `Marking: ${badgeGesture(brushShape)} the new object` : `Unmarking: ${badgeGesture(brushShape)} what isn't part of it`
              : tool === OUTLINE_BRUSH_MODE.Paint ? `Adding: ${badgeGesture(brushShape)} what's missing` : `Erasing: ${badgeGesture(brushShape)} what's wrong`}
        </div>
      )}

      {map && area && (
        <svg aria-hidden data-stroke-area={area.shape} className="pointer-events-none absolute inset-0 size-full">
          {[{ className: "stroke-black/45", width: 3.5 }, { className: "stroke-white", width: 1.5 }].map((line) =>
            area.shape === STROKE_SHAPE.Box && area.points.length === 2 ? (
              <rect
                key={line.width}
                x={Math.min(area.points[0].x, area.points[1].x)}
                y={Math.min(area.points[0].y, area.points[1].y)}
                width={Math.abs(area.points[1].x - area.points[0].x)}
                height={Math.abs(area.points[1].y - area.points[0].y)}
                className={cn(line.className, line.width < 2 && "fill-white/15")}
                fill="none"
                strokeWidth={line.width}
                strokeDasharray={tool === OUTLINE_BRUSH_MODE.Erase && line.width < 2 ? "5 4" : undefined}
              />
            ) : (
              <polygon
                key={line.width}
                points={area.points.map((p) => `${p.x},${p.y}`).join(" ")}
                className={cn(line.className, line.width < 2 && "fill-white/15")}
                fill="none"
                strokeWidth={line.width}
                strokeLinejoin="round"
                strokeDasharray={tool === OUTLINE_BRUSH_MODE.Erase && line.width < 2 ? "5 4" : undefined}
              />
            )
          )}
        </svg>
      )}

      {map && brushing && cursor && brushShape === STROKE_SHAPE.Brush && (
        <div
          aria-hidden
          data-brush-cursor
          className={cn(
            "pointer-events-none absolute rounded-full border-2 shadow-[0_0_0_1px_rgb(0_0_0/0.45)]",
            tool === OUTLINE_BRUSH_MODE.Paint ? "border-white" : "border-dashed border-white"
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
