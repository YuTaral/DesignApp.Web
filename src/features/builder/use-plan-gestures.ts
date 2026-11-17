import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { BUILDER } from "@/lib/constants"
import type { Plan } from "./api"
import { footprint, isWallItem, partsOf, toGrid, useBuilderStore } from "./builder-store"
import { moveCorner, moveWall, pushSection, wallOf, walls } from "./room-outline"

/** Room around the walls in the drawing, in centimetres (for the walls' thickness and the handles). */
export const PLAN_MARGIN = 50

/** A part of an L- or P-shaped object that has its own handle: the back run, the corner leg or a P's chaise. */
export type Part = "run" | "leg" | "chaise"

/**
 * What a pointer is doing: moving an object, resizing it from one of its corner handles (the opposite corner, `anchor`,
 * stays where it is, so the object grows towards the pointer), or resizing one of its parts.
 */
type Gesture = { kind: "move" | "resize" | Part; index: number; pointerId: number; offset: { x: number; y: number }; anchor: { x: number; y: number } }

/**
 * What a pointer is doing to the room's shape: pushing or pulling a whole wall, a section of one (from the "+" handle),
 * or dragging a corner. Each step starts again from the room as it was (`base`); `shift` is how far the last step moved
 * the plan to keep its top-left corner at 0, 0, so the pointer can be read in the base's coordinates.
 */
type ShapeGesture = {
  kind: "wall" | "section" | "corner"
  index: number
  pointerId: number
  base: Plan
  start: { x: number; y: number }
  from: number
  to: number
  shift: { x: number; y: number }
}

/**
 * The floor plan's drags: moving and resizing objects and their parts on the 10 cm grid, and changing the room's
 * shape (a wall, a section of one from its "+", or a corner).
 * @param plan - The room.
 * @returns `svgRef` for the drawing; `toPlan`, a screen point in the plan's centimetres; `held`, the drawing's frame held
 * still while the shape is dragged (null when it fits the room); `plus`, where the "+" is, and `setPlus`; `reshaping`,
 * whether the shape is being dragged; and the handlers `start`, `startShape`, `startSection`, `move` and `end`.
 */
