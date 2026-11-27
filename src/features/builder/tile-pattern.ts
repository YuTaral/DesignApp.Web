import { TILE_PATTERN, type TilePattern } from "@/lib/constants"

/** One tile laid on the painted square: where it is and its size, in metres. */
type Laid = { x: number; y: number; w: number; h: number }

/**
 * Paints tiles laid in a pattern (other than the plain grid) on one square texture tile that repeats seamlessly: subway
 * tiles in a brick bond, herringbone, long tiles stacked vertically, or large-format tiles. Each tile is a little
 * lighter or darker than the next, on grout a little lighter than the tiles; tiles crossing an edge wrap round, so the
 * square repeats without a seam.
 * @param context - Where to paint.
 * @param color - The tiles' color, "#RRGGBB".
 * @param size - The square's size, in pixels.
 * @param metres - How many metres the square covers.
 * @param pattern - How the tiles are laid.
 * @param random - The painter's seeded random numbers (the same tile every time).
 * @param shade - Lightens (above 1) or darkens a color.
 */
export function paintTilePattern(
  context: CanvasRenderingContext2D,
  color: string,
  size: number,
  metres: number,
  pattern: TilePattern,
  random: () => number,
  shade: (color: string, factor: number) => string
) {
  const metre = size / metres
  const grout = Math.max(1, size / 256)
  const laid = layout(pattern, metres)

  context.fillStyle = shade(color, 1.18)
  context.fillRect(0, 0, size, size)

  for (const tile of laid) {
    context.fillStyle = shade(color, 1 + (random() - 0.5) * 0.06)

    // Each tile at its place and, where it crosses an edge, again one square over, so the square repeats seamlessly.
    for (const dx of [0, -metres, metres]) {
      for (const dy of [0, -metres, metres]) {
        const [x, y] = [(tile.x + dx) * metre, (tile.y + dy) * metre]

        if (x < size && y < size && x + tile.w * metre > 0 && y + tile.h * metre > 0) {
          context.fillRect(x + grout / 2, y + grout / 2, tile.w * metre - grout, tile.h * metre - grout)
        }
      }
    }
  }
}

/**
 * Where the tiles of a pattern lie on a square of a size (in metres), each counted once: rows of 25 × 8.3 cm subway
 * tiles each shifted half a tile; herringbone of 25 × 12.5 cm tiles, each pair a step along a diagonal staircase
 * (horizontal, then vertical above it) and the staircases two steps apart; 8.3 × 25 cm tiles stacked straight; or
 * 67 × 100 cm large tiles in a grid.
 * @param pattern - How the tiles are laid.
 * @param metres - The square's size (a multiple of the tiles, so it repeats).
 */
function layout(pattern: TilePattern, metres: number): Laid[] {
  const tiles: Laid[] = []

  switch (pattern) {
    case TILE_PATTERN.Subway: {
      const [w, h] = [metres / 8, metres / 24]

      for (let row = 0; row < 24; row++) {
        for (let col = 0; col < 8; col++) {
          tiles.push({ x: col * w + (row % 2 ? w / 2 : 0), y: row * h, w, h })
        }
      }

      break
    }
    case TILE_PATTERN.Herringbone: {
      const s = metres / 16

      // n steps up each staircase (16 make the square), j staircases across (4 make it).
      for (let n = 0; n < 16; n++) {
        for (let j = 0; j < 4; j++) {
          const [x, y] = [(n + 2 * j) * s, (n - 2 * j) * s]
          const wrap = (value: number) => ((value % metres) + metres) % metres

          tiles.push({ x: wrap(x), y: wrap(y), w: 2 * s, h: s }, { x: wrap(x), y: wrap(y + s), w: s, h: 2 * s })
        }
      }

      break
    }
    case TILE_PATTERN.VerticalStack: {
      const [w, h] = [metres / 24, metres / 8]

      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 24; col++) {
          tiles.push({ x: col * w, y: row * h, w, h })
        }
      }

      break
    }
    default: {
      const [w, h] = [metres / 3, metres / 2]

      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          tiles.push({ x: col * w, y: row * h, w, h })
        }
      }
    }
  }

  return tiles
}
