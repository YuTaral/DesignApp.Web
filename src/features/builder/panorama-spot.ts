import { ITEM_SHAPE, PANORAMA } from "@/lib/constants"
import type { OutlinePoint, Plan } from "./api"
import { isWallItem, isZoneShape } from "./builder-store"
import { isCeilingLight } from "./lights"
import { contains, extent } from "./room-outline"

/**
 * Where the 360° camera stands: a point inside the walls, at least `PANORAMA.wallGap` from them, that keeps furthest
 * from every object standing on the floor (rugs aside, as one stands on them), up to `PANORAMA.enoughClear`, and among
 * equally clear points the one nearest the room's middle.
 * @param plan - The room.
 * @returns The spot, in cm on the plan.
 */
export function panoramaSpot(plan: Pick<Plan, "outline" | "items">): OutlinePoint {
  const { width, length } = extent(plan)
  const footprints = plan.items
    .filter((item) => !isWallItem(item) && item.shape !== ITEM_SHAPE.Rug && !isZoneShape(item.shape) && !isCeilingLight(item.shape))
    .map((item) => {
      const turned = item.rotation % 180 !== 0
      const [w, d] = turned ? [item.depth, item.width] : [item.width, item.depth]

      return { left: item.x - w / 2, top: item.y - d / 2, right: item.x + w / 2, bottom: item.y + d / 2 }
    })
  let best: { x: number; y: number; score: number } | null = null

  for (let x = PANORAMA.wallGap; x <= width - PANORAMA.wallGap; x += PANORAMA.spotStep) {
    for (let y = PANORAMA.wallGap; y <= length - PANORAMA.wallGap; y += PANORAMA.spotStep) {
      if (!contains(plan, x, y) || !contains(plan, x - PANORAMA.wallGap, y) || !contains(plan, x + PANORAMA.wallGap, y) || !contains(plan, x, y - PANORAMA.wallGap) || !contains(plan, x, y + PANORAMA.wallGap)) {
        continue
      }

      const clear = Math.min(
        PANORAMA.enoughClear,
        ...footprints.map((f) => Math.hypot(Math.max(f.left - x, 0, x - f.right), Math.max(f.top - y, 0, y - f.bottom)))
      )
      const score = clear - PANORAMA.middlePull * Math.hypot(x - width / 2, y - length / 2)

      if (!best || score > best.score) {
        best = { x, y, score }
      }
    }
  }

  return best ? { x: best.x, y: best.y } : { x: width / 2, y: length / 2 }
}

/**
 * Which way a 360° view starts, in degrees from its middle (the back wall; right is positive): towards most of the
 * room's furniture as seen from the spot, each object counting by its size and less the further it is off the view's
 * centre. It stays within `PANORAMA.maxStartYaw`, so the first view keeps clear of the seam behind.
 * @param plan - The room.
 * @param spot - Where the camera stands, in cm on the plan.
 */
export function panoramaStartYaw(plan: Pick<Plan, "items">, spot: OutlinePoint) {
  const objects = plan.items
    .filter((item) => !isWallItem(item) && item.shape !== ITEM_SHAPE.Rug && !isZoneShape(item.shape) && !isCeilingLight(item.shape))
    .map((item) => ({ yaw: (Math.atan2(item.x - spot.x, spot.y - item.y) * 180) / Math.PI, size: item.width * item.depth }))
  let best = { yaw: 0, score: -1 }

  for (let yaw = -PANORAMA.maxStartYaw; yaw <= PANORAMA.maxStartYaw; yaw += PANORAMA.startStep) {
    const score = objects.reduce((sum, object) => {
      const off = Math.abs(((object.yaw - yaw + 540) % 360) - 180)

      return sum + (off < PANORAMA.startReach ? object.size * Math.cos((off / PANORAMA.startReach) * (Math.PI / 2)) : 0)
    }, 0)

    // Ties keep the start nearest the middle.
    if (score > best.score + 1e-6 || (Math.abs(score - best.score) <= 1e-6 && Math.abs(yaw) < Math.abs(best.yaw))) {
      best = { yaw, score }
    }
  }

  return best.yaw
}
