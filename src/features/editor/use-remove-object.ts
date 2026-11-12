import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { removeRoomObjects } from "@/features/rooms/api"
import type { DetectedObject, Room } from "@/features/rooms/types"
import { errorMessage } from "@/lib/api"
import { useEditorStore } from "./editor-store"
import { MESSAGES, QUERY_KEYS } from "@/lib/constants"

/**
 * Removes objects from the room's photo through the API, one or several together.
 * @param room - The room being edited (Ready).
 * @returns `remove` (resolves to whether it was removed), and whether one is being removed.
 */
export function useRemoveObject(room: Room) {
  const queryClient = useQueryClient()
  const { revision, applyOutlineFix, removing, setRemoving } = useEditorStore()

  /**
   * Removes objects from the photo shown together, as one undo step, and deselects.
   * @param objects - The objects; the first is the one the user picked.
   * @returns Whether they were removed (on failure the user sees why).
   */
  const remove = async (objects: DetectedObject[]): Promise<boolean> => {
    if (revision === null || objects.length === 0 || removing.length > 0) return false
    setRemoving(objects.map((o) => o.label))
    try {
      const updated = await removeRoomObjects(room.id, objects.map((o) => o.index), revision)
      // The editor first, as with outline fixes, so the version sync never sends the old version back.
      applyOutlineFix(updated.labelMapRevision, 0)
      queryClient.setQueryData(QUERY_KEYS.room(room.id), updated)
      toast.success(MESSAGES.objectRemoved(objects[0].label, objects.length - 1))
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    } finally {
      setRemoving([])
    }
  }

  return { remove, removing: removing.length > 0 }
}
