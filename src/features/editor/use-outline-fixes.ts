import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { saveOutlineStroke, selectLabelMapRevision } from "@/features/rooms/api"
import type { Room } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import type { StrokePoint } from "./brush"
import { useEditorStore } from "./editor-store"
import { type OutlineBrushMode, QUERY_KEYS, type StrokeShape } from "@/lib/constants"

/** A finished brush stroke, ready to save. */
export type FinishedStroke = {
  mode: OutlineBrushMode
  /** Brush along the path, or a box's or lasso's area. */
  shape: StrokeShape
  /** The brush radius, in label map pixels. */
  radius: number
  points: StrokePoint[]
}

/**
 * Saves brush strokes to the API and keeps the API's current label map version in step with the
 * editor's undo and redo.
 * @param room - The room being edited (Ready).
 * @param options.sync - False for a second view of the room (the Parts dialog): it only saves strokes, and leaves
 *   keeping the API's version in step to the editor.
 * @returns `save` for the canvas's strokes (resolves to whether it was saved), and whether one is saving.
 */
export function useOutlineFixes(room: Room, { sync = true }: { sync?: boolean } = {}) {
  const queryClient = useQueryClient()
  const { revision, selected, setBaseRevision, applyOutlineFix } = useEditorStore()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (sync) setBaseRevision(room.labelMapRevision)
  }, [sync, room.labelMapRevision, setBaseRevision])

  // Undo or redo across a stroke shows another version; tell the API, so a reload shows the same outlines.
  useEffect(() => {
    if (!sync || revision === null || revision === room.labelMapRevision) return
    selectLabelMapRevision(room.id, revision)
      .then((updated) => queryClient.setQueryData(QUERY_KEYS.room(room.id), updated))
      .catch((error: unknown) => toast.error(errorMessage(error)))
  }, [sync, revision, room.id, room.labelMapRevision, queryClient])

  /**
   * Saves a stroke on the selected object as a new label map version.
   * @param stroke - The stroke.
   * @returns Whether it was saved (on failure the user sees why, and the canvas undoes its preview).
   */
  const save = async (stroke: FinishedStroke): Promise<boolean> => {
    if (!selected || revision === null) return false
    setSaving(true)
    try {
      const updated = await saveOutlineStroke(room.id, { baseRevision: revision, objectIndex: selected, ...stroke })
      // The editor first: if a render came between the two, the sync above would only repeat the
      // new version to the API, never send back the old one.
      applyOutlineFix(updated.labelMapRevision)
      queryClient.setQueryData(QUERY_KEYS.room(room.id), updated)
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    } finally {
      setSaving(false)
    }
  }

  return { save, saving }
}
