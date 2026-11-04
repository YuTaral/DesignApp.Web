import { useQuery } from "@tanstack/react-query"

import { ApiError, apiUrl, getJson, toApiError } from "@/lib/api"
import type { Room } from "./types"

export const roomKeys = {
  detail: (id: string) => ["rooms", id] as const,
}

export function useRoom(id: string) {
  return useQuery({
    queryKey: roomKeys.detail(id),
    queryFn: ({ signal }) => getJson<Room>(`/api/rooms/${id}`, signal),
    // A missing room won't appear by asking again.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  })
}

type UploadOptions = {
  /** Called with 0..1 as the photo uploads. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** Uploads with XMLHttpRequest rather than fetch, because fetch can't report upload progress. */
export function uploadRoom(file: File, { onProgress, signal }: UploadOptions = {}): Promise<Room> {
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
    request.send(form)
  })
}
