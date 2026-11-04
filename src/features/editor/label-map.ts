import { apiUrl } from "@/lib/api"

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
  if (!response.ok) throw new Error(`The label map couldn't be loaded (${response.status}).`)

  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("This browser can't read the label map.")
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
