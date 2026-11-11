import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { addRoomObject } from "@/features/rooms/api"
import type { Room } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import { useEditorStore } from "./editor-store"
import { type ObjectCategory, QUERY_KEYS } from "@/lib/constants"

/**
 * Saves the object the user is marking by hand as a new object of the room.
 * @param room - The room being edited (Ready).
 * @returns `save` (resolves to whether it was saved), and whether it is saving.
 */
export function useNewObject(room: Room) {
  const queryClient = useQueryClient()
  const { revision, markStrokes, applyOutlineFix, stopMarking } = useEditorStore()
  const [saving, setSaving] = useState(false)

  /**
   * Saves the mark as a new object, then selects it and ends marking: one undo step.
   * @param label - Its name.
   * @param category - Its type.
   * @returns Whether it was saved (on failure the user sees why, and the mark stays).
   */
  const save = async (label: string, category: ObjectCategory): Promise<boolean> => {
    if (revision === null || markStrokes.length === 0) return false
    setSaving(true)
    try {
      const updated = await addRoomObject(room.id, { baseRevision: revision, label, category, strokes: markStrokes })
      const known = new Set(room.objects.map((o) => o.index))
      const added = updated.objects.find((o) => !known.has(o.index))
      // The editor first, as with outline fixes, so the version sync never sends the old version back.
      applyOutlineFix(updated.labelMapRevision, added?.index)
      stopMarking()
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
