import { useQuery } from "@tanstack/react-query"

import { ApiError, apiUrl, getJson, sendJson, toApiError } from "@/lib/api"
import { isAnalysisFinished, type Room } from "./types"
import { type AiMode, type AnalysisScope, API, HTTP_STATUS, LIMITS, MESSAGES, MIME, type ObjectCategory, type OutlineBrushMode, QUERY_KEYS, type StrokeShape, TIMINGS, UPLOAD_FIELDS } from "@/lib/constants"

/** Which AI uploads use, and whether each upload may choose (mirrors AiAvailabilityResponse). */
export type AiAvailability = {
  /** The AI an upload gets when it doesn't choose. */
  default: AiMode
  /** Whether the fake/real switch is shown (Development only). */
  canChoose: boolean
  /** Whether the real AI's keys are set. */
  realAvailable: boolean
}

/** Loads which AI uploads can use; it doesn't change while the API runs. */
export function useAiAvailability() {
  return useQuery({
    queryKey: QUERY_KEYS.ai,
    queryFn: ({ signal }) => getJson<AiAvailability>(API.ai, signal),
    staleTime: Infinity,
  })
}

/**
 * Loads a room from the API and caches it. A 404 is not retried. While the analysis runs it also
 * re-checks every few seconds, a fallback for when live updates ({@link useLiveRoom}) can't connect.
 * @param id - The room's id.
 */
export function useRoom(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.room(id),
    queryFn: ({ signal }) => getJson<Room>(API.room(id), signal),
    // A missing room won't appear by asking again.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === HTTP_STATUS.notFound) && failureCount < LIMITS.roomRetries,
    refetchInterval: (query) => (query.state.data && !isAnalysisFinished(query.state.data.status) ? TIMINGS.roomPollMs : false),
  })
}

/** Options for {@link uploadRoom}. */
type UploadOptions = {
  /** Called with 0..1 as the photo uploads. */
  onProgress?: (fraction: number) => void
  /** Aborting it cancels the upload. */
  signal?: AbortSignal
  /** What the AI should look for; the whole room when missing. */
  scope?: AnalysisScope
  /** Which AI analyzes the photo; the API's default when missing. */
  ai?: AiMode
}

/**
 * Uploads a room photo and creates a room for it.
 * Uses XMLHttpRequest rather than fetch, because fetch can't report upload progress.
 * @param file - The photo to upload.
 * @param options - Progress callback and cancel signal.
 * @returns The new room.
 * @throws ApiError when the API refuses the photo or can't be reached; an `AbortError` when cancelled.
 */
export function uploadRoom(file: File, { onProgress, signal, scope, ai }: UploadOptions = {}): Promise<Room> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("POST", apiUrl(API.rooms))
    request.responseType = "json"
    request.setRequestHeader("Accept", MIME.json)

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }
    request.onload = () => {
      if (request.status === HTTP_STATUS.created) resolve(request.response as Room)
      else reject(toApiError(request.status, request.response))
    }
    request.onerror = () => reject(toApiError(HTTP_STATUS.network, undefined))
    request.onabort = () => reject(new DOMException(MESSAGES.uploadCancelled, "AbortError"))
    signal?.addEventListener("abort", () => request.abort(), { once: true })

    const form = new FormData()
    form.append(UPLOAD_FIELDS.photo, file)
    if (scope) form.append(UPLOAD_FIELDS.scope, scope)
    if (ai) form.append(UPLOAD_FIELDS.ai, ai)
    request.send(form)
  })
}

/** One brush stroke on an object's outline. */
export type OutlineStroke = {
  /** The label map version the stroke was drawn on. */
  baseRevision: number
  /** The object to change. */
  objectIndex: number
  mode: OutlineBrushMode
  /** Brush along the path, or a box's or lasso's area. */
  shape: StrokeShape
  /** The brush radius, in label map pixels. */
  radius: number
  /** The path (a box's two corners, or a lasso), each point 0..1 of the photo's width and height. */
  points: { x: number; y: number }[]
}

