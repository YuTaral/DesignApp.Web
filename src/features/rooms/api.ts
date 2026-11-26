import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiUrl, getJson, retryUnlessMissing, sendJson, toApiError } from "@/lib/api"
import { isAnalysisFinished, type PhotoTake, type Room } from "./types"
import { type AiMode, type AnalysisScope, API, HTTP_STATUS, MESSAGES, MIME, type ObjectCategory, type OutlineBrushMode, QUERY_KEYS, type StrokeShape, TIMINGS, UPLOAD_FIELDS } from "@/lib/constants"

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
 * @param id - The room's id; nothing is loaded without one.
 */
export function useRoom(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.room(id ?? ""),
    queryFn: ({ signal }) => getJson<Room>(API.room(id ?? ""), signal),
    enabled: id !== undefined,
    // A missing room won't appear by asking again.
    retry: retryUnlessMissing,
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
  /** False leaves the room waiting instead of starting its analysis (a photo only read into a room plan). */
  analyze?: boolean
}

/**
 * Uploads a room photo and creates a room for it.
 * Uses XMLHttpRequest rather than fetch, because fetch can't report upload progress.
 * @param file - The photo to upload.
 * @param options - Progress callback and cancel signal.
 * @returns The new room.
 * @throws ApiError when the API refuses the photo or can't be reached; an `AbortError` when cancelled.
 */
export function uploadRoom(file: File, { onProgress, signal, scope, ai, analyze }: UploadOptions = {}): Promise<Room> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const form = new FormData()

    request.open("POST", apiUrl(API.rooms))
    request.responseType = "json"
    request.setRequestHeader("Accept", MIME.json)

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded / event.total)
      }
    }
    request.onload = () => {
      if (request.status === HTTP_STATUS.created) {
        resolve(request.response as Room)
      } else {
        reject(toApiError(request.status, request.response))
      }
    }
    request.onerror = () => reject(toApiError(HTTP_STATUS.network, undefined))
    request.onabort = () => reject(new DOMException(MESSAGES.uploadCancelled, "AbortError"))
    signal?.addEventListener("abort", () => request.abort(), { once: true })
    form.append(UPLOAD_FIELDS.photo, file)

    if (scope) {
      form.append(UPLOAD_FIELDS.scope, scope)
    }

    if (ai) {
      form.append(UPLOAD_FIELDS.ai, ai)
    }

    if (analyze === false) {
      form.append(UPLOAD_FIELDS.analyze, "false")
    }

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

/** The last change sent for each room, so the next one waits for it (see `inTurn`). */
const roomWrites = new Map<string, Promise<unknown>>()

/**
 * Sends a change to a room after the changes sent before it have been answered, so each starts from the room as the
 * one before left it. The editor switches outline versions at once (undo, redo) and tells the API in the background;
 * without this, a removal sent right after could reach the API while that switch is still being saved, and the two
 * would change the same fields at the same time.
 * @param roomId - The room.
 * @param write - Sends the change.
 * @returns The change's answer.
 */
function inTurn<T>(roomId: string, write: () => Promise<T>): Promise<T> {
  const before = roomWrites.get(roomId) ?? Promise.resolve()
  const next = before.catch(() => undefined).then(write)

  roomWrites.set(roomId, next)
  next
    .catch(() => undefined)
    .finally(() => {
      if (roomWrites.get(roomId) === next) {
        roomWrites.delete(roomId)
      }
    })

  return next
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
  return inTurn(roomId, () => sendJson<Room>("POST", API.roomOutline(roomId), stroke))
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
  return inTurn(roomId, () => sendJson<Room>("POST", API.roomObjects(roomId), object))
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
  return inTurn(roomId, () => sendJson<Room>("POST", API.roomRemovals(roomId), { baseRevision, objectIndexes }))
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
  return inTurn(roomId, () => sendJson<Room>("POST", API.roomParts(roomId), { baseRevision, objectIndex, instructions: instructions?.trim() || undefined }))
}

/**
 * A room's photos to choose from (a room builder run's photos and their AI changes), oldest first.
 * @param roomId - The room.
 * @param enabled - Whether to load them (false for a room that has none to show).
 */
export function useRoomTakes(roomId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.roomTakes(roomId),
    queryFn: ({ signal }) => getJson<PhotoTake[]>(API.roomTakes(roomId), signal),
    enabled,
  })
}

/**
 * Has the room's AI make a new version of one of its photos with a change in the user's words; the new photo is added
 * to the room's photos.
 * @param roomId - The room.
 */
export function useChangeTake(roomId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ takeId, instructions }: { takeId: string; instructions: string }) => {
      return sendJson<PhotoTake>("POST", API.roomTakeChange(roomId, takeId), { instructions })
    },
    onSuccess: (take) => {
      queryClient.setQueryData<PhotoTake[]>(QUERY_KEYS.roomTakes(roomId), (takes) => [...(takes ?? []), take])
    },
  })
}

/**
 * Saves a view of a room's 360° photo as one of its photos (cut from the same picture, without AI), adding it to the
 * room's photos.
 * @param roomId - The room.
 */
export function useSavePanoramaView(roomId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (view: PanoramaView) => {
      return sendJson<PhotoTake>("POST", API.roomPanoramaViews(roomId), view)
    },
    onSuccess: (take) => {
      queryClient.setQueryData<PhotoTake[]>(QUERY_KEYS.roomTakes(roomId), (takes) => [...(takes ?? []), take])
    },
  })
}

/** Which way a view of a 360° photo looks, in degrees (mirrors the API's PanoramaViewRequest): right and up are positive. */
export type PanoramaView = { yaw: number; pitch: number; fov: number }

/**
 * Makes one of a room's photos the room's photo, the one its analysis uses (an analyzed room waits for it again).
 * @param roomId - The room.
 * @param takeId - The photo.
 * @returns The room.
 */
export function chooseRoomTake(roomId: string, takeId: string): Promise<Room> {
  return inTurn(roomId, () => sendJson<Room>("POST", API.roomTakeChoice(roomId, takeId)))
}

/**
 * Puts a room of a room plan's photos into the plan's own design (made when it has none). Needs an account.
 * @param roomId - The room.
 * @returns The design's id.
 */
export function saveRoomToPlanDesign(roomId: string): Promise<{ designId: string }> {
  return sendJson<{ designId: string }>("POST", API.roomPlanDesign(roomId))
}

/**
 * Starts the analysis of a room that waits for it (a photo made by the room builder).
 * @param roomId - The room.
 * @returns The room, now queued for analysis.
 * @throws ApiError with a message for the user when it can't be started.
 */
export function startRoomAnalysis(roomId: string): Promise<Room> {
  return inTurn(roomId, () => sendJson<Room>("POST", API.roomAnalysis(roomId)))
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
  return inTurn(roomId, () => sendJson<Room>("POST", API.roomMerges(roomId), { baseRevision, objectIndex }))
}

/**
 * Makes a stored label map version current again, after undo or redo of an outline fix.
 * @param roomId - The room.
 * @param revision - The version the editor now shows.
 * @returns The room.
 */
export function selectLabelMapRevision(roomId: string, revision: number): Promise<Room> {
  return inTurn(roomId, () => sendJson<Room>("PUT", API.roomCurrentLabels(roomId), { revision }))
}
