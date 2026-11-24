import { useCallback, useRef, useState } from "react"

import { PlanScene } from "./scene-3d"

/**
 * A 3D renderer for a canvas, which lives as long as the canvas does.
 * @returns `canvasRef` for the canvas, `sceneRef` holding the renderer once it is made, and whether it couldn't be made
 *   (no WebGL).
 */
export function usePlanScene() {
  const sceneRef = useRef<PlanScene | null>(null)
  const [failed, setFailed] = useState(false)

  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    sceneRef.current?.dispose()
    sceneRef.current = null

    if (!canvas) {
      return
    }

    try {
      sceneRef.current = new PlanScene(canvas)
    } catch {
      setFailed(true)
    }
  }, [])

  return { canvasRef, sceneRef, failed }
}
