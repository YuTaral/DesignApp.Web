import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Edits, ObjectEdit, SurfaceSizes, ToneEdit } from "@/features/editor/editor-store"
import { getJson, sendJson } from "@/lib/api"
import { API, QUERY_KEYS } from "@/lib/constants"

/** One recolor in a saved room (mirrors the API's EditRequest). */
export type DesignEdit = {
  /** The object, as in the room's objects and label map. */
  objectIndex: number
  /** The new color as #RRGGBB. */
  color: string
  /** How strongly it is applied, 0..1. */
  strength: number
  /** The real paint the color is, such as "ral-classic/9010"; null or missing for a free color. */
  paint?: string | null
  /** The tones of an object split by color (bricks and mortar); null or missing for one color. */
  tones?: DesignTone[] | null
}

/** One tone of a split object in a saved room (mirrors the API's ToneRequest). */
export type DesignTone = {
  /** The tone's original color as #RRGGBB. */
  center: string
  /** How much of the object it covers, 0..1. */
  share: number
  /** Its new color as #RRGGBB; null or missing to keep it. */
  color?: string | null
  /** How strongly it is applied, 0..1. */
  strength: number
  /** The real paint the color is; null or missing for a free color or none. */
  paint?: string | null
}

/** The size of a wall, floor or ceiling in a saved room, in metres (mirrors the API's SizeRequest). */
export type DesignSize = {
  objectIndex: number
  width: number
  /** A wall's height, or a floor's or ceiling's length. */
  height: number
}

/** One room of a design, with its colors (mirrors the API's DesignRoomResponse). */
export type DesignRoom = {
  roomId: string
  /** The room's photo, for a thumbnail. */
  photoUrl: string
  edits: DesignEdit[]
  /** The sizes the user gave its surfaces, for paint amounts. */
  sizes: DesignSize[]
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

/**
 * The editor's recolors as the API's list, in object order.
 * @param edits - The editor's recolors by object index.
 */
export function toDesignEdits(edits: Edits): DesignEdit[] {
  return Object.entries(edits)
    .map(([index, edit]) => ({ objectIndex: Number(index), color: edit.color, strength: edit.strength, paint: edit.paint, tones: edit.tones?.map((t) => ({ ...t })) }))
    .sort((a, b) => a.objectIndex - b.objectIndex)
}

/**
 * The editor's surface sizes as the API's list, in object order.
 * @param sizes - The sizes by object index.
 */
export function toDesignSizes(sizes: SurfaceSizes): DesignSize[] {
  return Object.entries(sizes)
    .map(([index, size]) => ({ objectIndex: Number(index), width: size.width, height: size.height }))
    .sort((a, b) => a.objectIndex - b.objectIndex)
}

/**
 * A saved room's surface sizes as the editor's map.
 * @param sizes - The room's sizes (missing from designs saved before sizes).
 */
export function toEditorSizes(sizes: DesignSize[] | undefined): SurfaceSizes {
  return Object.fromEntries((sizes ?? []).map((s) => [s.objectIndex, { width: s.width, height: s.height }]))
}

/**
 * A saved room's recolors as the editor's map.
 * @param edits - The room's recolors.
 */
export function toEditorEdits(edits: DesignEdit[]): Edits {
  return Object.fromEntries(edits.map((e) => [e.objectIndex, toEditorEdit(e)]))
}

/**
 * One saved recolor as the editor's, leaving out the fields a saved one doesn't have (so comparisons see no change).
 * @param e - The saved recolor.
 */
function toEditorEdit(e: DesignEdit): ObjectEdit {
  const edit: ObjectEdit = e.paint ? { color: e.color, strength: e.strength, paint: e.paint } : { color: e.color, strength: e.strength }

  if (!e.tones?.length) {
    return edit
  }

  const tones = e.tones.map((t): ToneEdit => {
    const tone: ToneEdit = { center: t.center, share: t.share, strength: t.strength }

    if (t.color) {
      tone.color = t.color
    }

    if (t.paint) {
      tone.paint = t.paint
    }

    return tone
  })

  return { ...edit, tones }
}

/**
 * Loads the account's designs, most recently changed first.
 * @param enabled - False while no account is signed in (the API would answer 401).
 */
export function useDesigns(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.designs,
    queryFn: ({ signal }) => getJson<Design[]>(API.designs, signal),
    enabled,
  })
}

/**
 * Loads one design.
 * @param id - The design, or undefined for none (then nothing loads).
 */
export function useDesign(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.design(id ?? ""),
    queryFn: ({ signal }) => getJson<Design>(API.design(id ?? ""), signal),
    enabled: id !== undefined,
    retry: false,
  })
}

/** Keeps the cached list and the design itself up to date after a change. */
function useDesignChanged() {
  const queryClient = useQueryClient()

  return (design: Design) => {
    queryClient.setQueryData(QUERY_KEYS.design(design.id), design)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.designs, exact: true })
  }
}

/** Creates a design from a room and its colors. */
export function useCreateDesign() {
  const changed = useDesignChanged()

  return useMutation({
    mutationFn: (design: { roomId: string; name: string; description: string; edits: DesignEdit[]; sizes: DesignSize[] }) => {
      return sendJson<Design>("POST", API.designs, design)
    },
    onSuccess: changed,
  })
}

/** Changes a design's name and description. */
export function useEditDesign() {
  const changed = useDesignChanged()

  return useMutation({
    mutationFn: ({ id, ...details }: { id: string; name: string; description: string }) => {
      return sendJson<Design>("PUT", API.design(id), details)
    },
    onSuccess: changed,
  })
}

/** Adds a room to a design, with its colors and sizes (none for a room that is still being analyzed). */
export function useAddDesignRoom() {
  const changed = useDesignChanged()

  return useMutation({
    mutationFn: ({ designId, roomId, edits, sizes }: { designId: string; roomId: string; edits: DesignEdit[]; sizes?: DesignSize[] }) => {
      return sendJson<Design>("POST", API.designRooms(designId), { roomId, edits, sizes: sizes ?? [] })
    },
    onSuccess: changed,
  })
}

/** Saves the colors and surface sizes of one room of a design. */
export function useSaveRoomColors() {
  const changed = useDesignChanged()

  return useMutation({
    mutationFn: ({ designId, roomId, edits, sizes }: { designId: string; roomId: string; edits: DesignEdit[]; sizes: DesignSize[] }) => {
      return sendJson<Design>("PUT", API.designRoom(designId, roomId), { edits, sizes })
    },
    onSuccess: changed,
  })
}

/** Takes a room out of a design; the API deletes the room. */
export function useRemoveDesignRoom() {
  const changed = useDesignChanged()

  return useMutation({
    mutationFn: ({ designId, roomId }: { designId: string; roomId: string }) => {
      return sendJson<Design>("DELETE", API.designRoom(designId, roomId))
    },
    onSuccess: changed,
  })
}

/** Deletes a design with its rooms. */
export function useDeleteDesign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => sendJson<void>("DELETE", API.design(id)),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: QUERY_KEYS.design(id) })
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.designs, exact: true })
    },
  })
}
