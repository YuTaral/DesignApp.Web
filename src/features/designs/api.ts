import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Edits } from "@/features/editor/editor-store"
import { getJson, sendJson } from "@/lib/api"

/** One recolor in a saved room (mirrors the API's EditRequest). */
export type DesignEdit = {
  /** The object, as in the room's objects and label map. */
  objectIndex: number
  /** The new color as #RRGGBB. */
  color: string
  /** How strongly it is applied, 0..1. */
  strength: number
}

/** One room of a design, with its colors (mirrors the API's DesignRoomResponse). */
export type DesignRoom = {
  roomId: string
  /** The room's photo, for a thumbnail. */
  photoUrl: string
  edits: DesignEdit[]
}

/** A saved design: a name, a description and one or more rooms (mirrors the API's DesignResponse). */
export type Design = {
  id: string
  name: string
  /** Empty when there is none. */
  description: string
  /** ISO 8601. */
  createdAt: string
  /** When the design or one of its rooms last changed (ISO 8601). */
  updatedAt: string
  /** In the order they were added. */
  rooms: DesignRoom[]
}

/** The API's limits (mirror the Design class). */
export const DESIGN_LIMITS = { name: 80, description: 300, rooms: 20 } as const

/** React Query cache keys for designs. */
export const designKeys = {
  /** Key of the account's list of designs. */
  all: ["designs"] as const,
  /** Key of one design by id. */
  detail: (id: string) => ["designs", id] as const,
}

/**
 * The editor's recolors as the API's list, in object order.
 * @param edits - The editor's recolors by object index.
 */
export function toDesignEdits(edits: Edits): DesignEdit[] {
  return Object.entries(edits)
    .map(([index, edit]) => ({ objectIndex: Number(index), color: edit.color, strength: edit.strength }))
    .sort((a, b) => a.objectIndex - b.objectIndex)
}

/**
 * A saved room's recolors as the editor's map.
 * @param edits - The room's recolors.
 */
export function toEditorEdits(edits: DesignEdit[]): Edits {
  return Object.fromEntries(edits.map((e) => [e.objectIndex, { color: e.color, strength: e.strength }]))
}

/**
 * Loads the account's designs, most recently changed first.
 * @param enabled - False while no account is signed in (the API would answer 401).
 */
export function useDesigns(enabled: boolean) {
  return useQuery({
    queryKey: designKeys.all,
    queryFn: ({ signal }) => getJson<Design[]>("/api/designs", signal),
    enabled,
  })
}

/**
 * Loads one design.
 * @param id - The design, or undefined for none (then nothing loads).
 */
export function useDesign(id: string | undefined) {
  return useQuery({
    queryKey: designKeys.detail(id ?? ""),
    queryFn: ({ signal }) => getJson<Design>(`/api/designs/${id}`, signal),
    enabled: id !== undefined,
    retry: false,
  })
}

/** Keeps the cached list and the design itself up to date after a change. */
function useDesignChanged() {
  const queryClient = useQueryClient()
  return (design: Design) => {
    queryClient.setQueryData(designKeys.detail(design.id), design)
    void queryClient.invalidateQueries({ queryKey: designKeys.all, exact: true })
  }
}

/** Creates a design from a room and its colors. */
export function useCreateDesign() {
  const changed = useDesignChanged()
  return useMutation({
    mutationFn: (design: { roomId: string; name: string; description: string; edits: DesignEdit[] }) =>
      sendJson<Design>("POST", "/api/designs", design),
    onSuccess: changed,
  })
}

/** Changes a design's name and description. */
export function useEditDesign() {
  const changed = useDesignChanged()
  return useMutation({
    mutationFn: ({ id, ...details }: { id: string; name: string; description: string }) =>
      sendJson<Design>("PUT", `/api/designs/${id}`, details),
    onSuccess: changed,
  })
}

/** Adds a room to a design, with its colors (none for a room that is still being analyzed). */
export function useAddDesignRoom() {
  const changed = useDesignChanged()
  return useMutation({
    mutationFn: ({ designId, roomId, edits }: { designId: string; roomId: string; edits: DesignEdit[] }) =>
      sendJson<Design>("POST", `/api/designs/${designId}/rooms`, { roomId, edits }),
    onSuccess: changed,
  })
}

/** Saves the colors of one room of a design. */
export function useSaveRoomColors() {
  const changed = useDesignChanged()
  return useMutation({
    mutationFn: ({ designId, roomId, edits }: { designId: string; roomId: string; edits: DesignEdit[] }) =>
      sendJson<Design>("PUT", `/api/designs/${designId}/rooms/${roomId}`, { edits }),
    onSuccess: changed,
  })
}

/** Takes a room out of a design; the API deletes the room. */
export function useRemoveDesignRoom() {
  const changed = useDesignChanged()
  return useMutation({
    mutationFn: ({ designId, roomId }: { designId: string; roomId: string }) =>
      sendJson<Design>("DELETE", `/api/designs/${designId}/rooms/${roomId}`),
    onSuccess: changed,
  })
}

/** Deletes a design with its rooms. */
export function useDeleteDesign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sendJson<void>("DELETE", `/api/designs/${id}`),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: designKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: designKeys.all, exact: true })
    },
  })
}
