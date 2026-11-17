import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { cn } from "cn"

import type { BoundingBox, Room } from "@/features/rooms/types"
import { LIMITS, MARK_PREVIEW, OUTLINE_BRUSH_MODE, STROKE_SHAPE, type StrokeShape } from "@/lib/constants"
import { BrushBadge, BrushCursor, CompareHandle, DrawnAreaOutline, RemovingVeil, ZoomButtons } from "./canvas-overlays"
import { useEditorStore } from "./editor-store"
import { labelAt, restingOn } from "./label-map"
import { hexToOklab } from "./oklab"
import type { RenderEdit } from "./renderer"
import { useBrushStroke, type CanvasStroke } from "./use-brush-stroke"
import { useRoomImages } from "./use-room-images"
import { clamp, useZoomPan } from "./use-zoom-pan"

export type { CanvasStroke } from "./use-brush-stroke"

/**
 * What the drag does, for the photo's label.
 * @param shape - The brush shape.
 * @param action - What it does, such as "add to the selected object".
 */
function gestureLabel(shape: StrokeShape, action: string) {
  if (shape === STROKE_SHAPE.Box) {
    return `Drag a box over the photo to ${action}.`
  }

  if (shape === STROKE_SHAPE.Lasso) {
    return `Draw around an area of the photo to ${action}.`
  }

  return `Click or drag over the photo to ${action}.`
}

/**
 * Distance between the first two points.
 * @param points - Two or more points.
 */
