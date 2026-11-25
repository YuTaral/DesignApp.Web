import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react"
import * as THREE from "three"
import { CameraIcon, LoaderCircleIcon, LocateFixedIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useSavePanoramaView } from "@/features/rooms/api"
import type { RoomPanorama } from "@/features/rooms/types"
import { apiUrl, errorMessage } from "@/lib/api"
import { MESSAGES, PANORAMA } from "@/lib/constants"
import { maxTilt, yawLimit } from "./panorama-limits"

/** Which way the viewer looks: its turn and tilt, and its lens across its height, in degrees. */
type Look = { yaw: number; pitch: number; fov: number }

/**
 * A room's 360° photo to look around: drag, the arrow keys or the wheel. Its middle faces the room; turning stops before
 * the view's edge (at its tilt) reaches the seam behind, where the photo's ends meet, and tilting stops before straight
 * up or down, where the whole seam meets; a bar below shows where the view faces within the turn allowed. Save this
 * view adds what is in view to the room's photos, cut from the same picture, so every view shows exactly the same room.
 * The viewer is 4:3, the shape of a saved view, so what is saved is what is seen. It starts where the photo's start
 * faces (towards most of the room), tilted a little down.
 * @param props.roomId - The room.
 * @param props.panorama - Its 360° photo.
 */
