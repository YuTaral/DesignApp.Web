import { BUILDER, ITEM_FORM, MOULDING, WAINSCOT, type Moulding } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { isOpeningShape } from "./builder-store"
import { wallLength } from "./room-outline"

/** A band of trim along a wall: what it is, and its bottom, height and depth from the wall, in cm. */
export type TrimBand = { kind: Moulding | "wainscot-cap"; bottom: number; height: number; depth: number }

/**
 * How wide the casing around each door, window and archway is, in cm (none for plain reveals).
 * @param plan - The room.
 */
export function casingWidth(plan: Pick<Plan, "finish">) {
  return BUILDER.scene.trim.casing[plan.finish.details.casing] * 100
}

/**
 * How wide one opening's casing is, in cm: the room's casing width, narrowed next to a corner so it stays on its wall.
 * @param plan - The room.
 * @param item - The door, window or archway (on a wall).
 */
export function casingFor(plan: Pick<Plan, "finish" | "outline">, item: PlanItem) {
  const room = item.wall == null ? 0 : Math.min(item.x - item.width / 2, wallLength(plan, item.wall) - item.x - item.width / 2)

  return Math.max(0, Math.min(casingWidth(plan), room))
}

/**
 * The bands of trim along every wall, in cm, bottom first: a cap on the wainscoting (unless a dado rail is there), the
 * dado rail, the picture rail and the crown, as the room has them.
 * @param plan - The room.
 */
export function trimBands(plan: Pick<Plan, "finish" | "height">): TrimBand[] {
  const { crown, rail } = BUILDER.scene.trim
  const details = plan.finish.details
  const top = plan.height * 100
  const has = (moulding: Moulding) => details.mouldings.includes(moulding)
  const railHeight = rail.height * 100
  const bands: TrimBand[] = []

  if (details.wainscot !== WAINSCOT.None && !has(MOULDING.DadoRail)) {
    bands.push({ kind: "wainscot-cap", bottom: BUILDER.wainscotHeight - railHeight / 2, height: railHeight, depth: rail.depth * 100 })
  }

  if (has(MOULDING.DadoRail)) {
    bands.push({ kind: MOULDING.DadoRail, bottom: BUILDER.wainscotHeight - railHeight / 2, height: railHeight, depth: rail.depth * 100 })
  }

  if (has(MOULDING.PictureRail)) {
    bands.push({ kind: MOULDING.PictureRail, bottom: top - BUILDER.pictureRailDrop - railHeight, height: railHeight, depth: rail.depth * 100 })
  }

  if (has(MOULDING.Crown)) {
    bands.push({ kind: MOULDING.Crown, bottom: top - crown.height * 100, height: crown.height * 100, depth: crown.depth * 100 })
  }

  return bands
}

/**
 * The stretches of a wall that trim between two heights runs along, in cm from its left end: the whole wall, broken
 * where a window, door or archway (with its casing) crosses those heights.
 * @param plan - The room.
 * @param wall - The wall's number.
 * @param bottom - The trim's bottom, in cm above the floor.
 * @param top - The trim's top, in cm above the floor.
 * @returns The stretches as [from, to], left to right.
 */
export function trimRuns(plan: Pick<Plan, "outline" | "items" | "finish">, wall: number, bottom: number, top: number): [number, number][] {
  const length = wallLength(plan, wall)
  const gaps = plan.items
    .filter((item) => item.wall === wall && isOpeningShape(item.shape) && item.elevation < top && item.elevation + item.height > bottom)
    .map((item) => [item.x - item.width / 2 - casingFor(plan, item), item.x + item.width / 2 + casingFor(plan, item)] as const)
    .sort((a, b) => a[0] - b[0])
  const runs: [number, number][] = []
  let from = 0

  for (const [start, end] of [...gaps, [length, length] as const]) {
    if (Math.min(start, length) - from > 1) {
      runs.push([from, Math.min(start, length)])
    }

    from = Math.max(from, end)
  }

  return runs
}

/**
 * The round top of an arched window, archway or niche, in cm: a half circle as wide as it is, kept within its height;
 * 0 for a square one.
 * @param item - The opening or niche.
 */
export function archRadius(item: Pick<PlanItem, "form" | "width" | "height">) {
  return item.form === ITEM_FORM.Arched ? Math.min(item.width / 2, item.height * 0.6) : 0
}

/**
 * An outline with a round top, as an SVG path: from its bottom left, up its side, over the arch and down, in cm with y
 * downwards (as the Wall tab draws).
 * @param left - Its left edge.
 * @param top - Its top.
 * @param width - Its width.
 * @param height - Its height.
 * @param arch - The arch's radius (0 for square corners).
 */
export function archedPath(left: number, top: number, width: number, height: number, arch: number) {
  const bottom = top + height

  if (arch <= 0) {
    return `M${left},${bottom} V${top} H${left + width} V${bottom} Z`
  }

  return `M${left},${bottom} V${top + arch} A${width / 2},${arch} 0 0 1 ${left + width},${top + arch} V${bottom} Z`
}