function distance(points: { x: number; y: number }[]) {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
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
  const [split, setSplit] = useState(0.5)
  const {
    edits, selected, hovered, comparing, select, hover, revision, outlineTool, brushSize, brushShape,
    marking, presentObjects, setPresentObjects, removing, highlightedTone,
  } = useEditorStore()
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  // The outlines and the photo shown: the version the editor is on (it changes with fixes, removals, undo and redo).
  const shownRevision = revision ?? room.labelMapRevision
  const { rendererRef, map, labelsUrl, shownPhoto, error } = useRoomImages(room, shownRevision, canvasRef)
  const { size, view, rect, zoomAround, panBy, zoomStep, fit } = useZoomPan(room, focus, containerRef, canvasRef)
  // Which objects are parts of others: a part follows its object's color until it has its own, and a selected
  // object is outlined with its parts.
  const parents = useMemo(
    () => new Map(room.objects.flatMap((o) => (o.parentIndex ? [[o.index, o.parentIndex] as const] : []))),
    [room.objects]
  )
  // The index the marked object will get, so the preview can show it as the selected object.
  const markIndex = Math.min(255, Math.max(0, ...room.objects.map((o) => o.index)) + 1)
  const selectedParent = room.objects.find((o) => o.index === selected)?.parentIndex ?? undefined
  const strokes = useBrushStroke({ map, labelsUrl, rendererRef, rect, markIndex, selectedParent, onStroke })
  // Recolors in the shader's terms: each object's target color and its original main color. While marking, the
  // mark is tinted too, so even a small one on a pale object is easy to see.
  const renderEdits = useMemo(() => {
    const byIndex = new Map(room.objects.map((o) => [o.index, o]))
    const result = new Map<number, RenderEdit>()

    for (const [index, edit] of Object.entries(edits)) {
      const object = byIndex.get(Number(index))

      if (!object) {
        continue
      }

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

      if (!result.has(part) && inherited) {
        result.set(part, inherited)
      }
    }

    if (marking) {
      result.set(markIndex, { target: hexToOklab(MARK_PREVIEW.color), source: hexToOklab(MARK_PREVIEW.source), strength: MARK_PREVIEW.strength })
    }

    return result
  }, [edits, room.objects, marking, markIndex, parents])
  // Pointer gestures: one pointer taps or pans (or brushes, with an outline tool on), two pointers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; pinch: number | null }>({ startX: 0, startY: 0, moved: false, pinch: null })
  const presentKnown = presentObjects?.revision === shownRevision
  const brushing = marking || (!!outlineTool && !!onStroke && selected > 0)
  const tool = strokes.tool
  const hoveredLabel = marking ? undefined : room.objects.find((o) => o.index === hovered)?.label

  const localPoint = (event: ReactPointerEvent) => {
    const bounds = canvasRef.current!.getBoundingClientRect()

    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  const objectAt = (x: number, y: number) => {
    const index = map ? labelAt(map, (x - rect.x) / rect.width, (y - rect.y) / rect.height) : 0

    return only && !only.has(index) ? 0 : index
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)

    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, point)

    if (pointers.current.size === 1) {
      gesture.current = { startX: point.x, startY: point.y, moved: false, pinch: null }
    }

    if (pointers.current.size === 2) {
      strokes.cancel() // a second finger means zoom, not paint
      gesture.current.pinch = distance([...pointers.current.values()])
    }

    if (brushing && !saving && pointers.current.size === 1 && event.button === 0) {
      strokes.start(event.pointerId, point)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    const previous = pointers.current.get(event.pointerId)
    const g = gesture.current

    if (brushing && event.pointerType !== "touch" && brushShape === STROKE_SHAPE.Brush) {
      setCursor(point)
    }

    if (!previous) {
      if (event.pointerType === "mouse" && !brushing) {
        hover(objectAt(point.x, point.y))
      }

      return
    }

    pointers.current.set(event.pointerId, point)

    if (strokes.move(event.pointerId, point)) {
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

    if (!g.moved && Math.hypot(point.x - g.startX, point.y - g.startY) > LIMITS.tapSlop) {
      g.moved = true
    }

    if (g.moved) {
      panBy(point.x - previous.x, point.y - previous.y)
    }
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    const wasTap = pointers.current.size === 1 && !gesture.current.moved

    pointers.current.delete(event.pointerId)

    if (strokes.end(event.pointerId, point, event.type === "pointercancel")) {
      return
    }

    if (wasTap && !brushing) {
      select(objectAt(point.x, point.y) || fallbackSelect)
    }
  }

  // Which objects have pixels in the outlines shown (the others, such as an undone new object, aren't counted),
  // and what each rests on (removing a table offers the vase on it).
  useEffect(() => {
    if (!map || map.url !== labelsUrl || presentKnown) {
      return
    }

    const present = new Set<number>()

    for (const label of map.labels) {
      present.add(label)
    }

    present.delete(0)
    setPresentObjects(shownRevision, present, restingOn(map))
  }, [map, labelsUrl, shownRevision, presentKnown, setPresentObjects])

  useEffect(() => {
    rendererRef.current?.setEdits(renderEdits, parents)
  }, [renderEdits, parents, map, rendererRef])

  // Draw on the next frame whenever anything visible changes.
  useEffect(() => {
    const renderer = rendererRef.current

    if (!renderer || !map || !active) {
      return
    }

    const frame = requestAnimationFrame(() => {
      renderer.render({
        rect, edits: renderEdits, hovered: marking ? 0 : hovered, selected: marking ? markIndex : selected,
        split: comparing ? rect.x + rect.width * split : null, highlight: marking ? null : highlightedTone,
      })
    })

    return () => cancelAnimationFrame(frame)
  }, [map, rect, renderEdits, hovered, selected, comparing, split, strokes.previewTick, marking, markIndex, shownPhoto, active, highlightedTone, rendererRef])

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
            : "Your room. Click an object in the photo to select it and restyle it."
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
      {map && removing.length > 0 && <RemovingVeil removing={removing} />}
      {map && brushing && <BrushBadge saving={saving} marking={marking} tool={tool} shape={brushShape} />}
      {map && strokes.area && <DrawnAreaOutline area={strokes.area} erase={tool === OUTLINE_BRUSH_MODE.Erase} />}
      {map && brushing && cursor && brushShape === STROKE_SHAPE.Brush && (
        <BrushCursor x={cursor.x} y={cursor.y} size={brushSize} erase={tool !== OUTLINE_BRUSH_MODE.Paint} />
      )}
      {map && hoveredLabel && (
        <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-background/85 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur first-letter:uppercase">
          {hoveredLabel}
        </div>
      )}
      {map && <ZoomButtons zoom={view.zoom} onStep={zoomStep} onFit={fit} />}
    </div>
  )
}
