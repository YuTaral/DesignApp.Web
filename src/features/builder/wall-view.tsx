import { useMemo, useRef, type DragEvent, type PointerEvent as ReactPointerEvent } from "react"


import { ZoomButtons } from "@/components/zoom-buttons"
import { BUILDER, ITEM_SHAPE, WALL_FINISH, type WallFinish } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { allowCatalogDrop, droppedObject } from "./catalog-drag"
import { clashingItems, footprint, isMountedShape, isWallItem, isWallShape, useBuilderStore } from "./builder-store"
import { ResizeHandle } from "./resize-handle"
import { fromWall, seenFrom, wallLength, wallName, wallOf } from "./room-outline"
import { useViewZoom } from "./use-view-zoom"
import { WallChoice } from "./wall-choice"
import { WALL_TILE_METRES, wallSurface, wallTileUrl } from "./wall-texture"

/** Room around the wall in the drawing, in centimetres (for the measurements and the handles). */
const MARGIN = 60

/** How far from the wall a floor object may stand and still be drawn strongly, in centimetres. */
const NEAR = 40

/** A letter's average width as a share of the font size, to tell whether a label fits its object. */
const LETTER_WIDTH = 0.56

/** The fewest letters a shortened label keeps; with fewer it is left out. */
const MIN_LABEL_LETTERS = 4

/**
 * What a pointer is doing: moving a window or door, or resizing it from one of its corner handles. A resize keeps the
 * opposite corner (`anchor`, along the wall and up from the floor) where it was when it began, so the window grows
 * towards the pointer; measured from the item as it changed, a size the wall had to clamp moved it, and it shook.
 */
type Gesture = { kind: "move" | "resize"; index: number; pointerId: number; offset: { x: number; y: number }; anchor: { x: number; y: number } }

/** The corners of a window or door seen straight on, as which way each lies from its middle (up is +1). */
const CORNERS = [
  { name: "ne", x: 1, y: 1, cursor: "cursor-nesw-resize" },
  { name: "nw", x: -1, y: 1, cursor: "cursor-nwse-resize" },
  { name: "se", x: 1, y: -1, cursor: "cursor-nwse-resize" },
  { name: "sw", x: -1, y: -1, cursor: "cursor-nesw-resize" },
] as const

/**
 * One wall seen straight on, to scale: the wall in its color with the floor below, its windows and doors, every
 * object in front of the wall drawn where it stands (stronger the closer it is; those another wall hides are left out),
 * and in front of them what hangs on the wall (paintings, mirrors, cabinets). Dragging a window, door or hung object
 * moves it (a door stays on the floor), its corner handle resizes it, and the selected one shows its distance from the
 * wall's left corner and its height above the floor. Wall things dropped from the list land where they are let go.
 * @param props.plan - The room.
 * @param props.wall - The number of the wall shown.
 * @param props.onWall - Shows another wall.
 */
