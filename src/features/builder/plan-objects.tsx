import type { PointerEvent as ReactPointerEvent, SVGProps } from "react"

import { BUILDER, ITEM_FORM, ITEM_SHAPE } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { cornerOutline, footprint, hasParts, partsOf } from "./builder-store"
import { ResizeHandle } from "./resize-handle"
import { wallOf, wallPoint } from "./room-outline"
import type { Part } from "./use-plan-gestures"

/** Round or flat shapes that look the same from every side, so they get no front and back marks. */
const SIDELESS = new Set<string>([ITEM_SHAPE.Rug, ITEM_SHAPE.Plant, ITEM_SHAPE.Cylinder, ITEM_SHAPE.Lamp])

/** The four corners of a footprint seen from above, as which way each lies from the middle. */
const CORNERS = [
  { name: "se", x: 1, y: 1, cursor: "cursor-nwse-resize" },
  { name: "nw", x: -1, y: -1, cursor: "cursor-nwse-resize" },
  { name: "ne", x: 1, y: -1, cursor: "cursor-nesw-resize" },
  { name: "sw", x: -1, y: 1, cursor: "cursor-nesw-resize" },
] as const

/**
 * An object on the floor plan: its footprint in its color (outlined in red when it overlaps another), its name, its
 * front and back marks, and, when selected, its corner handles and part handles.
 * @param props.item - The object.
 * @param props.index - Its position in the plan's objects.
 * @param props.chosen - Whether it is selected.
 * @param props.clashing - Whether it overlaps another object.
 * @param props.text - The plan's label size, in centimetres.
 * @param props.onStart - Starts moving it, resizing it from a corner, or resizing one of its parts.
 */
export function PlanObject({
  item,
  index,
  chosen,
  clashing,
  text,
  onStart,
}: {
  item: PlanItem
  index: number
  chosen: boolean
  clashing: boolean
  text: number
  onStart: (event: ReactPointerEvent, kind: "move" | "resize" | Part, corner?: { x: number; y: number }) => void
}) {
  const { width, depth } = footprint(item)

  return (
    <g transform={`translate(${item.x} ${item.y})`} data-item={index} className="cursor-move" onPointerDown={(event) => onStart(event, "move")}>
      <Outline
        item={item}
        width={width}
        depth={depth}
        look={{
          fill: item.color,
          fillOpacity: item.shape === ITEM_SHAPE.Rug ? 0.75 : 0.95,
          strokeWidth: clashing || chosen ? 4 : 1.5,
          className: clashing ? "stroke-destructive" : chosen ? "stroke-primary" : "stroke-black/30",
          "data-clash": clashing || undefined,
          "data-form": item.form,
        }}
      />
      <text
        y={text / 3}
        textAnchor="middle"
        fontSize={labelSize(item, width, depth, text)}
        className="pointer-events-none fill-foreground"
        style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3, strokeOpacity: 0.7 }}
      >
        {item.label}
      </text>
      {!SIDELESS.has(item.shape) && item.form !== ITEM_FORM.Round && <FacingMarks item={item} width={width} depth={depth} text={text} />}
      {chosen &&
        CORNERS.map((corner) => (
          <ResizeHandle
            key={corner.name}
            corner={corner}
            x={(corner.x * width) / 2}
            y={(corner.y * depth) / 2}
            onStart={(event) => onStart(event, "resize", corner)}
          />
        ))}
      {chosen && hasParts(item) && <PartHandles item={item} onStart={(event, part) => onStart(event, part)} />}
    </g>
  )
}

/**
 * An object's outline from above, around its middle: an L (its run along the back and the leg at its right end before
 * turning), a P (an L whose leg widens into a chaise at its front end), an ellipse, or a rectangle (rounded off for round shapes).
 * @param props.item - The object.
 * @param props.width - Its footprint across, in centimetres (already turned).
 * @param props.depth - Its footprint down, in centimetres (already turned).
 * @param props.look - Its fill, stroke and data attributes.
 */
function Outline({ item, width, depth, look }: { item: PlanItem; width: number; depth: number; look: SVGProps<SVGElement> & Record<`data-${string}`, unknown> }) {
  if (item.form === ITEM_FORM.Round) {
    return <ellipse rx={width / 2} ry={depth / 2} {...(look as SVGProps<SVGEllipseElement>)} />
  }

  if (hasParts(item)) {
    // Drawn before turning from its parts, then turned like the object: SVG turns clockwise on screen, as the plan
    // does. Dashed lines show where the parts meet.
    const { runDepth: run, legWidth: leg, chaiseDepth } = partsOf(item)!
    const [w, d] = [item.width, item.depth]
    const cd = item.form === ITEM_FORM.PShaped ? chaiseDepth : 0

    return (
      <g transform={`rotate(${item.rotation})`}>
        <polygon points={cornerOutline(item).map((p) => p.join(",")).join(" ")} strokeLinejoin="round" {...(look as SVGProps<SVGPolygonElement>)} />
        <g className="pointer-events-none stroke-black/30" strokeDasharray="6 5" strokeWidth={1.5}>
          <line x1={w / 2 - leg} y1={-d / 2} x2={w / 2 - leg} y2={-d / 2 + run} />
          {cd > 0 && <line x1={w / 2 - leg} y1={d / 2 - cd} x2={w / 2} y2={d / 2 - cd} />}
        </g>
      </g>
    )
  }

  const round = item.shape === ITEM_SHAPE.Cylinder || item.shape === ITEM_SHAPE.Plant

  return <rect x={-width / 2} y={-depth / 2} width={width} height={depth} rx={round ? Math.min(width, depth) / 2 : 4} {...(look as SVGProps<SVGRectElement>)} />
}

