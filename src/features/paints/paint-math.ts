import { hexToOklab } from "@/features/editor/oklab"
import { PAINT, PAINTABLE_CATEGORIES, type ObjectCategory } from "@/lib/constants"
import type { Paint } from "./api"

/** What the paint list needs to know to work out amounts. */
export type PaintSettings = {
  /** How many coats. */
  coats: number
  /** Square metres one litre covers, for one coat. */
  coverage: number
}

/**
 * Whether the paint list covers objects of a category: walls and ceilings.
 * @param category - The object's category.
 */
export function isPaintable(category: ObjectCategory) {
  return PAINTABLE_CATEGORIES.includes(category)
}

/**
 * The litres of paint a surface needs, with a little to spare.
 * @param area - The area, in square metres.
 * @param settings - The coats and the coverage.
 */
export function litresFor(area: number, { coats, coverage }: PaintSettings) {
  return (area * coats * (1 + PAINT.spare)) / coverage
}

/**
 * The tins to buy for an amount: the least paint left over, then the fewest tins. Returns each tin size with how many,
 * largest first, such as [{ litres: 5, count: 1 }, { litres: 2.5, count: 1 }].
 * @param litres - How much paint is needed.
 * @param sizes - The tin sizes, in litres (multiples of half a litre).
 */
export function tinsFor(litres: number, sizes: readonly number[] = PAINT.tins) {
  if (litres <= 0) {
    return []
  }

  // Work in half litres, so every tin is a whole number of units.
  const units = sizes.map((size) => Math.round(size * 2))
  const target = Math.ceil(litres * 2 - 1e-9)
  const limit = target + Math.max(...units)
  // fewest[t]: the fewest tins that hold exactly t units, and the last tin added to get there.
  const fewest: { count: number; last: number }[] = [{ count: 0, last: -1 }]
  const counts = new Map<number, number>()

  for (let total = 1; total <= limit; total++) {
    let best = { count: Infinity, last: -1 }

    units.forEach((unit, i) => {
      const before = fewest[total - unit]

      if (total >= unit && before && before.count + 1 < best.count) {
        best = { count: before.count + 1, last: i }
      }
    })
    fewest[total] = best
  }

  let total = target

  while (!Number.isFinite(fewest[total].count)) {
    total++
  }

  for (let t = total; t > 0; t -= units[fewest[t].last]) {
    const size = sizes[fewest[t].last]

    counts.set(size, (counts.get(size) ?? 0) + 1)
  }

  return [...counts].map(([size, count]) => ({ litres: size, count })).sort((a, b) => b.litres - a.litres)
}

/**
 * Tins as text, such as "1 × 5 L + 1 × 2.5 L".
 * @param tins - The tins from tinsFor.
 */
export function formatTins(tins: { litres: number; count: number }[]) {
  return tins.map((tin) => `${tin.count} × ${formatNumber(tin.litres)} L`).join(" + ")
}

/**
 * A number with at most one decimal, without a trailing ".0".
 * @param value - The number.
 */
export function formatNumber(value: number) {
  return (Math.round(value * 10) / 10).toString()
}

/**
 * The paint closest to a color, by distance in OKLab (how different two colors look).
 * @param hex - The color, "#RRGGBB".
 * @param paints - The paints to choose from.
 * @returns The closest paint, or undefined when there are none.
 */
export function closestPaint(hex: string, paints: readonly Paint[]) {
  const target = hexToOklab(hex)
  let best: Paint | undefined
  let bestDistance = Infinity

  for (const paint of paints) {
    const color = hexToOklab(paint.color)
    const distance = (color.l - target.l) ** 2 + (color.a - target.a) ** 2 + (color.b - target.b) ** 2

    if (distance < bestDistance) {
      [best, bestDistance] = [paint, distance]
    }
  }

  return best
}

/**
 * Whether a paint matches a search: its code ("9010", "RAL 9010") or a word of its name ("white").
 * @param paint - The paint.
 * @param query - What the user typed.
 */
export function matchesPaint(paint: Paint, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const text = `${paint.code} ${paint.name}`.toLowerCase()

  return words.every((word) => text.includes(word))
}
