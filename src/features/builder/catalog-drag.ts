import type { DragEvent } from "react"

import { BUILDER } from "@/lib/constants"
import type { CatalogObject } from "./api"

/**
 * Starts dragging a catalog object, to drop it on the plan or a wall.
 * @param event - The drag start.
 * @param object - The object.
 */
export function startCatalogDrag(event: DragEvent, object: CatalogObject) {
  event.dataTransfer.setData(BUILDER.dragType, JSON.stringify(object))
}

/**
 * Lets a catalog object be dropped here (any other drag is left alone).
 * @param event - The drag over.
 */
export function allowCatalogDrop(event: DragEvent) {
  if (event.dataTransfer.types.includes(BUILDER.dragType)) {
    event.preventDefault()
  }
}

/**
 * The catalog object a drop carries.
 * @param event - The drop.
 * @returns The object, or `null` for a drop from somewhere else.
 */
export function droppedObject(event: DragEvent): CatalogObject | null {
  const data = event.dataTransfer.getData(BUILDER.dragType)

  return data ? (JSON.parse(data) as CatalogObject) : null
}