/**
 * Saves a brush stroke on one object's outline. The API stores the result as a new label map
 * version and makes it current.
 * @param roomId - The room.
 * @param stroke - The stroke.
 * @returns The room, with its new labelMapRevision.
 * @throws ApiError with a message for the user when the stroke can't be saved (such as one that changes nothing).
 */
export function saveOutlineStroke(roomId: string, stroke: OutlineStroke): Promise<Room> {
  return sendJson<Room>("POST", API.roomOutline(roomId), stroke)
}

/** An object the user marked by hand, as sent to the API. */
export type NewObject = {
  /** The label map version the mark was drawn on. */
  baseRevision: number
  /** Its name. */
  label: string
  /** Its type. */
  category: ObjectCategory
  /** The strokes, in order: Paint marks, Erase unmarks; each with its shape and brush radius in label map pixels. */
  strokes: { mode: OutlineBrushMode; shape: StrokeShape; radius: number; points: { x: number; y: number }[] }[]
}

/**
 * Adds an object the user marked by hand: the marked pixels become a new object in a new label map version.
 * @param roomId - The room.
 * @param object - The name, type and strokes.
 * @returns The room, with the new object and its new labelMapRevision.
 * @throws ApiError with a message for the user when it can't be added (such as a missing name).
 */
export function addRoomObject(roomId: string, object: NewObject): Promise<Room> {
  return sendJson<Room>("POST", API.roomObjects(roomId), object)
}

/**
 * Removes objects from the photo together (a sofa and the cushions on it): the room's AI fills them with what is
 * behind them in one call, as a new photo and label map version.
 * @param roomId - The room.
 * @param objectIndexes - The objects.
 * @param baseRevision - The label map version the editor shows.
 * @returns The room, with its new labelMapRevision and photo.
 * @throws ApiError with a message for the user when they can't be removed (such as a wall).
 */
export function removeRoomObjects(roomId: string, objectIndexes: number[], baseRevision: number): Promise<Room> {
  return sendJson<Room>("POST", API.roomRemovals(roomId), { baseRevision, objectIndexes })
}

/**
 * Asks the room's AI for the parts of an object (a chair's seat, backrest and legs): each becomes a part of it, with
 * its own color, in a new label map version. With the real AI this is a paid call.
 * @param roomId - The room.
 * @param objectIndex - The object.
 * @param baseRevision - The label map version the editor shows.
 * @param instructions - The user's own words for the AI on which parts to find, such as "the cushions on their own".
 * @returns The room, with the new parts and its new labelMapRevision.
 * @throws ApiError with a message for the user when no parts can be found.
 */
export function findRoomParts(roomId: string, objectIndex: number, baseRevision: number, instructions?: string): Promise<Room> {
  return sendJson<Room>("POST", API.roomParts(roomId), { baseRevision, objectIndex, instructions: instructions?.trim() || undefined })
}

/**
 * Merges a part (a chair's seat) back into the object it is a part of, as a new label map version.
 * @param roomId - The room.
 * @param objectIndex - The part.
 * @param baseRevision - The label map version the editor shows.
 * @returns The room, with its new labelMapRevision.
 * @throws ApiError with a message for the user when it can't be merged.
 */
export function mergeRoomPart(roomId: string, objectIndex: number, baseRevision: number): Promise<Room> {
  return sendJson<Room>("POST", API.roomMerges(roomId), { baseRevision, objectIndex })
}

/**
 * Makes a stored label map version current again, after undo or redo of an outline fix.
 * @param roomId - The room.
 * @param revision - The version the editor now shows.
 * @returns The room.
 */
export function selectLabelMapRevision(roomId: string, revision: number): Promise<Room> {
  return sendJson<Room>("PUT", API.roomCurrentLabels(roomId), { revision })
}