export function PanoramaViewer({ roomId, panorama }: { roomId: string; panorama: RoomPanorama }) {
  const start: Look = { yaw: panorama.startYaw ?? 0, pitch: PANORAMA.startPitch, fov: PANORAMA.startFov }
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null>(null)
  const lookRef = useRef<Look>({ ...start })
  const dragRef = useRef<{ x: number; y: number; from: Look } | null>(null)
  const save = useSavePanoramaView(roomId)
  const [look, setLook] = useState<Look>(start)
  const [limit, setLimit] = useState(180)
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading")

  // The renderer and the inside-out sphere carrying the photo, for as long as the viewer is shown.
  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch {
      setState("failed")

      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(PANORAMA.startFov, 1, 0.1, 100)
    const geometry = new THREE.SphereGeometry(50, 96, 64)
    const material = new THREE.MeshBasicMaterial()
    const resize = () => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
      camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
      show(lookRef.current)
    }
    const observer = new ResizeObserver(resize)
    let texture: THREE.Texture | null = null

    geometry.scale(-1, 1, 1)
    scene.add(new THREE.Mesh(geometry, material))
    viewRef.current = { renderer, scene, camera }
    new THREE.TextureLoader().load(
      apiUrl(panorama.url),
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace
        loaded.anisotropy = renderer.capabilities.getMaxAnisotropy()
        texture = loaded
        material.map = loaded
        material.needsUpdate = true
        setState("ready")
        show(lookRef.current)
      },
      undefined,
      () => setState("failed")
    )
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      texture?.dispose()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      viewRef.current = null
    }
    // One renderer per photo; `show` only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panorama.url])

  /**
   * Turns the view (kept inside the allowed range) and draws it.
   * @param next - The new turn, tilt and lens.
   */
  const show = (next: Look) => {
    const view = viewRef.current

    if (!view) {
      return
    }

    const fov = Math.min(PANORAMA.maxFov, Math.max(PANORAMA.minFov, next.fov))
    const tilt = Math.min(maxTilt(fov), Math.max(-maxTilt(fov), next.pitch))
    // The turn allowed depends on the tilt: tilting at the far left or right turns the view back a little.
    const most = yawLimit(fov, tilt)
    const kept = { fov, yaw: Math.min(most, Math.max(-most, next.yaw)), pitch: tilt }
    const [yaw, pitch] = [THREE.MathUtils.degToRad(kept.yaw), THREE.MathUtils.degToRad(kept.pitch)]

    view.camera.fov = fov
    view.camera.updateProjectionMatrix()

    // The photo's middle is on -x in the inside-out sphere; turning right moves towards -z.
    view.camera.lookAt(-Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.sin(yaw) * Math.cos(pitch))
    view.renderer.render(view.scene, view.camera)
    lookRef.current = kept
    setLook(kept)
    setLimit(most)
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, from: lookRef.current }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current

    if (!drag) {
      return
    }

    // Degrees per pixel follow the lens, so the room moves with the pointer.
    const perPixel = drag.from.fov / event.currentTarget.clientHeight

    show({ ...drag.from, yaw: drag.from.yaw - (event.clientX - drag.x) * perPixel, pitch: drag.from.pitch + (event.clientY - drag.y) * perPixel })
  }

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    show({ ...lookRef.current, fov: lookRef.current.fov + event.deltaY * PANORAMA.wheelZoom })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-PANORAMA.keyStep, 0],
      ArrowRight: [PANORAMA.keyStep, 0],
      ArrowUp: [0, PANORAMA.keyStep],
      ArrowDown: [0, -PANORAMA.keyStep],
    }
    const step = steps[event.key]

    if (!step) {
      return
    }

    event.preventDefault()
    show({ ...lookRef.current, yaw: lookRef.current.yaw + step[0], pitch: lookRef.current.pitch + step[1] })
  }

  const saveView = () => {
    save.mutate(
      // Exactly as seen: rounded, a view at the turn's limit could cross it.
      { yaw: look.yaw, pitch: look.pitch, fov: look.fov },
      {
        onSuccess: () => {
          toast.success(MESSAGES.panoramaViewSaved)
          // Back to the picture, so the arrow keys turn it again.
          canvasRef.current?.focus()
        },
        onError: (error) => toast.error(errorMessage(error)),
      }
    )
  }

  return (
    <figure className="flex min-w-0 flex-col gap-2" data-panorama-viewer>
      <figcaption className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {/* At least this wide, so on a phone the buttons go under it rather than squeeze it. */}
        <span className="min-w-60 flex-1">Drag or use the arrow keys to look around, scroll to zoom. Every view shows exactly the same room.</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            show({ ...start })
            canvasRef.current?.focus()
          }}
          data-panorama-reset
        >
          <LocateFixedIcon data-icon="inline-start" />
          Face the room
        </Button>
        <Button size="sm" disabled={state !== "ready" || save.isPending} onClick={saveView} data-panorama-save>
          {save.isPending ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <CameraIcon data-icon="inline-start" />}
          Save this view
        </Button>
      </figcaption>
      {/* Framed like the photos, as wide as the card allows and no taller than 60% of the screen, but always 4:3. */}
      <div className="relative overflow-hidden rounded-2xl border bg-muted">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="The room in 360°. Drag or use the arrow keys to look around."
          className="mx-auto block aspect-[4/3] w-full max-w-[80dvh] cursor-grab touch-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          data-panorama-canvas
        />
        {state !== "ready" && (
          <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
            {state === "loading" ? "Loading the 360° photo…" : MESSAGES.panoramaLoadFailed}
          </p>
        )}
      </div>
      {/* Where the view faces, within the turn allowed before the seam behind. */}
      <div className="mx-auto w-full max-w-md space-y-1 font-mono text-[11px] text-muted-foreground tabular-nums" aria-hidden>
        <div className="relative h-2 rounded-full bg-border">
          <div className="absolute inset-y-0 rounded-full bg-primary/30" style={{ left: `${((180 - limit) / 360) * 100}%`, right: `${((180 - limit) / 360) * 100}%` }} />
          <div className="absolute -top-0.5 h-3 w-1 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${((look.yaw + 180) / 360) * 100}%` }} />
        </div>
        <div className="flex justify-between" data-panorama-angle={Math.round(look.yaw)}>
          <span>−{Math.round(limit)}°</span>
          <span>
            {look.yaw >= 0 ? "+" : "−"}
            {Math.abs(Math.round(look.yaw))}° · {Math.round(look.fov)}° lens
          </span>
          <span>+{Math.round(limit)}°</span>
        </div>
      </div>
    </figure>
  )
}
