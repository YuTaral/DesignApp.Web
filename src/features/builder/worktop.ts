import { BACKSPLASH, BUILDER, ITEM_SHAPE } from "@/lib/constants"
import type { Plan, PlanItem, Worktop } from "./api"
import { isWallItem } from "./builder-store"
import { fromWall, wallPoint, walls } from "./room-outline"

/**
 * What is behind a kitchen unit, for its backsplash: the wall its back is against (null for a unit standing out in the
 * room), and how high the lowest window behind it starts, in metres (Infinity for none).
 */
export type Behind = { wall: number | null; sill: number }

/** Behind an object standing out in the room: no wall and no window. */
export const OPEN_BEHIND: Behind = { wall: null, sill: Infinity }

/**
 * What is behind a kitchen unit, for its backsplash: the wall its back is against (a unit standing out in the room has
 * no backsplash), and how high the lowest window behind it starts, in metres, so the backsplash stops below its sill. A
 * window is behind the unit when a point of it lies within the unit's width, at its back.
 * @param plan - The room.
 * @param item - The unit.
 */
export function behindUnit(plan: Plan, item: PlanItem): Behind {
  const turn = (item.rotation * Math.PI) / 180
  const [halfWidth, halfDepth] = [item.width / 2, item.depth / 2]
  const reach = BUILDER.scene.worktop.behind * 100
  const against = BUILDER.scene.worktop.against * 100
  // The middle of the unit's back on the plan, as its model is turned.
  const back = { x: item.x + halfDepth * Math.sin(turn), y: item.y - halfDepth * Math.cos(turn) }
  const backing = walls(plan).find((wall) => {
    const { along, away } = fromWall(plan, wall.index, back.x, back.y)

    return along >= 0 && along <= wall.length && Math.abs(away) <= against
  })
  let sill = Infinity

  for (const other of plan.items) {
    if (other.shape !== ITEM_SHAPE.Window || !isWallItem(other)) {
      continue
    }

    // Its middle and points near its two ends.
    for (const share of [-0.45, 0, 0.45]) {
      const at = wallPoint(plan, other.wall, other.x + other.width * share)
      const [dx, dy] = [at.x - item.x, at.y - item.y]
      // The point in the unit's own frame, as its model is turned: across it, and from its middle towards its front.
      const across = dx * Math.cos(turn) + dy * Math.sin(turn)
      const out = -dx * Math.sin(turn) + dy * Math.cos(turn)

      if (Math.abs(across) <= halfWidth && out <= 0 && out >= -halfDepth - reach) {
        sill = Math.min(sill, other.elevation / 100)
      }
    }
  }

  return { wall: backing?.index ?? null, sill }
}

/**
 * How high a unit's backsplash reaches above its worktop, in metres: a low upstand or a full one, stopping below a
 * window's sill; 0 for none (no backsplash, no wall behind, or a window too low).
 * @param worktop - The worktop.
 * @param height - The unit's height, to the top of its worktop, in metres.
 * @param behind - What is behind the unit.
 */
export function splashHeight(worktop: Worktop, height: number, behind: Behind) {
  const T = BUILDER.scene.worktop
  const reach = Math.min(worktop.backsplash === BACKSPLASH.Upstand ? T.upstand : T.splash, behind.sill - height - T.belowSill)

  return behind.wall === null || worktop.backsplash === BACKSPLASH.None ? 0 : Math.max(0, reach)
}

/**
 * Whether a backsplash is in its own color (tiles or glass), not the worktop's.
 * @param worktop - The worktop.
 */
export function ownSplashColor(worktop: Worktop) {
  return worktop.backsplash === BACKSPLASH.Tiles || worktop.backsplash === BACKSPLASH.Glass
}