/**
 * The handles of a selected L- or P-shaped object's parts, each resizing one part: on the back run's front edge (its
 * depth), on the corner leg's inner edge (its width) and, for a P, at the chaise's inner corner (its width and depth).
 * @param props.item - The object.
 * @param props.onStart - Starts dragging a part's handle.
 */
function PartHandles({ item, onStart }: { item: PlanItem; onStart: (event: ReactPointerEvent, part: Part) => void }) {
  const { runDepth: run, legWidth: leg, chaiseWidth, chaiseDepth } = partsOf(item)!
  const [w, d] = [item.width, item.depth]
  const cd = item.form === ITEM_FORM.PShaped ? chaiseDepth : 0
  const handles: { part: Part; x: number; y: number; label: string }[] = [
    { part: "run", x: -leg / 2, y: -d / 2 + run, label: "Back run depth" },
    { part: "leg", x: w / 2 - leg, y: (-d / 2 + run + d / 2 - cd) / 2, label: "Corner leg width" },
  ]

  if (item.form === ITEM_FORM.PShaped) {
    handles.push({ part: "chaise", x: w / 2 - chaiseWidth, y: d / 2 - cd, label: "Chaise size" })
  }

  return (
    <g transform={`rotate(${item.rotation})`}>
      {handles.map(({ part, x, y, label }) => (
        <circle
          key={part}
          cx={x}
          cy={y}
          r={8}
          className="cursor-move fill-background stroke-primary"
          strokeWidth={3}
          data-part-handle={part}
          aria-label={label}
          onPointerDown={(event) => onStart(event, part)}
        >
          <title>{label}: drag to resize this part</title>
        </circle>
      ))}
    </g>
  )
}

/**
 * Which way an object's front faces on the plan, as a unit step: down at rotation 0, left at 90, up at 180, right at 270.
 * @param item - The object.
 */
function facingOf(item: PlanItem) {
  const turn = (item.rotation * Math.PI) / 180

  return { x: -Math.round(Math.sin(turn)), y: Math.round(Math.cos(turn)) }
}

/**
 * The size of the front and back marks, in centimetres: a bit smaller than the labels, and small enough for the object.
 * @param width - The footprint across.
 * @param depth - The footprint down.
 * @param text - The plan's label size.
 */
function markSize(width: number, depth: number, text: number) {
  return Math.max(7, Math.min(text * 0.7, width / 3, depth / 3))
}

/**
 * The size of an object's name on the plan: as big as the plan's labels, small enough to fit across the object, and,
 * when its front and back marks sit at its left and right ends, small enough to fit between them.
 * @param item - The object.
 * @param width - The footprint across.
 * @param depth - The footprint down.
 * @param text - The plan's label size.
 */
function labelSize(item: PlanItem, width: number, depth: number, text: number) {
  const marked = !SIDELESS.has(item.shape) && item.form !== ITEM_FORM.Round && facingOf(item).x !== 0
  const room = marked ? Math.max(width / 3, width - 3 * markSize(width, depth, text)) : width

  return Math.min(text, (room / Math.max(4, item.label.length)) * 1.6)
}

/**
 * Small "F" and "B" marks inside an object's footprint, at the middle of its front and back edges, so its turn is
 * clear on the plan. At rotation 0 the front faces the plan's front wall (down), at 90 the left wall, at 180 the back
 * wall and at 270 the right wall.
 * @param props.item - The object.
 * @param props.width - Its footprint across, in centimetres (already turned).
 * @param props.depth - Its footprint down, in centimetres (already turned).
 * @param props.text - The plan's label size, in centimetres.
 */
