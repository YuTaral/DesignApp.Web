import { apiUrl } from "@/lib/api"
import { MESSAGES, TONES } from "@/lib/constants"
import { labelMapUrl, photoUrlFor, type Room } from "@/features/rooms/types"
import { loadLabelMap } from "./label-map"
import { hexToOklab, oklabToHex, rgbToOklab, type Oklab } from "./oklab"

/** One tone an object splits into: its original color and how much of the object it covers. */
export type FoundTone = {
  /** The tone's original color, "#RRGGBB"; the object's pixels nearest it belong to it. */
  center: string
  /** Its share of the object, 0..1. */
  share: number
}

/**
 * The colors of one object's pixels in OKLab, read from the photo at the label map's size (the analysis size).
 * @param room - The room.
 * @param revision - The label map version shown.
 * @param index - The object.
 * @param signal - Cancels the downloads.
 */
export async function loadObjectColors(room: Room, revision: number, index: number, signal?: AbortSignal): Promise<Oklab[]> {
  const photo = new Image()
  const colors: Oklab[] = []
  let count = 0
  let seen = 0

  photo.crossOrigin = "anonymous" // same mode as the editor's photo, so the cached copy is reused
  photo.src = apiUrl(photoUrlFor(room, revision))
  const [map] = await Promise.all([loadLabelMap(labelMapUrl(room, revision), signal), photo.decode()])
  const canvas = new OffscreenCanvas(map.width, map.height)
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) {
    throw new Error(MESSAGES.labelMapUnreadable)
  }

  context.drawImage(photo, 0, 0, map.width, map.height)
  const rgba = context.getImageData(0, 0, map.width, map.height).data

  for (const label of map.labels) {
    if (label === index) {
      count++
    }
  }

  // Every pixel of a small object; an even spread of a large one.
  const step = Math.max(1, Math.floor(count / TONES.sample))

  for (let p = 0; p < map.labels.length; p++) {
    if (map.labels[p] !== index) {
      continue
    }

    if (seen++ % step === 0) {
      colors.push(rgbToOklab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]))
    }
  }

  return colors
}

/**
 * Splits colors into tones with k-means in OKLab. It starts from evenly spaced lightness quantiles, so the same
 * pixels always give the same tones, and merges tones too close to tell apart.
 * @param colors - The object's pixel colors.
 * @param count - How many tones to look for (TONES.min..TONES.max).
 * @returns The tones, largest first; empty when the object has one main color.
 */
export function findTones(colors: readonly Oklab[], count: number): FoundTone[] {
  if (colors.length === 0) {
    return []
  }

  const sorted = [...colors].sort((x, y) => x.l - y.l)
  let centers = Array.from({ length: count }, (_, i) => sorted[Math.floor(((i + 0.5) / count) * sorted.length)])
  const assigned = new Uint8Array(colors.length)
  const kept: { center: Oklab; size: number }[] = []

  for (let iteration = 0; iteration < TONES.iterations; iteration++) {
    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, n: 0 }))

    colors.forEach((color, i) => {
      const nearest = nearestCenter(color, centers)
      const sum = sums[nearest]

      assigned[i] = nearest
      sum.l += color.l
      sum.a += color.a
      sum.b += color.b
      sum.n++
    })
    centers = sums.map((sum, i) => (sum.n > 0 ? { l: sum.l / sum.n, a: sum.a / sum.n, b: sum.b / sum.n } : centers[i]))
  }

  // Merge tones closer than the eye tells apart (or that round to the same hex), keeping the larger one.
  const sizes = centers.map((_, i) => assigned.filter((a) => a === i).length)
  const order = centers.map((_, i) => i).sort((x, y) => sizes[y] - sizes[x])

  for (const i of order) {
    if (sizes[i] === 0) {
      continue
    }

    const close = kept.find((k) => distance(k.center, centers[i]) < TONES.mergeDistance || oklabToHex(k.center) === oklabToHex(centers[i]))

    if (close) {
      close.size += sizes[i]
    } else {
      kept.push({ center: centers[i], size: sizes[i] })
    }
  }

  if (kept.length < TONES.min) {
    return []
  }

  return kept.map((k) => ({ center: oklabToHex(k.center), share: Math.round((k.size / colors.length) * 1000) / 1000 }))
}

/**
 * Which tone a color belongs to: the one with the nearest center.
 * @param color - The color, "#RRGGBB" or OKLab.
 * @param centers - The tones' centers, "#RRGGBB".
 */
export function toneOf(color: string | Oklab, centers: readonly string[]) {
  return nearestCenter(typeof color === "string" ? hexToOklab(color) : color, centers.map(hexToOklab))
}

/**
 * The index of the center nearest a color.
 * @param color - The color.
 * @param centers - The centers.
 */
function nearestCenter(color: Oklab, centers: readonly Oklab[]) {
  let best = 0

  for (let i = 1; i < centers.length; i++) {
    if (distance(color, centers[i]) < distance(color, centers[best])) {
      best = i
    }
  }

  return best
}

/**
 * The distance between two OKLab colors (about 0.02 is a just-visible difference).
 * @param x - One color.
 * @param y - The other.
 */
function distance(x: Oklab, y: Oklab) {
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
}
