import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { findRoomParts } from "@/features/rooms/api"
import type { DetectedObject, Room } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import { useEditorStore } from "./editor-store"
import { MESSAGES, QUERY_KEYS } from "@/lib/constants"

/**
 * Asks the room's AI for the parts of an object (a chair's seat, backrest and legs): they become parts of it in a new
 * label map version, as one undo step, and the first one is selected.
 * @param room - The room being edited (Ready).
 * @returns `find` (resolves to whether parts were found), and whether it is looking.
 */
export function useFindParts(room: Room) {
  const queryClient = useQueryClient()
  const { revision, applyOutlineFix } = useEditorStore()
  const [finding, setFinding] = useState(false)

  /**
   * Finds the object's parts.
   * @param whole - The object.
   * @param instructions - The user's own words for the AI on which parts to find.
   * @returns Whether parts were found (otherwise the user sees why).
   */
  const find = async (whole: DetectedObject, instructions?: string): Promise<boolean> => {
    if (revision === null) {
      return false
    }

    setFinding(true)

    try {
      const updated = await findRoomParts(room.id, whole.index, revision, instructions)
      const known = new Set(room.objects.map((o) => o.index))
      const parts = updated.objects.filter((o) => !known.has(o.index))

      // The editor first, as with outline fixes, so the version sync never sends the old version back.
      applyOutlineFix(updated.labelMapRevision, parts[0]?.index ?? whole.index)
      queryClient.setQueryData(QUERY_KEYS.room(room.id), updated)
      toast.success(MESSAGES.partsFound(parts.length, whole.label))

      return true
    } catch (error) {
      toast.error(errorMessage(error))

      return false
    } finally {
      setFinding(false)
    }
  }

  return { find, finding }
}
