import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type SVGProps } from "react"
import { cn } from "cn"

import { BUILDER, ITEM_FORM, ITEM_SHAPE } from "@/lib/constants"
import type { CatalogObject, Plan, PlanItem } from "./api"
import { cornerOutline, footprint, hasParts, isMountedShape, isWallItem, isWallShape, partsOf, overlaps, toGrid, useBuilderStore } from "./builder-store"
import { cameraStand, fromWall, moveCorner, moveWall, pushSection, wallName, wallOf, wallPoint, walls, type OutlineWall } from "./room-outline"

/** Room around the walls in the drawing, in centimetres (for the walls' thickness and the handles). */
const MARGIN = 50

/** How thick the walls are drawn, in centimetres. */
const WALL = 14

/** Round or flat shapes that look the same from every side, so they get no front and back marks. */
const SIDELESS = new Set<string>([ITEM_SHAPE.Rug, ITEM_SHAPE.Plant, ITEM_SHAPE.Cylinder, ITEM_SHAPE.Lamp])

/**
 * What a pointer is doing: moving an object, resizing it from one of its corner handles (the opposite corner, `anchor`,
 * stays where it is, so the object grows towards the pointer), or resizing one of its parts.
 */
type Gesture = { kind: "move" | "resize" | Part; index: number; pointerId: number; offset: { x: number; y: number }; anchor: { x: number; y: number } }

/** The four corners of a footprint seen from above, as which way each lies from the middle. */
const CORNERS = [
  { name: "se", x: 1, y: 1, cursor: "cursor-nwse-resize" },
  { name: "nw", x: -1, y: -1, cursor: "cursor-nwse-resize" },
  { name: "ne", x: 1, y: -1, cursor: "cursor-nesw-resize" },
  { name: "sw", x: -1, y: 1, cursor: "cursor-nesw-resize" },
] as const

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

/** A part of an L- or P-shaped object that has its own handle: the back run, the corner leg or a P's chaise. */
type Part = "run" | "leg" | "chaise"

/**
 * The floor plan seen from above, to scale: the floor in its color inside the walls (the room's outline), a 50 cm grid, the objects as
 * their footprints in their colors (overlapping ones outlined in red), and the windows and doors in the walls. Dragging
 * an object moves it on the 10 cm grid, a corner handle resizes it from that corner, and objects dropped from the catalog land where
 * they are let go (windows, doors and hung things are placed in the Wall tab instead). Clicking a wall opens it in the Wall tab (`onWall`), and the
 * 3D view and the photo turn to look at it; the camera marker shows where the photo is taken from.
 *
 * In room shape mode (`shaping`) the objects fade and the walls are edited instead, on the 10 cm grid: dragging a wall
 * pushes or pulls it, dragging a corner moves it, and the "+" that follows the pointer along a wall pushes out (or in)
 * a section of it, for an L, T or U room or an alcove. Each wall shows its length.
 * @param props.plan - The room.
 * @param props.shaping - Whether the room's shape is being edited.
 * @param props.onWall - Opens a clicked wall in the Wall tab.
 */
