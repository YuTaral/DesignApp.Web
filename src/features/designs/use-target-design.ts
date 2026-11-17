import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { useAccount } from "@/features/account/api"
import { useAddDesignRoom, useDesign } from "@/features/designs/api"
import { errorMessage } from "@/lib/api"
import { ROUTES } from "@/lib/constants"

/**
 * The design a new room goes into (`?design=`, from Add room on a design's page), and how to open a new room.
 * @param designId - The `?design=` id, if any; it counts only for a signed-in account.
 * @returns `signedIn`; `target`, the design, once loaded; `openRoom`, which adds a new room to the target (when there
 * is one) and opens it in the editor, opening it on its own when adding fails; and `adding`, while it is being added.
 */
export function useTargetDesign(designId: string | undefined) {
  const navigate = useNavigate()
  const signedIn = useAccount().data?.signedIn === true
  const target = useDesign(signedIn ? designId : undefined).data
  const addRoom = useAddDesignRoom()

  const openRoom = async (roomId: string) => {
    if (target) {
      try {
        await addRoom.mutateAsync({ designId: target.id, roomId, edits: [] })
        void navigate({ to: ROUTES.room, params: { roomId }, search: { design: target.id } })

        return
      } catch (error) {
        toast.error(errorMessage(error))
      }
    }

    void navigate({ to: ROUTES.room, params: { roomId }, search: {} })
  }

  return { signedIn, target, openRoom, adding: addRoom.isPending }
}
