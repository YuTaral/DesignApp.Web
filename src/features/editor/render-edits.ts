import type { Edits } from "./editor-store"
import { hexToOklab } from "./oklab"
import type { RenderEdit } from "./renderer"
import type { DetectedObject } from "@/features/rooms/types"

/**
 * The recolors in the shader's terms: each object's target color and its original main color.
 * @param objects - The room's objects.
 * @param edits - The recolors by object index.
 */
export function toRenderEdits(objects: DetectedObject[], edits: Edits): Map<number, RenderEdit> {
  const byIndex = new Map(objects.map((o) => [o.index, o]))
  const result = new Map<number, RenderEdit>()
  for (const [index, edit] of Object.entries(edits)) {
    const object = byIndex.get(Number(index))
    if (object) result.set(object.index, { target: hexToOklab(edit.color), source: hexToOklab(object.dominantColor), strength: edit.strength })
  }
  return result
}
