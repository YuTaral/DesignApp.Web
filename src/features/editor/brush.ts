import { OUTLINE_BRUSH_MODE, STROKE_SHAPE, type OutlineBrushMode, type StrokeShape } from "@/lib/constants"

/** A stroke point, 0..1 of the photo's width and height. */
export type StrokePoint = { x: number; y: number }

/**
 * Walks a round brush along a path: the same pixel walk as the API's BrushStamp
 * (DesignApp.Infrastructure/Photos/Objects/BrushStamp.cs), so the live preview is exactly what gets saved.
 * A pixel is covered when its center is within `radius` of a stamp; stamps sit at every point and every
 * half radius between points.
 * @param width - The label map's width.
 * @param height - The label map's height.
 * @param points - The path, from the first point (only the new ones when `from` is given).
 * @param radius - The brush radius, in label map pixels.
 * @param onPixel - Called for every covered pixel, by its position in the map, once per stamp.
 * @param from - The point before `points[0]`, when continuing a stroke: the gap to it is filled.
 */
function walkBrush(
  width: number,
  height: number,
  points: StrokePoint[],
  radius: number,
  onPixel: (p: number) => void,
  from?: StrokePoint
) {
  const spacing = Math.max(0.5, radius * 0.5)

  const stamp = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width - 1, Math.ceil(cx + radius))
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height - 1, Math.ceil(cy + radius))

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy

        if (dx * dx + dy * dy <= radius * radius) {
          onPixel(y * width + x)
        }
      }
    }
  }

  let previous = from

  for (const point of points) {
    const bx = point.x * width, by = point.y * height

    if (!previous) {
      stamp(bx, by)
    } else {
      const ax = previous.x * width, ay = previous.y * height
      const steps = Math.max(1, Math.ceil(Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) / spacing))

      for (let s = 1; s <= steps; s++) {
        stamp(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps)
      }
    }

    previous = point
  }
}

/**
 * Fills the area of a box or lasso: the same fill as the API's StrokeCover
 * (DesignApp.Infrastructure/Photos/Objects/StrokeCover.cs), so the preview is exactly what gets saved. A pixel is
 * covered when its center is inside: between a box's two corners (edges included), or inside a lasso closed from
 * its last point back to the first, by the even-odd rule.
 * @param width - The label map's width.
 * @param height - The label map's height.
 * @param shape - Box (two corners) or Lasso (at least three points).
 * @param points - The corners or the path, each 0..1 of the photo.
 * @param onPixel - Called once for every covered pixel, by its position in the map.
 */
function walkArea(width: number, height: number, shape: StrokeShape, points: StrokePoint[], onPixel: (p: number) => void) {
  if (shape === STROKE_SHAPE.Box) {
    const ax = points[0].x * width, ay = points[0].y * height, bx = points[1].x * width, by = points[1].y * height
    const x0 = Math.max(0, Math.ceil(Math.min(ax, bx) - 0.5)), x1 = Math.min(width - 1, Math.floor(Math.max(ax, bx) - 0.5))
    const y0 = Math.max(0, Math.ceil(Math.min(ay, by) - 0.5)), y1 = Math.min(height - 1, Math.floor(Math.max(ay, by) - 0.5))

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        onPixel(y * width + x)
      }
    }

    return
  }

  const xs = points.map((p) => p.x * width)
  const ys = points.map((p) => p.y * height)
  const crossings: number[] = []

  for (let y = 0; y < height; y++) {
    const cy = y + 0.5

    crossings.length = 0

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      if ((ys[i] <= cy) === (ys[j] <= cy)) {
        continue
      }

      crossings.push(xs[j] + ((cy - ys[j]) * (xs[i] - xs[j])) / (ys[i] - ys[j]))
    }

    crossings.sort((a, b) => a - b)

    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(crossings[k] - 0.5)), x1 = Math.min(width - 1, Math.ceil(crossings[k + 1] - 0.5) - 1)

      for (let x = x0; x <= x1; x++) {
        onPixel(y * width + x)
      }
    }
  }
}

