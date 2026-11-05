import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Edits } from "@/features/editor/editor-store"
import { getJson, sendJson } from "@/lib/api"

/** One recolor in a saved design (mirrors the API's EditRequest). */
export type DesignEdit = {
  /** The object, as in the room's objects and label map. */
  objectIndex: number
  /** The new color as #RRGGBB. */
  color: string
  /** How strongly it is applied, 0..1. */
  strength: number
}

/** A saved design (mirrors the API's DesignResponse). */
export type Design = {
  id: string
  /** The restyled room. */
  roomId: string
  name: string
  /** When it was last saved (ISO 8601). */
  updatedAt: string
  /** The room's photo, for a thumbnail. */
  photoUrl: string
  edits: DesignEdit[]
}

/** The longest design name the API accepts (mirrors Design.MaxNameLength). */
export const MAX_DESIGN_NAME = 80

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
 * A saved design's recolors as the editor's map.
 * @param edits - The design's recolors.
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
function useDesignSaved() {
  const queryClient = useQueryClient()
  return (design: Design) => {
    queryClient.setQueryData(designKeys.detail(design.id), design)
    void queryClient.invalidateQueries({ queryKey: designKeys.all, exact: true })
  }
}

/** Saves a room's recolors as a new design. */
export function useCreateDesign() {
  const saved = useDesignSaved()
  return useMutation({
    mutationFn: (design: { roomId: string; name: string; edits: DesignEdit[] }) => sendJson<Design>("POST", "/api/designs", design),
    onSuccess: saved,
  })
}

/** Renames a design and replaces its recolors. */
export function useUpdateDesign() {
  const saved = useDesignSaved()
  return useMutation({
    mutationFn: ({ id, ...change }: { id: string; name: string; edits: DesignEdit[] }) =>
      sendJson<Design>("PUT", `/api/designs/${id}`, change),
    onSuccess: saved,
  })
}

/** Deletes a design; the room stays. */
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