export function WallView({ plan, wall, onWall }: { plan: Plan; wall: number; onWall: (wall: number) => void }) {
  const { selected, select, update, add } = useBuilderStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [surface, color] = wallSurface(plan, wall)
  // The wall's finish as a repeating pattern (painted once per finish and color); plain paint is its color alone.
  const tile = useMemo(() => (surface === WALL_FINISH.Paint ? null : wallTileUrl(surface, color)), [surface, color])
  // Zoomed into this wall; another wall starts whole.
  const zoom = useViewZoom(
    { x: -MARGIN, y: -MARGIN, width: wallLength(plan, wall) + 2 * MARGIN, height: plan.height * 100 + 2 * MARGIN },
    svgRef,
    `${plan.id}-${wall}`
  )
  const { frame } = zoom
  const [length, height] = [wallLength(plan, wall), plan.height * 100]
  const tileCm = WALL_TILE_METRES * 100
  const skirting = BUILDER.scene.skirting.height * 100
  // Labels and handles keep their size on the screen as the wall zooms.
  const text = Math.max(10, Math.min(length, height) / 18) / zoom.scale
  const alongWall = wallOf(plan, wall).dx !== 0

  // Floor objects as the wall sees them, the farthest first so the nearest are drawn on top.
  const standing = plan.items
    .filter((item) => !isWallItem(item) && seenFrom(plan, wall, item.x, item.y))
    .map((item) => {
      const seen = fromWall(plan, wall, item.x, item.y)
      const size = footprint(item)
      const [across, deep] = alongWall ? [size.width, size.depth] : [size.depth, size.width]

      return { item, along: seen.along, across, gap: Math.max(0, seen.away - deep / 2) }
    })
    .sort((a, b) => b.gap - a.gap)
  const onThisWall = plan.items.map((item, index) => ({ item, index })).filter(({ item }) => item.wall === wall)
  // The wall's areas in their own finish, then its windows and doors, then what hangs on it.
  const zones = onThisWall.filter(({ item }) => item.shape === ITEM_SHAPE.WallZone)
  const openings = onThisWall.filter(({ item }) => !isMountedShape(item.shape) && item.shape !== ITEM_SHAPE.WallZone)
  const hung = onThisWall.filter(({ item }) => isMountedShape(item.shape))
  // Windows, doors and hung things covering one another, outlined in red.
  const clashing = clashingItems(plan)

  /**
   * A point of the screen in the wall's centimetres: along it from its left corner, and up from the floor.
   * @param clientX - Across, in CSS px.
   * @param clientY - Down, in CSS px.
   */
  const toWall = (clientX: number, clientY: number) => {
    const point = new DOMPoint(clientX, clientY).matrixTransform(svgRef.current!.getScreenCTM()!.inverse())

    return { x: point.x, y: height - point.y }
  }

  const start = (event: ReactPointerEvent, index: number, kind: Gesture["kind"], corner: { x: number; y: number } = { x: 1, y: 1 }) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    select(index)
    const item = plan.items[index]
    const point = toWall(event.clientX, event.clientY)
    const anchor = { x: item.x - (corner.x * item.width) / 2, y: corner.y > 0 ? item.elevation : item.elevation + item.height }

    gesture.current = { kind, index, pointerId: event.pointerId, offset: { x: point.x - item.x, y: point.y - item.elevation }, anchor }
  }

  const move = (event: ReactPointerEvent) => {
    const g = gesture.current

    if (!g || g.pointerId !== event.pointerId) {
      return
    }

    const item = plan.items[g.index]
    const point = toWall(event.clientX, event.clientY)

    if (g.kind === "move") {
      update(g.index, { x: point.x - g.offset.x, elevation: item.shape === ITEM_SHAPE.Door ? 0 : point.y - g.offset.y })

      return
    }

    // Resizing keeps the opposite corner where it began and grows towards the pointer, which stays between the wall's
    // ends and between the floor and the ceiling, so the wall never has to move the window to fit it.
    const { x: ax, y: ay } = g.anchor
    const [px, py] = [Math.min(length, Math.max(0, point.x)), Math.min(height, Math.max(0, point.y))]
    const width = Math.max(BUILDER.item.min, Math.abs(px - ax))
    const tall = Math.max(BUILDER.item.min, Math.abs(py - ay))
    const middle = ax + Math.sign(px - ax || 1) * (width / 2)
    const bottom = py >= ay ? ay : ay - tall

    update(g.index, { x: middle, elevation: item.shape === ITEM_SHAPE.Door ? 0 : Math.max(0, bottom), width, height: tall })
  }

  const end = (event: ReactPointerEvent) => {
    if (gesture.current?.pointerId === event.pointerId) {
      gesture.current = null
    }
  }

  const drop = (event: DragEvent) => {
    const object = droppedObject(event)

    if (!object || !isWallShape(object.shape)) {
      return
    }

    event.preventDefault()
    add(object, { wall, along: toWall(event.clientX, event.clientY).x })
  }

  const chosen = plan.items[selected]?.wall === wall ? plan.items[selected] : null

  return (
    <div className="flex size-full flex-col gap-2" data-wall-view={wall}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{wallName(plan, wall)}</span>
        <span className="text-muted-foreground tabular-nums">
          {Math.round(length)} × {Math.round(height)} cm
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <WallChoice plan={plan} value={wall} label="Wall shown" onPick={onWall} />
        </div>
      </div>
      <div className="relative min-h-0 w-full flex-1">
        <svg
          ref={svgRef}
          viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
          className="size-full touch-none select-none"
          style={{ cursor: zoom.scale > 1 ? "grab" : undefined }}
          role="application"
          aria-label={`${wallName(plan, wall)}, ${Math.round(length)} by ${Math.round(height)} centimetres. Drag a window or door to move it; drag a corner handle to resize it from that corner.`}
          onPointerDown={zoom.down}
          onPointerMove={(event) => zoom.moveOn(event, move)}
          onPointerUp={(event) => zoom.endOn(event, end, () => select(-1))}
          onPointerCancel={(event) => zoom.endOn(event, end)}
          onDragOver={allowCatalogDrop}
          onDrop={drop}
        >
          {tile && (
            <defs>
              <pattern id={`wall-finish-${wall}`} patternUnits="userSpaceOnUse" width={tileCm} height={tileCm} y={height}>
                <image href={tile} width={tileCm} height={tileCm} preserveAspectRatio="none" />
              </pattern>
            </defs>
          )}
          <rect
            x={0}
            y={0}
            width={length}
            height={height}
            fill={tile ? `url(#wall-finish-${wall})` : color}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="2"
            data-wall-finish-fill={surface}
          />
          {/* The skirting along the wall's foot, under the doors and windows drawn next. */}
          <rect x={0} y={height - skirting} width={length} height={skirting} fill={plan.finish.trimColor} className="pointer-events-none" data-skirting />
          <rect x={-12} y={height} width={length + 24} height={16} fill={plan.floorColor} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />

          {/* The wall's areas in their own finish, under everything else on it. */}
          {zones.map(({ item, index }) => (
            <WallZoneFace key={index} item={item} index={index} height={height} onStart={(event) => start(event, index, "move")} />
          ))}

          {/* Windows and doors first, so the room's objects stand in front of them. */}
          {openings.map(({ item, index }) => {
            const [left, top] = [item.x - item.width / 2, height - item.elevation - item.height]

            return (
              <g key={index} data-item={index} data-opening={item.shape} data-clash={clashing.has(index) || undefined} className="cursor-move" onPointerDown={(event) => start(event, index, "move")}>
                {item.shape === ITEM_SHAPE.Window ? (
                  <rect x={left} y={top} width={item.width} height={item.height} fill={BUILDER.scene.glass} stroke={item.color} strokeWidth={7} />
                ) : (
                  <>
                    <rect x={left} y={top} width={item.width} height={item.height} fill={item.color} stroke="black" strokeOpacity="0.35" strokeWidth={1.5} />
                    <circle cx={left + item.width - 14} cy={height - 100} r={4} fill={BUILDER.scene.metal} />
                  </>
                )}
                {clashing.has(index) && <rect x={left} y={top} width={item.width} height={item.height} fill="none" strokeWidth={4} className="pointer-events-none stroke-destructive" />}
              </g>
            )
          })}

          {/* The objects in front of the wall (clicks pass through them to the windows and doors behind). */}
          {standing.map(({ item, along, across, gap }, n) => {
            const label = item.height > text * 1.4 ? fitLabel(item.label, across, text * 0.8) : null
            // A label a nearer object (drawn later, on top) would cover is left out rather than shown cut.
            const middle = height - item.height / 2
            const covered =
              label !== null &&
              standing.slice(n + 1).some((near) => {
                const half = labelWidth(label, text * 0.8) / 2

                return near.along - near.across / 2 < along + half && near.along + near.across / 2 > along - half && height - near.item.height < middle + text / 2
              })

            return (
              <g key={n} className="pointer-events-none" opacity={gap <= NEAR ? 0.9 : Math.max(0.25, 0.7 - gap / 600)} data-wall-object>
                <rect x={along - across / 2} y={height - Math.max(item.height, 2)} width={across} height={Math.max(item.height, 2)} rx={3} fill={item.color} stroke="black" strokeOpacity="0.3" />
                {label && !covered && (
                  <text x={along} y={middle + text / 3} textAnchor="middle" fontSize={text * 0.8} className="fill-foreground" style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3, strokeOpacity: 0.7 }}>
                    {label}
                  </text>
                )}
              </g>
            )
          })}

          {/* What hangs on the wall, in front of the objects standing below it. */}
          {hung.map(({ item, index }) => (
            <HungFront key={index} item={item} index={index} height={height} text={text} clashing={clashing.has(index)} onStart={(event) => start(event, index, "move")} />
          ))}

          {/* The chosen window's, door's or hung object's outline and resize handle, above everything so they stay usable. */}
          {chosen && (
            <g data-item-chosen={selected}>
              <rect
                x={chosen.x - chosen.width / 2}
                y={height - chosen.elevation - chosen.height}
                width={chosen.width}
                height={chosen.height}
                fill="none"
                strokeWidth={4}
                className="pointer-events-none stroke-primary"
              />
              {CORNERS.filter((corner) => corner.y > 0 || chosen.shape !== ITEM_SHAPE.Door).map((corner) => (
                <ResizeHandle
                  key={corner.name}
                  corner={corner}
                  x={chosen.x + (corner.x * chosen.width) / 2}
                  y={height - chosen.elevation - (corner.y > 0 ? chosen.height : 0)}
                  onStart={(event) => start(event, selected, "resize", corner)}
                />
              ))}
            </g>
          )}

          {chosen && <Measurements item={chosen} height={height} text={text} />}
        </svg>
        <ZoomButtons zoom={zoom.scale} onStep={zoom.step} onFit={zoom.fit} fitLabel="Show the whole wall" />
      </div>
      {onThisWall.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing on this wall yet. Click a window, door or wall object in the list on the left, or drag it onto the wall.</p>
      )}
    </div>
  )
}

