import { FLOOR_TYPE, type FloorType } from "@/lib/constants"

/** How many metres of floor one painted tile of the pattern covers (it repeats across the room). */
export const FLOOR_TILE_METRES = 2

/**
 * Paints one square tile of a floor's pattern in its color: planks, parquet, tiles, stone, concrete or carpet. The
 * tile covers {@link FLOOR_TILE_METRES} metres and repeats seamlessly; the same seed always paints the same tile, so
 * the 3D view (and the photo's guide) never changes between draws.
 * @param context - Where to paint.
 * @param type - The floor type.
 * @param color - The floor's color, "#RRGGBB".
 * @param size - The tile's size, in pixels.
 */
export function paintFloor(context: CanvasRenderingContext2D, type: FloorType, color: string, size: number) {
  const random = seeded(7)
  const metre = size / FLOOR_TILE_METRES
  const seam = shade(color, 0.72)

  context.fillStyle = color
  context.fillRect(0, 0, size, size)

  /** Planks running away from the viewer, in staggered lengths. */
  const planks = (width: number, length: number, spread: number) => {
    const columns = Math.round(FLOOR_TILE_METRES / width)
    const w = size / columns

    for (let c = 0; c < columns; c++) {
      const offset = random() * length * metre

      for (let y = -offset; y < size; y += length * metre) {
        context.fillStyle = shade(color, 1 + (random() - 0.5) * spread)
        context.fillRect(c * w, y, w, length * metre)
        context.fillStyle = seam
        context.fillRect(c * w, y, Math.max(1, size / 512), length * metre)
        context.fillRect(c * w, y, w, Math.max(1, size / 512))
      }
    }
  }

  switch (type) {
    case FLOOR_TYPE.Wood:
      planks(0.2, 1.0, 0.16)
      grain(context, color, size, random)
      break
    case FLOOR_TYPE.Vinyl:
      planks(0.25, 1.0, 0.07)
      break
    case FLOOR_TYPE.Parquet: {
      // A chevron of short blocks: columns of blocks slanting up and down in turn.
      const [column, row] = [0.25 * metre, 0.1 * metre]

      for (let c = 0; c < FLOOR_TILE_METRES / 0.25; c++) {
        const [x, up] = [c * column, c % 2 === 0]

        for (let y = -column; y < size + column; y += row) {
          context.beginPath()
          context.moveTo(x, up ? y + column : y)
          context.lineTo(x + column, up ? y : y + column)
          context.lineTo(x + column, (up ? y : y + column) + row)
          context.lineTo(x, (up ? y + column : y) + row)
          context.closePath()
          context.fillStyle = shade(color, 1 + (random() - 0.5) * 0.18)
          context.fill()
          context.strokeStyle = seam
          context.lineWidth = Math.max(1, size / 512)
          context.stroke()
        }
      }

      break
    }
    case FLOOR_TYPE.Tiles:
    case FLOOR_TYPE.Stone: {
      const [w, h] = type === FLOOR_TYPE.Tiles ? [0.5, 0.5] : [1.0, 0.5]
      const grout = Math.max(1, size / 256)

      for (let y = 0; y < FLOOR_TILE_METRES / h; y++) {
        // Stone slabs are laid in a running bond, each half a slab along from the row before.
        const shift = type === FLOOR_TYPE.Stone && y % 2 ? (w / 2) * metre : 0

        for (let x = -1; x < FLOOR_TILE_METRES / w; x++) {
          context.fillStyle = shade(color, 1 + (random() - 0.5) * (type === FLOOR_TYPE.Stone ? 0.14 : 0.05))
          context.fillRect(x * w * metre + shift, y * h * metre, w * metre, h * metre)
        }
      }

      if (type === FLOOR_TYPE.Stone) {
        speckle(context, color, size, random, 0.5, 2)
      }

      context.fillStyle = type === FLOOR_TYPE.Tiles ? shade(color, 1.18) : seam

      for (let y = 0; y < FLOOR_TILE_METRES / h; y++) {
        const shift = type === FLOOR_TYPE.Stone && y % 2 ? (w / 2) * metre : 0

        context.fillRect(0, y * h * metre, size, grout)

        for (let x = -1; x <= FLOOR_TILE_METRES / w; x++) {
          context.fillRect(x * w * metre + shift, y * h * metre, grout, h * metre)
        }
      }

      break
    }
    case FLOOR_TYPE.Concrete:
      speckle(context, color, size, random, 0.35, 3)
      context.fillStyle = seam
      context.fillRect(0, 0, size, Math.max(1, size / 512))
      break
    case FLOOR_TYPE.Carpet:
      speckle(context, color, size, random, 2, 1)
      break
  }
}

/**
 * Fine lengthwise grain over planks.
 * @param context - Where to paint.
 * @param color - The floor's color.
 * @param size - The tile's size, in pixels.
 * @param random - The seeded random numbers.
 */
function grain(context: CanvasRenderingContext2D, color: string, size: number, random: () => number) {
  context.globalAlpha = 0.18

  for (let i = 0; i < size / 2; i++) {
    context.fillStyle = shade(color, random() > 0.5 ? 0.85 : 1.1)
    context.fillRect(random() * size, random() * size, 1, size / 10 + random() * size / 6)
  }

  context.globalAlpha = 1
}

/**
 * Small dots of lighter and darker color, as in concrete, stone or carpet.
 * @param context - Where to paint.
 * @param color - The floor's color.
 * @param size - The tile's size, in pixels.
 * @param random - The seeded random numbers.
 * @param density - Dots per pixel of the tile's side.
 * @param dot - A dot's size, in pixels.
 */
function speckle(context: CanvasRenderingContext2D, color: string, size: number, random: () => number, density: number, dot: number) {
  context.globalAlpha = 0.35

  for (let i = 0; i < size * size * density / 64; i++) {
    context.fillStyle = shade(color, 0.8 + random() * 0.4)
    context.fillRect(random() * size, random() * size, dot, dot)
  }

  context.globalAlpha = 1
}

/**
 * A color made lighter or darker.
 * @param color - The color, "#RRGGBB".
 * @param factor - Below 1 darkens, above 1 lightens.
 * @returns The color as rgb().
 */
export function shade(color: string, factor: number) {
  const value = parseInt(color.slice(1), 16)
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * factor)))

  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

/**
 * Random numbers that are the same every time for the same seed (mulberry32).
 * @param seed - The seed.
 */
function seeded(seed: number) {
  let state = seed

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
