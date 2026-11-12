import { apiUrl } from "@/lib/api"
import { LIMITS, MESSAGES } from "@/lib/constants"

/** A room's label map: for every pixel, the index of the object there (0 for none). */
export type LabelMap = {
  /** Width in pixels (the analysis size, which can be smaller than the photo). */
  width: number
  /** Height in pixels. */
  height: number
  /** One object index per pixel, row by row. */
  labels: Uint8Array
}

/**
 * Downloads and decodes a room's label map. The PNG is decoded without color management, so
 * every pixel keeps its exact value: a single changed value would point at the wrong object.
 * @param url - The room's labelMapUrl.
 * @param signal - Cancels the download.
 */
export async function loadLabelMap(url: string, signal?: AbortSignal): Promise<LabelMap> {
  const response = await fetch(apiUrl(url), { signal })
  if (!response.ok) throw new Error(MESSAGES.labelMapFailed(response.status))

  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error(MESSAGES.labelMapUnreadable)
  context.drawImage(bitmap, 0, 0)
  const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
  bitmap.close()

  const labels = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < labels.length; i++) labels[i] = rgba[i * 4]
  return { width: canvas.width, height: canvas.height, labels }
}

/**
 * The object at a point of the photo.
 * @param map - The label map.
 * @param u - Horizontal position, 0 (left) to 1 (right).
 * @param v - Vertical position, 0 (top) to 1 (bottom).
 * @returns The object's index, or 0 when the point has no object or is outside the photo.
 */
export function labelAt(map: LabelMap, u: number, v: number): number {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0
  return map.labels[Math.floor(v * map.height) * map.width + Math.floor(u * map.width)]
}

/**
 * For each object, the object it rests on: the one directly below most of its bottom edge in the label map (a vase
 * on a table, a cushion on a sofa). An object standing on the floor rests on the floor; one with nothing under it
 * rests on nothing and is left out.
 * @param map - The label map.
 * @returns The supporting object's index, by object index.
 */
export function restingOn(map: LabelMap): Map<number, number> {
  const { width, height, labels } = map
  // The lowest row of each object in each column (-1 where the object isn't in that column).
  const bottom = new Int32Array(256 * width).fill(-1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x]
      if (label) bottom[label * width + x] = y
    }
  }
  const result = new Map<number, number>()
  for (let label = 1; label < 256; label++) {
    const votes = new Map<number, number>()
    let columns = 0
    for (let x = 0; x < width; x++) {
      const y = bottom[label * width + x]
      if (y < 0) continue
      columns++
      // The first other object within a few pixels below the edge (the outlines can leave a thin gap).
      for (let dy = 1; dy <= LIMITS.removal.restingGap && y + dy < height; dy++) {
        const below = labels[(y + dy) * width + x]
        if (below && below !== label) {
          votes.set(below, (votes.get(below) ?? 0) + 1)
          break
        }
      }
    }
    let best = 0
    let bestVotes = 0
    for (const [below, count] of votes) {
      if (count > bestVotes) [best, bestVotes] = [below, count]
    }
    if (best && bestVotes >= columns * LIMITS.removal.restingShare) result.set(label, best)
  }
  return result
}
