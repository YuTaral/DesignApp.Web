import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Design } from "@/features/designs/api"
import type { Room } from "@/features/rooms/types"
import { getJson, sendJson } from "@/lib/api"
import { API, QUERY_KEYS, type AiMode } from "@/lib/constants"

/** One layout of a sample room: a photo of it, already outlined (mirrors the API's LibraryLayoutResponse). */
export type LibraryLayout = {
  /** Its id inside the room, such as "2". */
  id: string
  /** Relative to the API base URL; pass it through apiUrl(). */
  photoUrl: string
  /** A small copy of the photo (640 px wide) for tiles and lists; relative, like photoUrl. */
  thumbnailUrl: string
  width: number
  height: number
  /** How many objects are outlined in it. */
  objectCount: number
}

/** One room of a sample house, with its layouts (mirrors the API's LibraryRoomResponse). */
export type LibraryRoom = {
  /** Its id inside the house, such as "kitchen". */
  id: string
  title: string
  /** One or more; the first is the default (the whole house uses it). */
  layouts: LibraryLayout[]
}

/** A sample house: one style, every room analyzed ahead of time (mirrors the API's LibraryDesignResponse). */
export type LibraryDesign = {
  /** Such as "minimalist". */
  id: string
  name: string
  style: string
  description: string
  /** Its first six rooms in two rows of three, for the list of houses; relative, like photoUrl. */
  coverUrl: string
  rooms: LibraryRoom[]
}

/**
 * The address with an optional `ai` query.
 * @param path - The API path.
 * @param ai - The AI later steps (removing objects) use, or undefined for the API's default.
 */
function withAi(path: string, ai: AiMode | undefined) {
  return ai ? `${path}?ai=${ai}` : path
}

/** Loads the sample houses. */
export function useLibrary() {
  return useQuery({
    queryKey: QUERY_KEYS.library,
    queryFn: ({ signal }) => getJson<LibraryDesign[]>(API.library, signal),
    staleTime: Infinity, // changes only with a new release
  })
}

/** Copies one layout of a sample room into a room of the visitor, ready at once (no AI runs). */
export function useCopyLibraryRoom() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ designId, roomId, layoutId, ai }: { designId: string; roomId: string; layoutId: string; ai?: AiMode }) => {
      return sendJson<Room>("POST", withAi(API.libraryLayoutCopy(designId, roomId, layoutId), ai))
    },
    onSuccess: (room) => queryClient.setQueryData(QUERY_KEYS.room(room.id), room),
  })
}

/** Copies a whole sample house, each room in its first layout, into a new design of the account. */
export function useCopyLibraryDesign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ designId, ai }: { designId: string; ai?: AiMode }) => {
      return sendJson<Design>("POST", withAi(API.libraryDesignCopy(designId), ai))
    },
    onSuccess: (design) => {
      queryClient.setQueryData(QUERY_KEYS.design(design.id), design)
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.designs, exact: true })
    },
  })
}
