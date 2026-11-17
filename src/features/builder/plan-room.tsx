import type { PointerEvent as ReactPointerEvent } from "react"
import { cn } from "cn"

import { BUILDER } from "@/lib/constants"
import type { Plan } from "./api"
import { cameraStand, wallName, wallOf, wallPoint, walls, type OutlineWall } from "./room-outline"

/**
 * The walls on the floor plan, as bands just outside the floor in the walls' color; the wall in view is outlined. In
 * room shape mode each can be dragged; otherwise clicking one opens it.
 * @param props.plan - The room.
 * @param props.shaping - Whether the room's shape is being edited.
 * @param props.onDown - A pointer went down on a wall.
 * @param props.onHover - The pointer moves over a wall.
 */
export function PlanWalls({
  plan,
  shaping,
  onDown,
  onHover,
}: {
  plan: Plan
  shaping: boolean
  onDown: (event: ReactPointerEvent, wall: OutlineWall) => void
  onHover: (event: ReactPointerEvent, wall: OutlineWall) => void
}) {
  return walls(plan).map((wall) => {
    const viewed = wall.index === plan.view
    const name = wallName(plan, wall.index)

    return (
      <polygon
        key={wall.index}
        points={band(plan, wall)}
        fill={plan.wallColor}
        strokeWidth={viewed ? 4 : 1.5}
        className={cn(
          shaping ? (wall.dx === 0 ? "cursor-ew-resize" : "cursor-ns-resize") : "cursor-pointer",
          viewed && !shaping ? "stroke-primary" : "stroke-black/35 hover:stroke-primary/60"
        )}
        data-plan-wall={wall.index}
        aria-label={shaping ? `${name}: drag to push or pull it` : `${name}: open it and look at it`}
        onPointerDown={(event) => onDown(event, wall)}
        onPointerMove={(event) => onHover(event, wall)}
      >
        <title>{shaping ? `Drag to push or pull the ${name.toLowerCase()}` : `Open the ${name.toLowerCase()} and look at it`}</title>
      </polygon>
    )
  })
}

/**
 * Where the photo is taken from: a camera across the room from the middle of the wall in view, or in a near corner
 * (`cameraStand`), pointing the way it looks. It is drawn half its size further that way, so it shows on the floor
 * rather than under the wall bands (the camera itself stands only 5 cm from the walls).
 * @param props.plan - The room.
 * @param props.text - The text size.
 */
export function Camera({ plan, text }: { plan: Plan; text: number }) {
  const at = cameraStand(plan)
  const turn = (Math.atan2(at.lookX, -at.lookY) * 180) / Math.PI
  const size = Math.max(18, text * 1.6)
  const [x, y] = [at.x + at.lookX * size * 0.5, at.y + at.lookY * size * 0.5]

  return (
    <g className="pointer-events-none fill-primary" transform={`translate(${x} ${y}) rotate(${turn})`} data-camera={plan.view} data-corner={at.corner}>
      <path d={`M 0 ${-size} L ${size * 0.7} ${size * 0.15} L ${-size * 0.7} ${size * 0.15} Z`} fillOpacity="0.35" />
      <rect x={-size * 0.35} y={-size * 0.05} width={size * 0.7} height={size * 0.45} rx={3} />
    </g>
  )
}

/**
 * A wall as a band just outside the floor, its ends mitred so the bands meet at every corner, inner or outer.
 * @param plan - The room.
 * @param wall - The wall.
 * @returns The band's corners as SVG points.
 */
function band(plan: Plan, wall: OutlineWall) {
  const all = walls(plan)
  const [before, after] = [all[(wall.index - 1 + all.length) % all.length], all[(wall.index + 1) % all.length]]
  // Outside a right-angled corner lies against both walls' outward normals.
  const outer = (corner: { x: number; y: number }, other: OutlineWall) => ({ x: corner.x - (wall.nx + other.nx) * BUILDER.planWallCm, y: corner.y - (wall.ny + other.ny) * BUILDER.planWallCm })

  return [wall.start, wall.end, outer(wall.end, after), outer(wall.start, before)].map((p) => `${p.x},${p.y}`).join(" ")
}

/**
 * The room shape mode's handles: each wall's length just inside it, a dot on every corner to drag, and the "+" just outside
 * the wall under the pointer, at the pointer's place along it, that pushes out a section of that wall (the wall itself
 * stays free to drag whole).
 * @param props.plan - The room.
 * @param props.text - The text size.
 * @param props.plus - Where the "+" is, if the pointer is over a wall.
 * @param props.onCorner - Starts dragging a corner.
 * @param props.onPlus - Starts pushing out a section from the "+".
 */
export function ShapeHandles({
  plan,
  text,
  plus,
  onCorner,
  onPlus,
}: {
  plan: Plan
  text: number
  plus: { wall: number; along: number } | null
  onCorner: (event: ReactPointerEvent, corner: number) => void
  onPlus: (event: ReactPointerEvent) => void
}) {
  const label = { paintOrder: "stroke" as const, stroke: "var(--background)", strokeWidth: 3, strokeOpacity: 0.8 }
  const plusAt = plus ? wallPoint(plan, plus.wall, plus.along) : null
  const plusWall = plus ? wallOf(plan, plus.wall) : null
  const size = Math.max(14, text * 1.1)

  return (
    <g data-shape-handles>
      {walls(plan).map((wall) => {
        const middle = wallPoint(plan, wall.index, wall.length / 2)
        // Just inside the room, so the "+" outside the wall never covers it.
        const [x, y] = [middle.x + wall.nx * text * 1.2, middle.y + wall.ny * text * 1.2]

        return (
          <text key={wall.index} x={x} y={y + text / 3} textAnchor="middle" fontSize={text} className="pointer-events-none fill-foreground" style={label} data-wall-length={wall.index}>
            {Math.round(wall.length)} cm
          </text>
        )
      })}
      {plan.outline.map((p, corner) => (
        <circle
          key={corner}
          cx={p.x}
          cy={p.y}
          r={size * 0.6}
          className="cursor-move fill-primary stroke-background"
          strokeWidth={3}
          data-shape-corner={corner}
          onPointerDown={(event) => onCorner(event, corner)}
        />
      ))}
      {plusAt && plusWall && (
        <g
          transform={`translate(${plusAt.x - plusWall.nx * (BUILDER.planWallCm + size)} ${plusAt.y - plusWall.ny * (BUILDER.planWallCm + size)})`}
          className="cursor-copy"
          data-shape-plus={plus!.wall}
          onPointerDown={onPlus}
        >
          <title>Drag to push out part of this wall, or into the room</title>
          <circle r={size * 0.75} className="fill-background stroke-primary" strokeWidth={3} />
          <path d={`M ${-size * 0.4} 0 H ${size * 0.4} M 0 ${-size * 0.4} V ${size * 0.4}`} className="stroke-primary" strokeWidth={3} />
        </g>
      )}
    </g>
  )
}
