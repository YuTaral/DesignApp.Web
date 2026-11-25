import { PANORAMA } from "@/lib/constants"

/** Degrees to radians. */
const RADIANS = Math.PI / 180

/**
 * The furthest the 360° viewer may tilt up or down with a lens: straight up and down, where every point of the photo's
 * seam meets, stay out of view by the seam's margin (the API's PanoramaView.MaxTilt).
 * @param fov - The lens across the view's height, in degrees.
 * @returns The tilt, in degrees.
 */
export function maxTilt(fov: number) {
  return Math.min(PANORAMA.maxPitch, PANORAMA.straightUp - fov / 2 - PANORAMA.seamMargin)
}

/**
 * How far the 360° viewer may turn either way before its edge reaches the seam behind (the API's PanoramaView.IsAllowed).
 * Level, the edge is half the view's width away; tilted, its top or bottom corner reaches further, nearer straight up
 * or down, where the turns crowd together.
 * The view is a saved view's shape (`PANORAMA.viewAspect`), as the API checks it: the canvas is that shape too, but
 * measured in whole pixels.
 * @param fov - The lens across the view's height, in degrees.
 * @param pitch - The tilt, in degrees.
 * @returns The turn, in degrees.
 */
export function yawLimit(fov: number, pitch: number) {
  const half = (fov / 2) * RADIANS
  const tilt = Math.abs(pitch) * RADIANS
  const reach = Math.atan2(Math.sin(half) * PANORAMA.viewAspect, Math.cos(tilt + half)) / RADIANS

  return Math.max(0, 180 - reach - PANORAMA.seamMargin)
}
