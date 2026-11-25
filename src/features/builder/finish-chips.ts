import { WALL_FINISH, WALL_FINISH_NAMES } from "@/lib/constants"

/** The wall finishes as chips (for the room's walls, its accent wall and a wall's areas). */
export const FINISH_CHIPS = Object.values(WALL_FINISH).map((finish) => ({ value: finish, name: WALL_FINISH_NAMES[finish] }))