/**
 * An area of the wall in its own finish and color, seen straight on: its finish's pattern at its real size (plain paint
 * is its color), with a dashed edge. Dragging it moves it.
 * @param props.item - The area.
 * @param props.index - Its position in the plan's objects.
 * @param props.height - The wall's height, in centimetres.
 * @param props.onStart - Starts moving it.
 */
function WallZoneFace({ item, index, height, onStart }: { item: PlanItem; index: number; height: number; onStart: (event: ReactPointerEvent) => void }) {
  const finish = item.material as WallFinish
  const tileCm = WALL_TILE_METRES * 100
  const pattern = `wall-zone-${index}`
  const [left, top] = [item.x - item.width / 2, height - item.elevation - item.height]

  return (
    <g data-item={index} data-wall-zone={finish} className="cursor-move" onPointerDown={onStart}>
      {finish !== WALL_FINISH.Paint && (
        <defs>
          <pattern id={pattern} patternUnits="userSpaceOnUse" width={tileCm} height={tileCm} y={height}>
            <image href={wallTileUrl(finish, item.color)} width={tileCm} height={tileCm} preserveAspectRatio="none" />
          </pattern>
        </defs>
      )}
      <rect
        x={left}
        y={top}
        width={item.width}
        height={item.height}
        fill={finish === WALL_FINISH.Paint ? item.color : `url(#${pattern})`}
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth={1.5}
        strokeDasharray="10 6"
      />
    </g>
  )
}