function FacingMarks({ item, width, depth, text }: { item: PlanItem; width: number; depth: number; text: number }) {
  const facing = facingOf(item)
  const size = markSize(width, depth, text)
  // From the middle to just inside the front edge.
  const reach = Math.max(0, (facing.x !== 0 ? width : depth) / 2 - size * 0.75)
  const marks = [
    { letter: "F", sign: 1 },
    { letter: "B", sign: -1 },
  ]

  return (
    <g className="pointer-events-none" data-facing={item.rotation}>
      {marks.map(({ letter, sign }) => (
        <text
          key={letter}
          x={facing.x * reach * sign}
          y={facing.y * reach * sign}
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={size}
          fontWeight={700}
          className="fill-foreground"
          style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 2.5, strokeOpacity: 0.8 }}
          data-facing-mark={letter}
        >
          {letter}
        </text>
      ))}
    </g>
  )
}

/**
 * A window or door in its wall on the plan: glass in its frame color, or a door with the arc it opens along. Clicking
 * it selects it, and the page shows its wall.
 * @param props.plan - The room.
 * @param props.item - The window or door.
 * @param props.index - Its position in the plan's objects.
 * @param props.chosen - Whether it is selected.
 * @param props.onSelect - Selects it.
 */
export function Opening({ plan, item, index, chosen, onSelect }: { plan: Plan; item: PlanItem & { wall: number }; index: number; chosen: boolean; onSelect: (event: ReactPointerEvent) => void }) {
  const wall = wallOf(plan, item.wall)
  const middle = wallPoint(plan, item.wall, item.x)
  const across = wall.dx !== 0
  // Its rectangle in the wall band, centered on the wall's line just outside the floor.
  const [cx, cy] = [middle.x - (wall.nx * BUILDER.planWallCm) / 2, middle.y - (wall.ny * BUILDER.planWallCm) / 2]
  const [w, h] = across ? [item.width, BUILDER.planWallCm] : [BUILDER.planWallCm, item.width]
  // A door's swing: a quarter circle into the room from its hinge, at its left end seen from inside.
  const inward = [wall.nx, wall.ny]
  const hinge = wallPoint(plan, item.wall, item.x - item.width / 2)
  const reach = item.width
  const open = { x: hinge.x + inward[0] * reach, y: hinge.y + inward[1] * reach }
  const shut = { x: hinge.x + wall.dx * reach, y: hinge.y + wall.dy * reach }
  // The arc turns from the open leaf to the closed one the short way round (clockwise on screen when the cross is positive).
  const sweep = inward[0] * (shut.y - hinge.y) - inward[1] * (shut.x - hinge.x) > 0 ? 1 : 0

  return (
    <g data-item={index} data-opening={item.shape} className="cursor-pointer" onPointerDown={onSelect}>
      {item.shape === ITEM_SHAPE.Door && (
        <path
          d={`M ${hinge.x} ${hinge.y} L ${open.x} ${open.y} A ${reach} ${reach} 0 0 ${sweep} ${shut.x} ${shut.y}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeDasharray="6 5"
          className="pointer-events-none text-foreground"
        />
      )}
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        fill={item.shape === ITEM_SHAPE.Window ? BUILDER.scene.glass : item.color}
        stroke={item.shape === ITEM_SHAPE.Window ? item.color : "black"}
        strokeOpacity={item.shape === ITEM_SHAPE.Window ? 1 : 0.4}
        strokeWidth={chosen ? 0 : 3}
      />
      {chosen && <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill="none" strokeWidth={4} className="stroke-primary" />}
    </g>
  )
}

/**
 * A thing hung on a wall, seen from above: a strip along the wall as deep as it sticks out, in its color and dashed (it
 * hangs above the floor, so floor objects may stand under it). Clicking it selects it, and the page shows its wall.
 * @param props.plan - The room.
 * @param props.item - The hung object.
 * @param props.index - Its position in the plan's objects.
 * @param props.chosen - Whether it is selected.
 * @param props.onSelect - Selects it.
 */
export function Hung({ plan, item, index, chosen, onSelect }: { plan: Plan; item: PlanItem & { wall: number }; index: number; chosen: boolean; onSelect: (event: ReactPointerEvent) => void }) {
  const wall = wallOf(plan, item.wall)
  const [a, b] = [wallPoint(plan, item.wall, item.x - item.width / 2), wallPoint(plan, item.wall, item.x + item.width / 2)]
  // At least a few centimetres deep, so a flat picture can still be seen and clicked.
  const deep = Math.max(item.depth, 8)
  const corners = [a, b, { x: b.x + wall.nx * deep, y: b.y + wall.ny * deep }, { x: a.x + wall.nx * deep, y: a.y + wall.ny * deep }]

  return (
    <g data-item={index} data-hung={item.shape} className="cursor-pointer" onPointerDown={onSelect}>
      <polygon
        points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={item.color}
        fillOpacity={0.75}
        strokeDasharray="5 4"
        strokeWidth={chosen ? 4 : 2}
        className={chosen ? "stroke-primary" : "stroke-black/40"}
      >
        <title>{`${item.label}, ${Math.round(item.elevation)} cm above the floor`}</title>
      </polygon>
    </g>
  )
}
