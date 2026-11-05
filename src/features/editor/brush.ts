import type { OutlineBrushMode } from "@/features/rooms/api"

/** A stroke point, 0..1 of the photo's width and height. */
export type StrokePoint = { x: number; y: number }

/**
 * Stamps a round brush along a stroke on a label map, in place. The same rules as the API's
 * OutlineBrush (DesignApp.Infrastructure/Photos/OutlineBrush.cs), so the live preview is exactly
 * what gets saved: a pixel is covered when its center is within `radius` of a stamp; stamps sit
 * at every point and every half radius between points. Painting gives covered pixels to the
 * object; erasing clears only the object's own pixels.
 * @param labels - One object index per pixel; changed in place.
 * @param width - The label map's width.
 * @param height - The label map's height.
 * @param points - The path, from the first point (only the new ones when `from` is given).
 * @param radius - The brush radius, in label map pixels.
 * @param mode - Paint or erase.
 * @param target - The object's index.
 * @param from - The point before `points[0]`, when continuing a stroke: the gap to it is filled.
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
  from?: StrokePoint
): number {
  let changed = 0
  const spacing = Math.max(0.5, radius * 0.5)

  const stamp = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width - 1, Math.ceil(cx + radius))
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height - 1, Math.ceil(cy + radius))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy
        if (dx * dx + dy * dy > radius * radius) continue
        const p = y * width + x
        if (mode === "Paint" && labels[p] !== target) {
          labels[p] = target
          changed++
        } else if (mode === "Erase" && labels[p] === target) {
          labels[p] = 0
          changed++
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
      for (let s = 1; s <= steps; s++) stamp(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps)
    }
    previous = point
  }
  return changed
}
