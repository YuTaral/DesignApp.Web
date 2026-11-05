import { useQuery } from "@tanstack/react-query"

import { ApiError, apiUrl, getJson, sendJson, toApiError } from "@/lib/api"
import { isAnalysisFinished, type AiMode, type AnalysisScope, type Room } from "./types"

/** React Query cache keys for rooms. */
export const roomKeys = {
  /** Key of one room by id. */
  detail: (id: string) => ["rooms", id] as const,
  /** Key of the AI availability. */
  ai: ["ai"] as const,
}

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
    queryKey: roomKeys.ai,
    queryFn: ({ signal }) => getJson<AiAvailability>("/api/ai", signal),
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
    queryKey: roomKeys.detail(id),
    queryFn: ({ signal }) => getJson<Room>(`/api/rooms/${id}`, signal),
    // A missing room won't appear by asking again.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
    refetchInterval: (query) => (query.state.data && !isAnalysisFinished(query.state.data.status) ? 5000 : false),
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
    request.open("POST", apiUrl("/api/rooms"))
    request.responseType = "json"
    request.setRequestHeader("Accept", "application/json")

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }
    request.onload = () => {
      if (request.status === 201) resolve(request.response as Room)
      else reject(toApiError(request.status, request.response))
    }
    request.onerror = () => reject(toApiError(0, undefined))
    request.onabort = () => reject(new DOMException("The upload was cancelled.", "AbortError"))
    signal?.addEventListener("abort", () => request.abort(), { once: true })

    const form = new FormData()
    form.append("photo", file)
    if (scope) form.append("scope", scope)
    if (ai) form.append("ai", ai)
    request.send(form)
  })
}

/** Whether a brush stroke adds pixels to the object or takes them away. */
export type OutlineBrushMode = "Paint" | "Erase"

/** One brush stroke on an object's outline. */
export type OutlineStroke = {
  /** The label map version the stroke was drawn on. */
  baseRevision: number
  /** The object to change. */
  objectIndex: number
  mode: OutlineBrushMode
  /** The brush radius, in label map pixels. */
  radius: number
  /** The path, each point 0..1 of the photo's width and height. */
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
  return sendJson<Room>("POST", `/api/rooms/${roomId}/outline`, stroke)
}

/**
 * Makes a stored label map version current again, after undo or redo of an outline fix.
 * @param roomId - The room.
 * @param revision - The version the editor now shows.
 * @returns The room.
 */
export function selectLabelMapRevision(roomId: string, revision: number): Promise<Room> {
  return sendJson<Room>("PUT", `/api/rooms/${roomId}/labels/current`, { revision })
}
