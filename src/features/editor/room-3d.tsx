import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { LoaderCircleIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadDepthMap } from "./depth-map"
import { useEditorStore } from "./editor-store"
import { loadLabelMap } from "./label-map"
import { toRenderEdits } from "./render-edits"
import { RoomRenderer } from "./renderer"
import type { Scene3D } from "./scene-3d"
import { labelMapUrl, photoUrlFor, type Room } from "@/features/rooms/types"
import { apiUrl, errorMessage, sendJson } from "@/lib/api"
import { API, LIMITS, MESSAGES, OBJECT_CATEGORY, QUERY_KEYS } from "@/lib/constants"

/**
 * The room in 3D: its photo, with the recolors, laid over its depth map, so you can look around it a little.
 * The depth map is measured the first time (sample rooms bring theirs); the 3D code loads only now.
 * @param props.room - A ready room.
 */
export function Room3D({ room }: { room: Room }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Scene3D | null>(null)
  const textureRef = useRef<{ canvas: HTMLCanvasElement; renderer: RoomRenderer; width: number; height: number } | null>(null)
  // The empty room behind the furniture, recolored like the photo, when the room has one; and the picture the view
  // shows behind the furniture: the photo on the walls, floor and ceiling, the empty room where the furniture is.
  const backdropRef = useRef<{ canvas: HTMLCanvasElement; renderer: RoomRenderer; width: number; height: number } | null>(null)
  const behindRef = useRef<{ canvas: HTMLCanvasElement; surfaceMask: HTMLCanvasElement } | null>(null)
  const { edits, revision } = useEditorStore()
  const [state, setState] = useState<"measuring" | "loading" | "ready" | "failed">(room.depthUrl ? "loading" : "measuring")
  const [problem, setProblem] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // A room without a depth map gets one first (with the real AI, one paid call; then it's stored).
  const measure = useMutation({
    mutationFn: () => sendJson<Room>("POST", API.roomDepth(room.id)),
    onSuccess: (measured) => queryClient.setQueryData(QUERY_KEYS.room(room.id), measured),
    onError: (error) => {
      setProblem(errorMessage(error))
      setState("failed")
    },
  })
  // Ask once per room: effects can run twice (React's development checks), and the first measurement may be paid.
  const asked = useRef<string | null>(null)
  const { mutate } = measure
  useEffect(() => {
    if (room.depthUrl || asked.current === room.id) return
    asked.current = room.id
    mutate()
  }, [room.depthUrl, room.id, mutate])

  // Once there's a depth map: the recolored photo on a canvas off the page, and the 3D scene over it.
  const shownRevision = revision ?? room.labelMapRevision
  const photoSrc = photoUrlFor(room, shownRevision)
  const labelsSrc = labelMapUrl(room.id, shownRevision)
  useEffect(() => {
    if (!room.depthUrl || room.depthFovX === null || room.depthFovY === null || !containerRef.current) return
    const container = containerRef.current
    const abort = new AbortController()
    setState("loading")
    const load = (src: string) => {
      const image = new Image()
      image.crossOrigin = "anonymous"
      image.src = apiUrl(src)
      return image.decode().then(() => image)
    }
    const { backdropPhotoUrl, backdropLabelsUrl, backdropDepthUrl } = room
    const emptyRoom = backdropPhotoUrl && backdropLabelsUrl && backdropDepthUrl
      ? Promise.all([load(backdropPhotoUrl), loadLabelMap(backdropLabelsUrl, abort.signal), loadDepthMap(apiUrl(backdropDepthUrl), abort.signal)])
      : Promise.resolve(null)
    Promise.all([
      import("./scene-3d"),
      loadDepthMap(apiUrl(room.depthUrl), abort.signal),
      loadLabelMap(labelsSrc, abort.signal),
      load(photoSrc),
      emptyRoom,
    ])
      .then(([{ createScene }, depth, labels, photo, empty]) => {
        if (abort.signal.aborted) return
        const width = Math.min(LIMITS.view3d.maxTexture, room.width)
        const height = Math.round((width * room.height) / room.width)
        const edits = toRenderEdits(room.objects, useEditorStore.getState().edits)
        textureRef.current = makeTexture(photo, labels, width, height)
        drawTexture(textureRef.current, edits)
        let backdrop
        if (empty) {
          const [emptyPhoto, emptyLabels, emptyDepth] = empty
          backdropRef.current = makeTexture(emptyPhoto, emptyLabels, width, height)
          drawTexture(backdropRef.current, edits)
          const surfaces = new Set(room.objects.filter((o) => SURFACES.has(o.category)).map((o) => o.index))
          behindRef.current = { canvas: Object.assign(document.createElement("canvas"), { width, height }), surfaceMask: surfaceMask(labels, surfaces, width, height) }
          composeBehind(behindRef.current, textureRef.current.canvas, backdropRef.current.canvas)
          backdrop = { depth: emptyDepth, texture: behindRef.current.canvas, surfaces }
        }
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        sceneRef.current = createScene(container, depth, labels, room.depthFovX!, room.depthFovY!, textureRef.current.canvas, reduced, backdrop)
        setState("ready")
      })
      .catch((reason: unknown) => {
        if (abort.signal.aborted) return
        setProblem(reason instanceof Error ? reason.message : MESSAGES.view3dFailed)
        setState("failed")
      })
    return () => {
      abort.abort()
      sceneRef.current?.dispose()
      sceneRef.current = null
      textureRef.current?.renderer.dispose()
      textureRef.current = null
      backdropRef.current?.renderer.dispose()
      backdropRef.current = null
      behindRef.current = null
    }
  }, [room, photoSrc, labelsSrc])

  // New colors: redraw the texture and hand it to the scene.
  useEffect(() => {
    if (state !== "ready" || !textureRef.current) return
    const renderEdits = toRenderEdits(room.objects, edits)
    drawTexture(textureRef.current, renderEdits)
    if (backdropRef.current && behindRef.current) {
      drawTexture(backdropRef.current, renderEdits)
      composeBehind(behindRef.current, textureRef.current.canvas, backdropRef.current.canvas)
    }
    sceneRef.current?.refresh()
  }, [edits, room.objects, state])

  return (
    <div className="relative size-full overflow-hidden rounded-xl bg-black/80" data-view3d={state}>
      <div
        ref={containerRef}
        tabIndex={0}
        role="img"
        aria-label={`The room in 3D. ${MESSAGES.view3dHint}; the arrow keys turn it too.`}
        className="size-full cursor-grab outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
      />
      {(state === "measuring" || state === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white" role="status">
          <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {MESSAGES.view3dMeasuring}
        </div>
      )}
      {state === "failed" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white" role="alert">
          {MESSAGES.view3dFailed} {problem}
        </div>
      )}
      {state === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-background/80 py-1 pr-1 pl-3 text-xs shadow-soft backdrop-blur">
            {MESSAGES.view3dHint}
            <Button variant="ghost" size="icon-sm" aria-label="Reset the 3D view" onClick={() => sceneRef.current?.reset()}>
              <RotateCcwIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The categories the empty-room backdrop is lined up on: they are in both photos. */
const SURFACES: ReadonlySet<string> = new Set([OBJECT_CATEGORY.Wall, OBJECT_CATEGORY.Floor, OBJECT_CATEGORY.Ceiling])

/**
 * Where the photo shows a wall, floor or ceiling (opaque) and where furniture (clear), at the texture's size.
 * @param labels - The photo's label map.
 * @param surfaces - The objects that are walls, floors and ceilings.
 * @param width - The texture's width.
 * @param height - The texture's height.
 */
function surfaceMask(labels: Awaited<ReturnType<typeof loadLabelMap>>, surfaces: ReadonlySet<number>, width: number, height: number) {
  const small = new OffscreenCanvas(labels.width, labels.height)
  const pixels = new ImageData(labels.width, labels.height)
  for (let i = 0; i < labels.labels.length; i++) if (surfaces.has(labels.labels[i])) pixels.data[i * 4 + 3] = 255
  small.getContext("2d")!.putImageData(pixels, 0, 0)
  const mask = Object.assign(document.createElement("canvas"), { width, height })
  const context = mask.getContext("2d")!
  context.imageSmoothingEnabled = false
  context.drawImage(small, 0, 0, width, height)
  return mask
}

/**
 * The picture behind the furniture: the empty room, with the photo itself on top wherever the photo shows a wall,
 * floor or ceiling. At the photo's own angle, the seams along each piece of furniture's outline then match the photo.
 * @param behind - The canvas to draw on and the surface mask.
 * @param photo - The recolored photo.
 * @param empty - The recolored empty room.
 */
function composeBehind(behind: { canvas: HTMLCanvasElement; surfaceMask: HTMLCanvasElement }, photo: HTMLCanvasElement, empty: HTMLCanvasElement) {
  const { canvas, surfaceMask } = behind
  const context = canvas.getContext("2d")!
  context.globalCompositeOperation = "source-over"
  context.drawImage(empty, 0, 0, canvas.width, canvas.height)
  // The photo's walls, floor and ceiling: the photo, cut to the mask, then drawn on top.
  const layer = new OffscreenCanvas(canvas.width, canvas.height)
  const cut = layer.getContext("2d")!
  cut.drawImage(photo, 0, 0, canvas.width, canvas.height)
  cut.globalCompositeOperation = "destination-in"
  cut.drawImage(surfaceMask, 0, 0)
  context.drawImage(layer, 0, 0)
}

/**
 * A canvas off the page with a renderer for one photo and its outlines, to draw a 3D texture on.
 * @param photo - The photo.
 * @param labels - Its label map.
 * @param width - The texture's width.
 * @param height - The texture's height.
 */
function makeTexture(photo: HTMLImageElement, labels: Awaited<ReturnType<typeof loadLabelMap>>, width: number, height: number) {
  const canvas = document.createElement("canvas")
  const renderer = new RoomRenderer(canvas)
  renderer.setRoom(photo, labels)
  return { canvas, renderer, width, height }
}

/**
 * Draws the recolored photo on the texture canvas, full size, with no outlines.
 * @param texture - The canvas and its renderer.
 * @param edits - The recolors in the shader's terms.
 */
function drawTexture(
  texture: { renderer: RoomRenderer; width: number; height: number },
  edits: ReturnType<typeof toRenderEdits>
) {
  texture.renderer.setEdits(edits)
  texture.renderer.render(
    { rect: { x: 0, y: 0, width: texture.width, height: texture.height }, edits, hovered: 0, selected: 0, split: null },
    { width: texture.width, height: texture.height }
  )
}