/**
 * The selected window's or door's measurements: from the wall's left corner to its left edge, and from the floor to
 * its bottom.
 * @param props.item - The window or door.
 * @param props.height - The wall's height, in centimetres.
 * @param props.text - The text size.
 */
function Measurements({ item, height, text }: { item: { x: number; width: number; height: number; elevation: number }; height: number; text: number }) {
  const left = item.x - item.width / 2
  const middle = height - item.elevation - item.height / 2
  // A halo in the wall's own color keeps the numbers readable over the drawing.
  const style = { paintOrder: "stroke", stroke: "white", strokeWidth: 4, strokeOpacity: 0.8 } as const

  return (
    <g className="pointer-events-none" data-measurements>
      <line x1={0} y1={middle} x2={left} y2={middle} strokeWidth={2} strokeDasharray="6 4" className="stroke-primary" />
      <text x={left / 2} y={middle - 6} textAnchor="middle" fontSize={text} fill="black" style={style}>
        {Math.round(left)} cm
      </text>
      {item.elevation > 0 && (
        <>
          <line x1={item.x} y1={height} x2={item.x} y2={height - item.elevation} strokeWidth={2} strokeDasharray="6 4" className="stroke-primary" />
          <text x={item.x + 8} y={height - item.elevation / 2 + text / 3} fontSize={text} fill="black" style={style}>
            {Math.round(item.elevation)} cm
          </text>
        </>
      )}
      <text x={item.x} y={height - item.elevation - item.height - 14} textAnchor="middle" fontSize={text} fill="black" style={style}>
        {Math.round(item.width)} × {Math.round(item.height)} cm
      </text>
    </g>
  )
}

