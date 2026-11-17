import type { Room } from "@/features/rooms/types"
import { VIEW_CORNER_NAMES } from "@/lib/constants"
import type { Plan, PlanItem, PlanShot } from "./api"
import { wallName } from "./room-outline"

/** One view on the Generate photo screen: its small picture and whatever blocks it. */
export type Picture = { shot: PlanShot; url: string; blocking: PlanItem | null }

/** One photo asked for: being made, made (its room), or failed (why). */
export type Made = { picture: Picture } & ({ state: "making" } | { state: "done"; room: Room } | { state: "failed"; error: string })

/**
 * A view's key, to tell views apart: its wall and where its camera stands.
 * @param shot - The view.
 */
export function keyOf(shot: PlanShot) {
  return `${shot.view}:${shot.corner}`
}

/**
 * A view in words: "Back wall, from the left corner".
 * @param plan - The room.
 * @param shot - The view.
 */
export function viewName(plan: Plan, shot: PlanShot) {
  return `${wallName(plan, shot.view)}, from the ${VIEW_CORNER_NAMES[shot.corner].toLowerCase()}`
}
