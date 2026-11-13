/** A room's depth map: each cell's distance from the camera, relative to the farthest cell (0..1), row by row. */
export type DepthMap = { width: number; height: number; depth: Float32Array }

/**
 * Loads a depth map: a PNG with 16 bits per cell in the red (high byte) and green (low byte) channels.
 * @param url - Where it is (relative to the API).
 * @param signal - Cancels the download.
 */
export async function loadDepthMap(url: string, signal?: AbortSignal): Promise<DepthMap> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`The depth map couldn't be loaded (${response.status}).`)
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("This browser can't read the depth map.")
  context.drawImage(bitmap, 0, 0)
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
  const depth = new Float32Array(bitmap.width * bitmap.height)
  for (let i = 0; i < depth.length; i++) depth[i] = ((pixels[i * 4] << 8) | pixels[i * 4 + 1]) / 65535
  return { width: bitmap.width, height: bitmap.height, depth }
}
