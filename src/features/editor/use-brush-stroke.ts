import { useEffect, useRef, useState, type RefObject } from "react"

import { LIMITS, STROKE_SHAPE, type OutlineBrushMode, type StrokeShape } from "@/lib/constants"
import { stampMark, stampStroke, type StrokePoint } from "./brush"
import { useEditorStore } from "./editor-store"
import type { LabelMap } from "./label-map"
import type { PhotoRect, RoomRenderer } from "./renderer"

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

/** A point on the canvas, in CSS px. */
type Point = { x: number; y: number }

/** The box or lasso being drawn, in CSS px of the canvas, for its outline. */
export type DrawnArea = { shape: StrokeShape; points: Point[] }

/** A finished stroke, as the canvas hands it over. */
export type CanvasStroke = { mode: OutlineBrushMode; shape: StrokeShape; radius: number; points: StrokePoint[] }

/**
 * The outline brush and the marking of a new object on the editor's photo: a stroke is shown live as it is drawn, then
 * saved (an outline fix) or added to the mark (saved with the inspector's Save). The canvas hands it the pointer.
 * @param options.map - The outlines shown.
 * @param options.labelsUrl - The address of the outlines that should show (they differ while a new version loads).
 * @param options.rendererRef - The renderer the preview is drawn with.
 * @param options.rect - Where the photo is drawn.
 * @param options.markIndex - The index the marked object will get.
 * @param options.selectedParent - The object the selected one is a part of, if any: a part's strokes only take its
 * object's pixels, and erasing gives them back to it (as the API does).
 * @param options.onStroke - Saves a finished outline fix; resolves to whether it was saved (if not, it is undone).
 * @returns `tool` (paint or erase); `area`, the box or lasso being drawn; `previewTick`, which changes with every
 * preview; and `start`, `move` and `end`, which take the pointer (`move` and `end` say whether it was this stroke's).
 */