/**
 * The pixels a stroke covers, by its shape: the brush along the path (continuing from `from`), or a box's or
 * lasso's area (filled in one go, so `from` doesn't apply).
 * @param width - The label map's width.
 * @param height - The label map's height.
 * @param shape - The stroke's shape.
 * @param points - The path, the box's corners, or the lasso.
 * @param radius - The brush radius, in label map pixels (only for the brush).
 * @param onPixel - Called for every covered pixel.
 * @param from - The brush's point before `points[0]`, when continuing a stroke.
 */
function walkStroke(
  width: number,
  height: number,
  shape: StrokeShape,
  points: StrokePoint[],
  radius: number,
  onPixel: (p: number) => void,
  from?: StrokePoint
) {
  if (shape === STROKE_SHAPE.Brush) {
    walkBrush(width, height, points, radius, onPixel, from)
  } else {
    walkArea(width, height, shape, points, onPixel)
  }
}

/**
 * Applies a stroke to a label map, in place, with the API's OutlineBrush rules: painting gives covered pixels to
 * the object; erasing clears only the object's own pixels. For a part of an object, painting only takes that object's
 * pixels and erasing gives them back to it. A brush is stamped along the path; a box or lasso fills its area.
 * @param labels - One object index per pixel; changed in place.
 * @param width - The label map's width.
 * @param height - The label map's height.
 * @param points - The path, from the first point (only the new ones when `from` is given); a box's corners; a lasso.
 * @param radius - The brush radius, in label map pixels.
 * @param mode - Paint or erase.
 * @param target - The object's index.
 * @param shape - Brush, Box or Lasso.
 * @param from - The brush's point before `points[0]`, when continuing a stroke: the gap to it is filled.
 * @param parent - When the object is a part, the object it is a part of.
 * @returns How many pixels changed.
 */
export function stampStroke(
  labels: Uint8Array,
  width: number,
  height: number,
  points: StrokePoint[],
  radius: number,
  mode: OutlineBrushMode,
  target: number,
  shape: StrokeShape,
  from?: StrokePoint,
  parent?: number
): number {
  let changed = 0

  walkStroke(width, height, shape, points, radius, (p) => {
    if (mode === OUTLINE_BRUSH_MODE.Paint && labels[p] !== target && (parent === undefined || labels[p] === parent)) {
      labels[p] = target
      changed++
    } else if (mode === OUTLINE_BRUSH_MODE.Erase && labels[p] === target) {
      labels[p] = parent ?? 0
      changed++
    }
  }, from)

  return changed
}

/**
 * Applies a stroke to the mask of an object being marked by hand, in place, with the API's ObjectMarker rules:
 * painting marks covered pixels, erasing unmarks them. A brush is stamped along the path; a box or lasso fills its
 * area.
 * @param mask - 1 for every marked pixel, else 0; changed in place.
 * @param width - The label map's width.
 * @param height - The label map's height.
 * @param points - The path, from the first point (only the new ones when `from` is given); a box's corners; a lasso.
 * @param radius - The brush radius, in label map pixels.
 * @param mode - Mark (paint) or unmark (erase).
 * @param shape - Brush, Box or Lasso.
 * @param from - The brush's point before `points[0]`, when continuing a stroke.
 * @returns How many pixels changed.
 */
export function stampMark(
  mask: Uint8Array,
  width: number,
  height: number,
  points: StrokePoint[],
  radius: number,
  mode: OutlineBrushMode,
  shape: StrokeShape,
  from?: StrokePoint
): number {
  const value = mode === OUTLINE_BRUSH_MODE.Paint ? 1 : 0
  let changed = 0

  walkStroke(width, height, shape, points, radius, (p) => {
    if (mask[p] !== value) {
      mask[p] = value
      changed++
    }
  }, from)

  return changed
}
