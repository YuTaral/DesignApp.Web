import { BACKSPLASH, BUILDER, FLOOR_TYPE, HARDWARE_NAMES, ITEM_SHAPE, ROOM_TYPE, WALL_FINISH } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { isZoneShape } from "./builder-store"

/**
 * Whether an object is fitted cabinetry (kitchen units and cabinets, an island, a vanity), by its name, as the API
 * decides (Domain Fitted.IsCabinet).
 * @param item - The object.
 */
export function isCabinet(item: Pick<PlanItem, "shape" | "label">) {
  return (item.shape === ITEM_SHAPE.Box || item.shape === ITEM_SHAPE.WallBox) && BUILDER.cabinetWords.test(item.label)
}

/**
 * Whether the room has fitted cabinetry.
 * @param plan - The room.
 */
export function hasCabinets(plan: Pick<Plan, "items">) {
  return plan.items.some(isCabinet)
}

/**
 * Whether the room has cabinets hung on a wall (upper cabinets, a mirror cabinet), which may have glass doors.
 * @param plan - The room.
 */
export function hasUpperCabinets(plan: Pick<Plan, "items">) {
  return plan.items.some((item) => item.shape === ITEM_SHAPE.WallBox && isCabinet(item))
}

/**
 * Whether the room has a kitchen sink unit.
 * @param plan - The room.
 */
export function hasSink(plan: Pick<Plan, "items">) {
  return plan.items.some((item) => item.wall == null && BUILDER.sinkWords.test(item.label))
}

/**
 * Whether the room has a vanity, with its basin.
 * @param plan - The room.
 */
export function hasVanity(plan: Pick<Plan, "items">) {
  return plan.items.some((item) => item.wall == null && BUILDER.vanityWords.test(item.label))
}

/**
 * Whether the room has tiles anywhere: its walls (or one of them), its floor, an area of either, or a backsplash.
 * @param plan - The room.
 */
export function usesTiles(plan: Pick<Plan, "items" | "finish" | "floorType">) {
  const { finish } = plan
  const tiledZone = plan.items.some((item) => isZoneShape(item.shape) && (item.material === FLOOR_TYPE.Tiles || item.material === WALL_FINISH.Tiles))

  return finish.walls === WALL_FINISH.Tiles || finish.ownWalls.some((w) => w.finish === WALL_FINISH.Tiles) || plan.floorType === FLOOR_TYPE.Tiles || tiledZone
    || plan.items.some((item) => item.worktop?.backsplash === BACKSPLASH.Tiles)
}

/**
 * Whether the room's fittings apply: a kitchen or bathroom, or a room with cabinetry or tiles.
 * @param plan - The room.
 */
export function isFitted(plan: Pick<Plan, "items" | "finish" | "floorType" | "roomType">) {
  return plan.roomType === ROOM_TYPE.Kitchen || plan.roomType === ROOM_TYPE.Bathroom || hasCabinets(plan) || usesTiles(plan)
}

/**
 * The color of the room's handles, taps and fittings.
 * @param plan - The room.
 */
export function hardwareColor(plan: Pick<Plan, "finish">) {
  return HARDWARE_NAMES[plan.finish.fittings.hardware].color
}
