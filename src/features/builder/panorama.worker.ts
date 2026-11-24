import { joinFaces, panoramaBoxes } from "./panorama"

/** What the page sends: the cube faces in colors and in object ids, and the panorama's size. */
export type PanoramaJob = {
  colors: Uint8ClampedArray[]
  ids: Uint8Array[]
  size: number
  width: number
  height: number
  items: number
  minPixels: number
}

/** The worker's side of the messages: what it receives, and how it answers. */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PanoramaJob>) => void) | null
  postMessage: (message: unknown) => void
}

/**
 * Joins a cube camera's faces into the 360° view and finds each object's box in it, off the page's thread: the 8 million
 * pixels took the page about 6 seconds, during which it couldn't respond. Answers with the PNG and the boxes, or an error.
 */
scope.onmessage = (event) => {
  const { colors, ids, size, width, height, items, minPixels } = event.data
  const image = new ImageData(width, height)
  const idMap = new Uint8Array(width * height)
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext("2d")

  if (!context) {
    scope.postMessage({ error: "No 2D canvas in the worker" })

    return
  }

  joinFaces(colors, size, width, height, 4, image.data)
  joinFaces(ids, size, width, height, 1, idMap)
  context.putImageData(image, 0, 0)
  void canvas.convertToBlob({ type: "image/png" }).then(
    (guide) => scope.postMessage({ guide, boxes: panoramaBoxes(idMap, width, height, items, minPixels) }),
    (error: unknown) => scope.postMessage({ error: String(error) })
  )
}
