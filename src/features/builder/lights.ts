import { BUILDER, ITEM_SHAPE, TIME_OF_DAY, type TimeOfDay } from "@/lib/constants"
import type { PlanItem } from "./api"

/** The shapes that hang from the ceiling. */
const CEILING_SHAPES = new Set<string>([ITEM_SHAPE.PendantLight, ITEM_SHAPE.Spotlight, ITEM_SHAPE.Chandelier, ITEM_SHAPE.CeilingLamp, ITEM_SHAPE.TrackLight])

/**
 * Whether a shape is a light on the ceiling, placed on the plan over whatever stands below (its height is how far down it
 * reaches).
 * @param shape - The shape.
 */
export function isCeilingLight(shape: string) {
  return CEILING_SHAPES.has(shape)
}

/**
 * Whether an object gives light, so it has an On switch (the API's Lights.GivesLight): a lamp, a ceiling light, or
 * anything whose name or decorations name a lamp or a light (a wall sconce, a sideboard with a table lamp, cabinets with
 * under-cabinet lights).
 * @param item - The object.
 */
export function givesLight(item: Pick<PlanItem, "shape" | "label" | "decorations">) {
  return item.shape === ITEM_SHAPE.Lamp || isCeilingLight(item.shape) || BUILDER.lightWords.test(item.label) || (item.decorations ?? []).some((d) => BUILDER.lightWords.test(d))
}

/**
 * Whether a light is on: as switched, or else in the evening (the API's Lights.IsOn).
 * @param item - The object.
 * @param time - When the photo is taken.
 */
export function isLightOn(item: Pick<PlanItem, "shape" | "label" | "decorations" | "lit">, time: TimeOfDay) {
  return givesLight(item) && (item.lit ?? time === TIME_OF_DAY.Evening)
}

/**
 * How many recessed spotlights a spotlights object holds across its width and depth: one every `BUILDER.spotSpacing`,
 * its size spanning the outer ones (the API's Lights.Spots).
 * @param item - The spotlights.
 */
export function spotGrid(item: Pick<PlanItem, "width" | "depth">) {
  return { across: Math.floor(item.width / BUILDER.spotSpacing) + 1, deep: Math.floor(item.depth / BUILDER.spotSpacing) + 1 }
}

/**
 * How many spot heads a track light has along its length (the API's Lights.TrackHeads).
 * @param item - The track light.
 */
export function trackHeads(item: Pick<PlanItem, "width">) {
  return Math.max(1, Math.round(item.width / BUILDER.trackHeadSpacing))
}