/**
 * A hung object seen straight on: a painting or pinboard in its frame, a mirror's glass, a TV's screen, or a cabinet,
 * shelf or hood with its seams, and its name when there is room.
 * @param props.item - The hung object.
 * @param props.index - Its position in the plan's objects.
 * @param props.height - The wall's height, in centimetres.
 * @param props.text - The text size.
 * @param props.clashing - Whether it covers another window, door or hung thing on the wall (then it is outlined in red).
 * @param props.onStart - Starts dragging it.
 */
function HungFront({
  item,
  index,
  height,
  text,
  clashing,
  onStart,
}: {
  item: PlanItem
  index: number
  height: number
  text: number
  clashing: boolean
  onStart: (event: ReactPointerEvent) => void
}) {
  const [left, top, w, h] = [item.x - item.width / 2, height - item.elevation - item.height, item.width, item.height]
  const name = item.label.toLowerCase()
  const frame = Math.min(6, w / 8, h / 8)
  const inner =
    item.shape !== ITEM_SHAPE.Picture
      ? null
      : name.includes(BUILDER.mirrorWord)
        ? BUILDER.scene.glass
        : name.split(/\W+/).includes(BUILDER.screenWord)
          ? "#1E1E1E"
          : BUILDER.scene.linen
  // A cabinet wider than a door gets one seam per 60 cm.
  const doors = item.shape === ITEM_SHAPE.WallBox && h > 20 ? Math.max(1, Math.round(w / 60)) : 1
  const label = h > text * 1.4 ? fitLabel(item.label, w, text * 0.8) : null

  return (
    <g data-item={index} data-hung={item.shape} data-clash={clashing || undefined} className="cursor-move" onPointerDown={onStart}>
      <rect
        x={left}
        y={top}
        width={w}
        height={h}
        rx={item.shape === ITEM_SHAPE.Picture ? 1 : 2}
        fill={item.color}
        stroke={clashing ? "var(--destructive)" : "black"}
        strokeOpacity={clashing ? 1 : 0.35}
        strokeWidth={clashing ? 4 : 1.5}
      />
      {inner && <rect x={left + frame} y={top + frame} width={w - 2 * frame} height={h - 2 * frame} fill={inner} className="pointer-events-none" />}
      {Array.from({ length: doors - 1 }, (_, n) => (
        <line key={n} x1={left + (w * (n + 1)) / doors} y1={top} x2={left + (w * (n + 1)) / doors} y2={top + h} stroke="black" strokeOpacity="0.3" className="pointer-events-none" />
      ))}
      {label && (
        <text x={item.x} y={top + h / 2 + text / 3} textAnchor="middle" fontSize={text * 0.8} className="pointer-events-none fill-foreground" style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3, strokeOpacity: 0.7 }}>
          {label}
        </text>
      )}
    </g>
  )
}

/**
 * About how wide a label is drawn, in the drawing's units (the app's font averages a little over half its size per
 * letter).
 * @param label - The words.
 * @param size - The font size.
 */
function labelWidth(label: string, size: number) {
  return label.length * size * LETTER_WIDTH
}

/**
 * A label that fits inside a box: whole, shortened with "…", or null when not even a few letters fit (better no label
 * than a cut one).
 * @param label - The words.
 * @param room - The box's width.
 * @param size - The font size.
 */
function fitLabel(label: string, room: number, size: number) {
  const space = room - size // a little margin on each side

  if (labelWidth(label, size) <= space) {
    return label
  }

  const letters = Math.floor(space / (size * LETTER_WIDTH)) - 1

  return letters >= MIN_LABEL_LETTERS ? `${label.slice(0, letters).trimEnd()}…` : null
}
