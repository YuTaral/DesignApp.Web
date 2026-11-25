import { FLOOR_TYPE, WALL_FINISH, type WallFinish } from "@/lib/constants"
import type { Plan } from "./api"
import { FLOOR_TILE_METRES, paintFloor, seeded, shade } from "./floor-texture"

/** How many metres of wall one painted tile of a finish covers (the same as a floor's, so tiles match in size). */
export const WALL_TILE_METRES = FLOOR_TILE_METRES

/**
 * What a wall is finished in and its color: its own, or the room's.
 * @param plan - The room.
 * @param wall - The wall's number.
 * @returns The finish and the color.
 */
export function wallSurface(plan: Pick<Plan, "finish" | "wallColor">, wall: number): readonly [WallFinish, string] {
  const own = plan.finish.ownWalls.find((w) => w.wall === wall)

  return own ? [own.finish, own.color] : [plan.finish.walls, plan.wallColor]
}

/** The wall tiles already painted as pictures, by finish and color (the Wall tab redraws its areas on every drag). */
const tileUrls = new Map<string, string>()

/**
 * One tile of a wall finish as a picture (a PNG data URL), for the Wall tab's pattern; painted once per finish and color.
 * @param finish - The finish (not Paint).
 * @param color - The wall's color.
 * @param size - The tile's size, in pixels.
 */
export function wallTileUrl(finish: WallFinish, color: string, size = 256) {
  const key = `${finish}:${color}:${size}`
  const kept = tileUrls.get(key)

  if (kept) {
    return kept
  }

  const canvas = document.createElement("canvas")

  canvas.width = canvas.height = size
  paintWall(canvas.getContext("2d")!, finish, color, size)
  const url = canvas.toDataURL("image/png")

  tileUrls.set(key, url)

  return url
}

/**
 * Paints one square tile of a wall finish in its color: wallpaper stripes, mottled limewash, a running bond of bricks,
 * vertical wooden panels, tiles or concrete (the last two as the floor's). Plain paint needs no tile. The same seed
 * always paints the same tile, so the 3D view (and the photo's guide) never changes between draws.
 * @param context - Where to paint.
 * @param finish - The finish (not Paint).
 * @param color - The wall's color, "#RRGGBB".
 * @param size - The tile's size, in pixels.
 */
export function paintWall(context: CanvasRenderingContext2D, finish: WallFinish, color: string, size: number) {
  const random = seeded(11)
  const metre = size / WALL_TILE_METRES
  const line = Math.max(1, size / 256)

  context.fillStyle = color
  context.fillRect(0, 0, size, size)

  switch (finish) {
    case WALL_FINISH.Tiles:
      paintFloor(context, FLOOR_TYPE.Tiles, color, size)
      break
    case WALL_FINISH.Concrete:
      paintFloor(context, FLOOR_TYPE.Concrete, color, size)
      break
    case WALL_FINISH.Plaster: {
      // Large, soft, faint clouds a little lighter and darker than the wall: limewash's gentle mottling.
      context.globalAlpha = 0.08

      for (let i = 0; i < 90; i++) {
        const radius = (0.15 + random() * 0.35) * metre

        context.fillStyle = shade(color, random() > 0.5 ? 0.9 : 1.1)
        context.beginPath()
        context.arc(random() * size, random() * size, radius, 0, Math.PI * 2)
        context.fill()
      }

      context.globalAlpha = 1
      break
    }
    case WALL_FINISH.Wallpaper: {
      // Fine stripes, every 10 cm, a little lighter than the paper.
      context.fillStyle = shade(color, 1.1)

      for (let x = 0; x < size; x += 0.1 * metre) {
        context.fillRect(x, 0, 0.035 * metre, size)
      }

      break
    }
    case WALL_FINISH.WoodPanelling: {
      // Vertical boards, 12 cm wide, each a slightly different tone, with a dark seam between them.
      const board = 0.12 * metre

      for (let x = 0; x < size; x += board) {
        context.fillStyle = shade(color, 1 + (random() - 0.5) * 0.14)
        context.fillRect(x, 0, board, size)
        context.fillStyle = shade(color, 0.7)
        context.fillRect(x, 0, line, size)
      }

      break
    }
    case WALL_FINISH.Brick: {
      // A running bond of 21.5 × 6.5 cm bricks in 1 cm of lighter mortar, each row half a brick along from the last.
      const [brick, course] = [0.225 * metre, 0.075 * metre]

      context.fillStyle = shade(color, 1.45)
      context.fillRect(0, 0, size, size)

      for (let row = 0; row * course < size; row++) {
        const shift = row % 2 ? brick / 2 : 0

        for (let x = -brick; x < size + brick; x += brick) {
          context.fillStyle = shade(color, 1 + (random() - 0.5) * 0.22)
          context.fillRect(x + shift, row * course, brick - 0.01 * metre, course - 0.01 * metre)
        }
      }

      break
    }
  }
}