export function PlanCanvas({ plan, shaping = false, onWall }: { plan: Plan; shaping?: boolean; onWall?: (wall: number) => void }) {
  const { selected, select, update, add, setRoom, reshape } = useBuilderStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const shapeGesture = useRef<ShapeGesture | null>(null)
  // Where the "+" for pushing out a section of a wall is, following the pointer along the wall.
  const [plus, setPlus] = useState<{ wall: number; along: number } | null>(null)
  // The drawing's frame held still while the shape is dragged (moved with the plan when its corner moves), so the wall
  // under the pointer follows it instead of the drawing rescaling under it; null when it fits the room.
  const [held, setHeld] = useState<{ x: number; y: number; width: number; length: number } | null>(null)
  const [roomWidth, roomLength] = [plan.width * 100, plan.length * 100]
  // Rugs first, so everything else is drawn on top of them; windows and doors are drawn with the walls.
  const order = plan.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isWallItem(item))
    .sort((a, b) => Number(b.item.shape === ITEM_SHAPE.Rug) - Number(a.item.shape === ITEM_SHAPE.Rug))
  const openings = plan.items.map((item, index) => ({ item, index })).filter(({ item }) => isWallItem(item))
  const clashing = new Set(plan.items.flatMap((a, i) => (plan.items.some((b, j) => i !== j && overlaps(a, b)) ? [i] : [])))
  const text = Math.max(10, Math.min(roomWidth, roomLength) / 28)

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

  const start = (event: ReactPointerEvent, index: number, kind: Gesture["kind"], corner = { x: 1, y: 1 }) => {
    event.stopPropagation()
    select(index)
    if (isWallItem(plan.items[index])) return
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
    const start = toPlan(event.clientX, event.clientY)
    shapeGesture.current = { kind, index, pointerId: event.pointerId, base: plan, start, ...section, shift: { x: 0, y: 0 } }
    setHeld({ x: -MARGIN, y: -MARGIN, width: roomWidth + 2 * MARGIN, length: roomLength + 2 * MARGIN })
    setPlus(null)
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
      setHeld({ x: -MARGIN + shift.x, y: -MARGIN + shift.y, width: g.base.width * 100 + 2 * MARGIN, length: g.base.length * 100 + 2 * MARGIN })
    }
  }

  const move = (event: ReactPointerEvent) => {
    const shaped = shapeGesture.current
    if (shaped && shaped.pointerId === event.pointerId) {
      moveShape(shaped, event)
      return
    }
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
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
    if (gesture.current?.pointerId === event.pointerId) gesture.current = null
    if (shapeGesture.current?.pointerId === event.pointerId) {
      shapeGesture.current = null
      setHeld(null)
    }
  }

  /**
   * Starts pushing out a section of a wall from its "+": a metre of it (less on a short wall) around the "+".
   * @param event - The pointer going down.
   */
  const startSection = (event: ReactPointerEvent) => {
    if (!plus) return
    const length = wallOf(plan, plus.wall).length
    const width = Math.min(BUILDER.sectionCm, length - 2 * BUILDER.minWallCm)
    if (width < BUILDER.minWallCm) return
    const from = Math.min(length - width, Math.max(0, toGrid(plus.along - width / 2)))
    startShape(event, "section", plus.wall, { from, to: from + width })
  }

  const drop = (event: DragEvent) => {
    const data = event.dataTransfer.getData(BUILDER.dragType)
    if (!data) return
    const object = JSON.parse(data) as CatalogObject
    // Windows, doors and hung things are placed on a wall seen straight on, in the Wall tab.
    if (isWallShape(object.shape)) return
    event.preventDefault()
    add(object, toPlan(event.clientX, event.clientY))
  }

  const floor = plan.outline.map((p) => `${p.x},${p.y}`).join(" ")

  return (
    <svg
      ref={svgRef}
      viewBox={held ? `${held.x} ${held.y} ${held.width} ${held.length}` : `${-MARGIN} ${-MARGIN} ${roomWidth + 2 * MARGIN} ${roomLength + 2 * MARGIN}`}
      className="size-full touch-none select-none"
      role="application"
      aria-label={
        shaping
          ? `Room shape, ${plan.width} by ${plan.length} metres. Drag a wall to push or pull it, drag a corner to move it, or drag the plus on a wall to push out part of it.`
          : `Floor plan, ${plan.width} by ${plan.length} metres. Drag objects to move them; drag a corner handle to resize from that corner. Click a wall to open it and look at it.`
      }
      data-shaping={shaping || undefined}
      onPointerLeave={() => setPlus(null)}
      data-plan-canvas
      onPointerDown={() => select(-1)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(BUILDER.dragType)) event.preventDefault()
      }}
      onDrop={drop}
    >
      <defs>
        <pattern id="plan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
        </pattern>
      </defs>
      {walls(plan).map((wall) => {
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
            onPointerDown={(event) => {
              if (shaping) {
                startShape(event, "wall", wall.index)
                return
              }
              event.stopPropagation()
              if (!viewed) setRoom({ view: wall.index })
              onWall?.(wall.index)
            }}
            onPointerMove={(event) => {
              if (!shaping || shapeGesture.current) return
              const point = toPlan(event.clientX, event.clientY)
              setPlus({ wall: wall.index, along: Math.min(wall.length, Math.max(0, fromWall(plan, wall.index, point.x, point.y).along)) })
            }}
          >
            <title>{shaping ? `Drag to push or pull the ${name.toLowerCase()}` : `Open the ${name.toLowerCase()} and look at it`}</title>
          </polygon>
        )
      })}
      <polygon points={floor} fill={plan.floorColor} data-plan-floor onPointerMove={() => shaping && !shapeGesture.current && setPlus(null)} />
      <polygon points={floor} fill="url(#plan-grid)" className="pointer-events-none text-foreground" />

      <g className={shaping ? "pointer-events-none opacity-40" : undefined}>
      {order.map(({ item, index }) => {
        const { width, depth } = footprint(item)
        const chosen = index === selected
        return (
          <g
            key={index}
            transform={`translate(${item.x} ${item.y})`}
            data-item={index}
            className="cursor-move"
            onPointerDown={(event) => start(event, index, "move")}
          >
            <Outline
              item={item}
              width={width}
              depth={depth}
              look={{
                fill: item.color,
                fillOpacity: item.shape === ITEM_SHAPE.Rug ? 0.75 : 0.95,
                strokeWidth: clashing.has(index) || chosen ? 4 : 1.5,
                className: clashing.has(index) ? "stroke-destructive" : chosen ? "stroke-primary" : "stroke-black/30",
                "data-clash": clashing.has(index) || undefined,
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
                <rect
                  key={corner.name}
                  x={(corner.x * width) / 2 - 9}
                  y={(corner.y * depth) / 2 - 9}
                  width={18}
                  height={18}
                  rx={4}
                  className={`${corner.cursor} fill-primary stroke-background`}
                  strokeWidth={2}
                  data-resize={corner.name}
                  onPointerDown={(event) => start(event, index, "resize", corner)}
                />
              ))}
            {chosen && hasParts(item) && <PartHandles item={item} onStart={(event, part) => start(event, index, part)} />}
          </g>
        )
      })}

      {openings.map(({ item, index }) =>
        isMountedShape(item.shape) ? (
          <Hung key={index} plan={plan} item={item as PlanItem & { wall: number }} index={index} chosen={index === selected} onSelect={(event) => start(event, index, "move")} />
        ) : (
          <Opening key={index} plan={plan} item={item as PlanItem & { wall: number }} index={index} chosen={index === selected} onSelect={(event) => start(event, index, "move")} />
        )
      )}

      </g>

      <Camera plan={plan} text={text} />
      {shaping && <ShapeHandles plan={plan} text={text} plus={plus} onCorner={(event, corner) => startShape(event, "corner", corner)} onPlus={startSection} />}
    </svg>
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
  if (item.form === ITEM_FORM.Round) return <ellipse rx={width / 2} ry={depth / 2} {...(look as SVGProps<SVGEllipseElement>)} />
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
  if (item.form === ITEM_FORM.PShaped) handles.push({ part: "chaise", x: w / 2 - chaiseWidth, y: d / 2 - cd, label: "Chaise size" })
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
function Opening({ plan, item, index, chosen, onSelect }: { plan: Plan; item: PlanItem & { wall: number }; index: number; chosen: boolean; onSelect: (event: ReactPointerEvent) => void }) {
  const wall = wallOf(plan, item.wall)
  const middle = wallPoint(plan, item.wall, item.x)
  const across = wall.dx !== 0
  // Its rectangle in the wall band, centered on the wall's line just outside the floor.
  const [cx, cy] = [middle.x - (wall.nx * WALL) / 2, middle.y - (wall.ny * WALL) / 2]
  const [w, h] = across ? [item.width, WALL] : [WALL, item.width]
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
function Hung({ plan, item, index, chosen, onSelect }: { plan: Plan; item: PlanItem & { wall: number }; index: number; chosen: boolean; onSelect: (event: ReactPointerEvent) => void }) {
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

/**
 * Where the photo is taken from: a camera across the room from the middle of the wall in view, or in a near corner
 * (`cameraStand`), pointing the way it looks. It is drawn half its size further that way, so it shows on the floor
 * rather than under the wall bands (the camera itself stands only 5 cm from the walls).
 * @param props.plan - The room.
 * @param props.text - The text size.
 */
function Camera({ plan, text }: { plan: Plan; text: number }) {
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
  const outer = (corner: { x: number; y: number }, other: OutlineWall) => ({ x: corner.x - (wall.nx + other.nx) * WALL, y: corner.y - (wall.ny + other.ny) * WALL })
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
function ShapeHandles({
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
          transform={`translate(${plusAt.x - plusWall.nx * (WALL + size)} ${plusAt.y - plusWall.ny * (WALL + size)})`}
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
