import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { mergeRoomPart } from "@/features/rooms/api"
import type { DetectedObject, Room } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import { useEditorStore } from "./editor-store"
import { MESSAGES, QUERY_KEYS } from "@/lib/constants"

/**
 * Merges a part (a chair's seat) back into the object it is a part of: its pixels become the object's again, as one
 * undo step, and the object is selected.
 * @param room - The room being edited (Ready).
 * @returns `merge` (resolves to whether it was merged), and whether it is merging.
 */
export function useMergePart(room: Room) {
  const queryClient = useQueryClient()
  const { revision, applyOutlineFix } = useEditorStore()
  const [merging, setMerging] = useState(false)

  /**
   * Merges the part.
   * @param part - The part.
   * @returns Whether it was merged (on failure the user sees why).
   */
  const merge = async (part: DetectedObject): Promise<boolean> => {
    const parent = room.objects.find((o) => o.index === part.parentIndex)
    if (revision === null || !parent) return false
    setMerging(true)
    try {
      const updated = await mergeRoomPart(room.id, part.index, revision)
      // The editor first, as with outline fixes, so the version sync never sends the old version back.
      applyOutlineFix(updated.labelMapRevision, parent.index)
      queryClient.setQueryData(QUERY_KEYS.room(room.id), updated)
      toast.success(MESSAGES.partMerged(part.label, parent.label))
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    } finally {
      setMerging(false)
    }
  }

  return { merge, merging }
}