export function usePlanGestures(plan: Plan) {
  const { select, update, reshape } = useBuilderStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const shapeGesture = useRef<ShapeGesture | null>(null)
  // Where the "+" for pushing out a section of a wall is, following the pointer along the wall.
  const [plus, setPlus] = useState<{ wall: number; along: number } | null>(null)
  // The drawing's frame held still while the shape is dragged (moved with the plan when its corner moves), so the wall
  // under the pointer follows it instead of the drawing rescaling under it; null when it fits the room.
  const [held, setHeld] = useState<{ x: number; y: number; width: number; length: number } | null>(null)
  const [roomWidth, roomLength] = [plan.width * 100, plan.length * 100]

  /**
   * A point of the screen in the plan's centimetres.
   * @param clientX - Across, in CSS px.
   * @param clientY - Down, in CSS px.
   */
  const toPlan = (clientX: number, clientY: number) => {
    const svg = svgRef.current!
    const point = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM()!.inverse())

    return { x: point.x, y: point.y }
  }

  /**
   * Selects an object and starts moving or resizing it, or one of its parts (a wall's object is only selected).
   * @param event - The pointer going down.
   * @param index - The object's position in the plan's objects.
   * @param kind - What the drag does.
   * @param corner - For a resize, the corner dragged.
   */
  const start = (event: ReactPointerEvent, index: number, kind: Gesture["kind"], corner = { x: 1, y: 1 }) => {
    event.stopPropagation()
    select(index)

    if (isWallItem(plan.items[index])) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const item = plan.items[index]
    const point = toPlan(event.clientX, event.clientY)
    const { width, depth } = footprint(item)
    const anchor = { x: item.x - (corner.x * width) / 2, y: item.y - (corner.y * depth) / 2 }

    gesture.current = { kind, index, pointerId: event.pointerId, offset: { x: point.x - item.x, y: point.y - item.y }, anchor }
  }

  /**
   * Starts changing the room's shape.
   * @param event - The pointer going down.
   * @param kind - What is dragged.
   * @param index - The wall's or corner's number.
   * @param section - For a section, where it starts and ends along the wall.
   */
  const startShape = (event: ReactPointerEvent, kind: ShapeGesture["kind"], index: number, section = { from: 0, to: 0 }) => {
    event.stopPropagation()
    // The drawing itself follows the pointer: the "+" disappears and handles move while the shape is dragged.
    svgRef.current!.setPointerCapture(event.pointerId)
    const begun = toPlan(event.clientX, event.clientY)

    shapeGesture.current = { kind, index, pointerId: event.pointerId, base: plan, start: begun, ...section, shift: { x: 0, y: 0 } }
    setHeld({ x: -PLAN_MARGIN, y: -PLAN_MARGIN, width: roomWidth + 2 * PLAN_MARGIN, length: roomLength + 2 * PLAN_MARGIN })
    setPlus(null)
  }

  /**
   * Starts pushing out a section of a wall from its "+": a metre of it (less on a short wall) around the "+".
   * @param event - The pointer going down.
   */
  const startSection = (event: ReactPointerEvent) => {
    if (!plus) {
      return
    }

    const length = wallOf(plan, plus.wall).length
    const width = Math.min(BUILDER.sectionCm, length - 2 * BUILDER.minWallCm)

    if (width < BUILDER.minWallCm) {
      return
    }

    const from = Math.min(length - width, Math.max(0, toGrid(plus.along - width / 2)))

    startShape(event, "section", plus.wall, { from, to: from + width })
  }

  /**
   * Follows a shape gesture: the wall, section or corner moves to the pointer (in whole grid steps), from the room as
   * it was when the gesture began.
   * @param g - The gesture.
   * @param event - The pointer.
   */
  const moveShape = (g: ShapeGesture, event: ReactPointerEvent) => {
    const now = toPlan(event.clientX, event.clientY)
    const point = { x: now.x - g.shift.x, y: now.y - g.shift.y }
    const wall = walls(g.base)[g.index]
    const outward = wall ? toGrid((point.x - g.start.x) * -wall.nx + (point.y - g.start.y) * -wall.ny) : 0
    const change =
      g.kind === "corner"
        ? moveCorner(g.base.outline, g.index, toGrid(point.x), toGrid(point.y))
        : g.kind === "wall"
          ? moveWall(g.base.outline, g.index, outward)
          : pushSection(g.base.outline, g.index, g.from, g.to, outward)
    const shift = reshape(g.base, change)

    if (shift) {
      g.shift = shift
      setHeld({ x: -PLAN_MARGIN + shift.x, y: -PLAN_MARGIN + shift.y, width: g.base.width * 100 + 2 * PLAN_MARGIN, length: g.base.length * 100 + 2 * PLAN_MARGIN })
    }
  }

  const move = (event: ReactPointerEvent) => {
    const shaped = shapeGesture.current

    if (shaped && shaped.pointerId === event.pointerId) {
      moveShape(shaped, event)

      return
    }

    const g = gesture.current

    if (!g || g.pointerId !== event.pointerId) {
      return
    }

    const item = plan.items[g.index]
    const point = toPlan(event.clientX, event.clientY)

    if (g.kind === "move") {
      update(g.index, { x: toGrid(point.x - g.offset.x), y: toGrid(point.y - g.offset.y) })

      return
    }

    if (g.kind !== "resize") {
      // A part's handle: the pointer in the object's own frame before turning (turned back by its rotation).
      const turn = (item.rotation * Math.PI) / 180
      const [dx, dy] = [point.x - item.x, point.y - item.y]
      const local = { x: Math.cos(turn) * dx + Math.sin(turn) * dy, y: -Math.sin(turn) * dx + Math.cos(turn) * dy }
      const parts = partsOf(item)!
      const next =
        g.kind === "run"
          ? { runDepth: local.y + item.depth / 2 }
          : g.kind === "leg"
            ? { legWidth: item.width / 2 - local.x }
            : { chaiseWidth: item.width / 2 - local.x, chaiseDepth: item.depth / 2 - local.y }

      update(g.index, { parts: { ...parts, ...next } })

      return
    }

    // Resizing keeps the opposite corner where it was and grows towards the pointer, which stays inside the walls so
    // the room never has to move the object back.
    const { x: ax, y: ay } = g.anchor
    const [px, py] = [Math.min(roomWidth, Math.max(0, point.x)), Math.min(roomLength, Math.max(0, point.y))]
    const across = Math.max(BUILDER.item.min, Math.abs(px - ax))
    const along = Math.max(BUILDER.item.min, Math.abs(py - ay))
    const middle = { x: ax + Math.sign(px - ax || 1) * (across / 2), y: ay + Math.sign(py - ay || 1) * (along / 2) }
    const turned = item.rotation % 180 !== 0

    update(g.index, { ...middle, ...(turned ? { width: along, depth: across } : { width: across, depth: along }) })
  }

  const end = (event: ReactPointerEvent) => {
    if (gesture.current?.pointerId === event.pointerId) {
      gesture.current = null
    }

    if (shapeGesture.current?.pointerId === event.pointerId) {
      shapeGesture.current = null
      setHeld(null)
    }
  }

  return { svgRef, toPlan, held, plus, setPlus, reshaping: () => shapeGesture.current !== null, start, startShape, startSection, move, end }
}
