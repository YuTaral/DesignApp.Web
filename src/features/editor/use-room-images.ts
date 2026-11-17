import { useEffect, useRef, useState, type RefObject } from "react"

import { labelMapUrl, photoUrlFor, type Room } from "@/features/rooms/types"
import { apiUrl } from "@/lib/api"
import { MESSAGES } from "@/lib/constants"
import { loadLabelMap, type LabelMap } from "./label-map"
import { RoomRenderer } from "./renderer"

/**
 * Loads a room's photo and outlines into a renderer on a canvas, and swaps in another version of either (after a fix,
 * a removal, an undo or a redo) without restarting: until the new one arrives the previous one stays on screen.
 * @param room - The room.
 * @param shownRevision - The label map version the editor is on; the photo shown is the one that goes with it.
 * @param canvasRef - The canvas the renderer draws on.
 * @returns The renderer (once both are loaded); `map`, the outlines shown with their address; `labelsUrl`, the address
 * of the outlines that should show; `shownPhoto`, the address of the photo shown; and `error`, why loading failed.
 */
export function useRoomImages(room: Room, shownRevision: number, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const rendererRef = useRef<RoomRenderer | null>(null)
  const [map, setMap] = useState<(LabelMap & { url: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const labelsUrl = labelMapUrl(room.id, shownRevision)
  const photoSrc = photoUrlFor(room, shownRevision)
  const firstLabelsUrl = useRef(labelsUrl)
  const firstPhotoSrc = useRef(photoSrc)
  const [shownPhoto, setShownPhoto] = useState(photoSrc)

  // Load the photo and the first label map, then hand both to a renderer on the canvas.
  useEffect(() => {
    const abort = new AbortController()
    const photo = new Image()

    photo.crossOrigin = "anonymous" // same mode as the <img> before it, so the cached copy is reused
    photo.src = apiUrl(firstPhotoSrc.current)

    Promise.all([photo.decode(), loadLabelMap(firstLabelsUrl.current, abort.signal)])
      .then(([, labelMap]) => {
        if (abort.signal.aborted || !canvasRef.current) {
          return
        }

        const renderer = new RoomRenderer(canvasRef.current)

        renderer.setRoom(photo, labelMap)
        rendererRef.current = renderer
        setMap({ url: firstLabelsUrl.current, ...labelMap })
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) {
          setError(reason instanceof Error ? reason.message : MESSAGES.editorFailed)
        }
      })

    return () => {
      abort.abort()
      rendererRef.current?.dispose()
      rendererRef.current = null
      setMap(null)
    }
  }, [room.id, canvasRef])

  // Swap in another photo version (after a removal, undo or redo) without restarting the editor.
  useEffect(() => {
    if (!map || shownPhoto === photoSrc) {
      return
    }

    const abort = new AbortController()
    const photo = new Image()

    photo.crossOrigin = "anonymous"
    photo.src = apiUrl(photoSrc)
    photo
      .decode()
      .then(() => {
        if (abort.signal.aborted || !rendererRef.current) {
          return
        }

        rendererRef.current.setPhoto(photo)
        setShownPhoto(photoSrc)
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(MESSAGES.editorFailed)
        }
      })

    return () => abort.abort()
  }, [map, photoSrc, shownPhoto])

  // Swap in another label map version (after a fix, undo or redo) without reloading the photo.
  useEffect(() => {
    if (!map || map.url === labelsUrl) {
      return
    }

    const abort = new AbortController()

    loadLabelMap(labelsUrl, abort.signal)
      .then((labelMap) => {
        if (abort.signal.aborted || !rendererRef.current) {
          return
        }

        rendererRef.current.setLabels(labelMap)
        setMap({ url: labelsUrl, ...labelMap })
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) {
          setError(reason instanceof Error ? reason.message : MESSAGES.outlinesFailed)
        }
      })

    return () => abort.abort()
  }, [labelsUrl, map])

  return { rendererRef, map, labelsUrl, shownPhoto, error }
}