export function useBrushStroke({
  map,
  labelsUrl,
  rendererRef,
  rect,
  markIndex,
  selectedParent,
  onStroke,
}: {
  map: (LabelMap & { url: string }) | null
  labelsUrl: string
  rendererRef: RefObject<RoomRenderer | null>
  rect: PhotoRect
  markIndex: number
  selectedParent: number | undefined
  onStroke?: (stroke: CanvasStroke) => Promise<boolean>
}) {
  const { selected, outlineTool, brushSize, brushShape, marking, markTool, markStrokes, addMarkStroke } = useEditorStore()
  // The mask of a new object being marked, one byte per label map pixel; dropped when marking ends.
  const markMask = useRef<Uint8Array | null>(null)
  const stroke = useRef<Stroke | null>(null)
  const previewFrame = useRef(0)
  const [area, setArea] = useState<DrawnArea | null>(null)
  const [previewTick, setPreviewTick] = useState(0)
  const tool = marking ? markTool : outlineTool
  const toPhoto = (x: number, y: number): StrokePoint => ({ x: (x - rect.x) / rect.width, y: (y - rect.y) / rect.height })

  /**
   * The outlines with the mark on top: every marked pixel shows as the new object.
   * @param mask - The mark.
   * @param base - The outlines shown.
   */
  const markedLabels = (mask: Uint8Array, base: Uint8Array) => {
    const labels = base.slice()

    for (let p = 0; p < labels.length; p++) {
      if (mask[p]) {
        labels[p] = markIndex
      }
    }

    return labels
  }

  /** Shows the stroke's working copy (or the mark) on the next frame. */
  const showPreview = () => {
    if (previewFrame.current) {
      return
    }

    previewFrame.current = requestAnimationFrame(() => {
      const s = stroke.current

      previewFrame.current = 0

      if (s && map && rendererRef.current) {
        const labels = s.maskBefore && markMask.current ? markedLabels(markMask.current, map.labels) : s.working

        rendererRef.current.setLabels({ width: map.width, height: map.height, labels })
        setPreviewTick((n) => n + 1)
      }
    })
  }

  /** Drops the stroke being drawn and shows the saved outlines (and the mark so far) again. */
  const cancel = () => {
    const s = stroke.current

    if (!s) {
      return
    }

    stroke.current = null
    setArea(null)

    if (s.maskBefore && markMask.current) {
      markMask.current.set(s.maskBefore)
    }

    if (map) {
      const mask = marking ? markMask.current : null

      rendererRef.current?.setLabels(mask ? { ...map, labels: markedLabels(mask, map.labels) } : map)
    }

    setPreviewTick((n) => n + 1)
  }

  /**
   * Starts a stroke where the pointer went down.
   * @param pointerId - The pointer.
   * @param point - Where, in CSS px of the canvas.
   */
  const start = (pointerId: number, point: Point) => {
    if (!map || (marking && markStrokes.length >= LIMITS.mark.maxStrokes)) {
      return
    }

    const radius = Math.max(0.5, (brushSize / 2 / rect.width) * map.width)
    const first = toPhoto(point.x, point.y)
    const mask = marking ? markMask.current : null
    const shape = brushShape
    const begun = { pointerId, shape, startScreen: point, points: [first], lastScreen: point, radius }
    // A box or lasso fills its area when it is let go; until then only its outline shows.
    const brush = shape === STROKE_SHAPE.Brush

    if (mask) {
      const maskBefore = mask.slice()
      const changed = brush ? stampMark(mask, map.width, map.height, [first], radius, tool!, shape) : 0

      stroke.current = { ...begun, working: map.labels, maskBefore, changed }
    } else {
      const working = map.labels.slice()
      const changed = brush ? stampStroke(working, map.width, map.height, [first], radius, tool!, selected, shape, undefined, selectedParent) : 0

      stroke.current = { ...begun, working, maskBefore: null, changed }
    }

    if (brush) {
      showPreview()
    } else {
      setArea({ shape, points: [point] })
    }
  }

  /**
   * Draws the stroke on to where the pointer moved.
   * @param pointerId - The pointer.
   * @param point - Where, in CSS px of the canvas.
   * @returns Whether the pointer is this stroke's (then it pans nothing).
   */
  const move = (pointerId: number, point: Point) => {
    const s = stroke.current

    if (!s || s.pointerId !== pointerId || !map) {
      return false
    }

    if (Math.hypot(point.x - s.lastScreen.x, point.y - s.lastScreen.y) < 1 || s.points.length >= LIMITS.maxStrokePoints) {
      return true
    }

    const next = toPhoto(point.x, point.y)

    s.lastScreen = point

    if (s.shape === STROKE_SHAPE.Box) {
      s.points = [s.points[0], next]
      setArea({ shape: s.shape, points: [s.startScreen, point] })

      return true
    }

    if (s.shape === STROKE_SHAPE.Lasso) {
      s.points.push(next)
      setArea((a) => (a ? { shape: a.shape, points: [...a.points, point] } : a))

      return true
    }

    const last = s.points[s.points.length - 1]

    s.changed += s.maskBefore && markMask.current
      ? stampMark(markMask.current, map.width, map.height, [next], s.radius, tool!, s.shape, last)
      : stampStroke(s.working, map.width, map.height, [next], s.radius, tool!, selected, s.shape, last, selectedParent)
    s.points.push(next)
    showPreview()

    return true
  }

  /**
   * Finishes the stroke where the pointer was let go: fills a box or lasso, then adds it to the mark or saves it.
   * @param pointerId - The pointer.
   * @param point - Where, in CSS px of the canvas.
   * @param cancelled - Whether the pointer was cancelled (then the stroke is dropped).
   * @returns Whether the pointer was this stroke's (then it is no tap).
   */
  const end = (pointerId: number, point: Point, cancelled: boolean) => {
    const s = stroke.current

    if (!s || s.pointerId !== pointerId) {
      return false
    }

    if (s.shape !== STROKE_SHAPE.Brush) {
      // A box too small to see, or a lasso without an inside, is a tap: nothing to fill.
      const big = s.shape === STROKE_SHAPE.Box
        ? s.points.length === 2 && Math.abs(point.x - s.startScreen.x) >= LIMITS.minAreaPx && Math.abs(point.y - s.startScreen.y) >= LIMITS.minAreaPx
        : s.points.length >= 3

      setArea(null)

      if (!cancelled && big && map) {
        s.changed = s.maskBefore && markMask.current
          ? stampMark(markMask.current, map.width, map.height, s.points, s.radius, tool!, s.shape)
          : stampStroke(s.working, map.width, map.height, s.points, s.radius, tool!, selected, s.shape, undefined, selectedParent)

        if (!s.maskBefore) {
          showPreview()
        }
      }
    }

    if (s.maskBefore) {
      if (cancelled || s.changed === 0 || !markMask.current) {
        cancel()

        return true
      }

      let pixels = 0

      // The whole mark is drawn now (a quick drag can end before the preview's next frame); it is saved with
      // the inspector's Save.
      stroke.current = null

      if (map) {
        rendererRef.current?.setLabels({ ...map, labels: markedLabels(markMask.current, map.labels) })
      }

      setPreviewTick((n) => n + 1)

      for (const value of markMask.current) {
        pixels += value
      }

      addMarkStroke({ mode: tool!, shape: s.shape, radius: s.radius, points: s.points }, pixels)

      return true
    }

    if (cancelled || s.changed === 0 || !onStroke) {
      cancel()

      return true
    }

    // Keep the preview on screen while it saves; the saved version replaces it, or it is undone.
    onStroke({ mode: tool!, shape: s.shape, radius: s.radius, points: s.points }).then((saved) => {
      if (stroke.current === s) {
        stroke.current = null
      }

      if (!saved && map) {
        rendererRef.current?.setLabels(map)
        setPreviewTick((n) => n + 1)
      }
    })

    return true
  }

  useEffect(() => {
    if (!map) {
      return
    }

    if (marking && markMask.current?.length !== map.labels.length) {
      markMask.current = new Uint8Array(map.labels.length)
    } else if (!marking && markMask.current) {
      markMask.current = null

      // After a save the new outlines are on their way and replace the preview; otherwise show the outlines
      // again (the draw runs next, since marking changed).
      if (map.url === labelsUrl) {
        rendererRef.current?.setLabels(map)
      }
    }
  }, [marking, map, labelsUrl, rendererRef])

  return { tool, area, previewTick, start, move, end, cancel }
}
