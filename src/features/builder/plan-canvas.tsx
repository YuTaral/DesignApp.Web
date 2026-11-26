import { useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react"
import { LayersIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ZoomButtons } from "@/components/zoom-buttons"
import { ITEM_SHAPE } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { allowCatalogDrop, droppedObject } from "./catalog-drag"
import { clashingItems, isMountedShape, isWallItem, isWallShape, useBuilderStore } from "./builder-store"
import { Hung, Opening, PlanObject, ZoneEdge } from "./plan-objects"
import { Camera, PlanWalls, ShapeHandles } from "./plan-room"
import { fromWall } from "./room-outline"
import { PLAN_MARGIN, usePlanGestures } from "./use-plan-gestures"
import { useViewZoom } from "./use-view-zoom"

/**
 * The floor plan seen from above, to scale: the floor in its color inside the walls (the room's outline), a 50 cm grid, the objects as
 * their footprints in their colors (overlapping ones outlined in red), and the windows and doors in the walls. Dragging
 * an object moves it on the 10 cm grid, a corner handle resizes it from that corner, and objects dropped from the catalog land where
 * they are let go (windows, doors and hung things are placed in the Wall tab instead). Clicking a wall opens it in the Wall tab (`onWall`), and the
 * 3D view and the photo turn to look at it; the camera marker shows where the photo is taken from. Hung things (upper
 * cabinets, shelves) are drawn on top but picked only where no floor object is under them; "Hung things only" fades the
 * floor objects so the hung ones can be picked anywhere.
 *
 * In room shape mode (`shaping`) the objects fade and the walls are edited instead, on the 10 cm grid: dragging a wall
 * pushes or pulls it, dragging a corner moves it, and the "+" that follows the pointer along a wall pushes out (or in)
 * a section of it, for an L, T or U room or an alcove. Each wall shows its length.
 * @param props.plan - The room.
 * @param props.shaping - Whether the room's shape is being edited.
 * @param props.onWall - Opens a clicked wall in the Wall tab.
 */
export function PlanCanvas({ plan, shaping = false, onWall }: { plan: Plan; shaping?: boolean; onWall?: (wall: number) => void }) {
  const { selected, select, add, setRoom } = useBuilderStore()
  const { svgRef, toPlan, held, plus, setPlus, reshaping, start, startShape, startSection, move, end } = usePlanGestures(plan)
  // Whether the floor objects are faded and let clicks through, to pick hung things over them.
  const [hungOnly, setHungOnly] = useState(false)
  // Zoomed into the room, or into the frame held still while the shape is dragged.
  const zoom = useViewZoom(
    held
      ? { x: held.x, y: held.y, width: held.width, height: held.length }
      : { x: -PLAN_MARGIN, y: -PLAN_MARGIN, width: plan.width * 100 + 2 * PLAN_MARGIN, height: plan.length * 100 + 2 * PLAN_MARGIN },
    svgRef,
    plan.id
  )
  const [roomWidth, roomLength] = [plan.width * 100, plan.length * 100]
  const { frame } = zoom
  // Floor areas first, then rugs, so everything else is drawn on top of them; then the areas' edges, so an area under a
  // rug can still be grabbed, and a selected area whole, with its handles; then the rest. Windows and doors are drawn
  // with the walls (a wall's areas are only in the Wall tab).
  const zoneUnder = (index: number) => (index === selected ? 1 : 3)
  const under = (shape: string, index: number) => (shape === ITEM_SHAPE.FloorZone ? zoneUnder(index) : shape === ITEM_SHAPE.Rug ? 2 : 0)
  const order = plan.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isWallItem(item))
    .sort((a, b) => under(b.item.shape, b.index) - under(a.item.shape, a.index))
  const flat = order.filter(({ item, index }) => under(item.shape, index) >= 2)
  const standing = order.filter(({ item, index }) => under(item.shape, index) < 2)
  const edges = flat.filter(({ item }) => item.shape === ITEM_SHAPE.FloorZone)
  const openings = plan.items.map((item, index) => ({ item, index })).filter(({ item }) => isWallItem(item) && item.shape !== ITEM_SHAPE.WallZone)
  const hung = openings.filter(({ item }) => isMountedShape(item.shape))
  const clashing = clashingItems(plan)
  const faded = hungOnly && !shaping ? "pointer-events-none opacity-30" : undefined
  // Labels and handles keep their size on the screen as the plan zooms.
  const text = Math.max(10, Math.min(roomWidth, roomLength) / 28) / zoom.scale
  const floor = plan.outline.map((p) => `${p.x},${p.y}`).join(" ")
  // A window or door on its wall; a hung object's mark seen on top, or the place under the standing objects that takes
  // its clicks.
  const mark = (item: PlanItem, index: number, part: "look" | "hit") => {
    const props = {
      plan, item: item as PlanItem & { wall: number }, index, chosen: index === selected, clashing: clashing.has(index),
      onSelect: (event: ReactPointerEvent) => start(event, index, "move"),
    }

    return isMountedShape(item.shape) ? <Hung key={`${part}-${index}`} {...props} part={part} /> : part === "look" ? <Opening key={index} {...props} /> : null
  }
  const drawn = ({ item, index }: { item: PlanItem; index: number }) => (
    <PlanObject
      key={index}
      item={item}
      index={index}
      chosen={index === selected}
      clashing={clashing.has(index)}
      text={text}
      onStart={(event, kind, corner) => start(event, index, kind, corner)}
    />
  )

  const drop = (event: DragEvent) => {
    const object = droppedObject(event)

    // Windows, doors and hung things are placed on a wall seen straight on, in the Wall tab.
    if (!object || isWallShape(object.shape)) {
      return
    }

    event.preventDefault()
    add(object, toPlan(event.clientX, event.clientY))
  }

  return (
    <div className="relative size-full">
      <svg
        ref={svgRef}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        className="size-full touch-none select-none"
        style={{ cursor: zoom.scale > 1 ? "grab" : undefined }}
        role="application"
        aria-label={
          shaping
            ? `Room shape, ${plan.width} by ${plan.length} metres. Drag a wall to push or pull it, drag a corner to move it, or drag the plus on a wall to push out part of it.`
            : `Floor plan, ${plan.width} by ${plan.length} metres. Drag objects to move them; drag a corner handle to resize from that corner. Click a wall to open it and look at it.`
        }
        data-shaping={shaping || undefined}
        onPointerLeave={() => setPlus(null)}
        data-plan-canvas
        onPointerDown={zoom.down}
        onPointerMove={(event) => zoom.moveOn(event, move)}
        onPointerUp={(event) => zoom.endOn(event, end, () => select(-1))}
        onPointerCancel={(event) => zoom.endOn(event, end)}
        onDragOver={allowCatalogDrop}
        onDrop={drop}
      >
        <defs>
          <pattern id="plan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
          </pattern>
        </defs>
        <PlanWalls
          plan={plan}
          shaping={shaping}
          onDown={(event, wall) => {
            if (shaping) {
              startShape(event, "wall", wall.index)

              return
            }

            event.stopPropagation()

            if (wall.index !== plan.view) {
              setRoom({ view: wall.index })
            }

            onWall?.(wall.index)
          }}
          onHover={(event, wall) => {
            if (!shaping || reshaping()) {
              return
            }

            const point = toPlan(event.clientX, event.clientY)

            setPlus({ wall: wall.index, along: Math.min(wall.length, Math.max(0, fromWall(plan, wall.index, point.x, point.y).along)) })
          }}
        />
        <polygon points={floor} fill={plan.floorColor} data-plan-floor onPointerMove={() => shaping && !reshaping() && setPlus(null)} />
        <polygon points={floor} fill="url(#plan-grid)" className="pointer-events-none text-foreground" />

        <g className={shaping ? "pointer-events-none opacity-40" : undefined}>
          <g className={faded}>
            {flat.map(drawn)}
            {edges.map(({ item, index }) => (
              <ZoneEdge key={index} item={item} index={index} text={text} onStart={(event) => start(event, index, "move")} />
            ))}
          </g>
          {hung.map(({ item, index }) => mark(item, index, "hit"))}
          <g className={faded} data-floor-objects>
            {standing.map(drawn)}
          </g>
          {openings.map(({ item, index }) => mark(item, index, "look"))}
        </g>

        <Camera plan={plan} text={text} />
        {shaping && <ShapeHandles plan={plan} text={text} plus={plus} onCorner={(event, corner) => startShape(event, "corner", corner)} onPlus={startSection} />}
      </svg>
      <ZoomButtons
        zoom={zoom.scale}
        onStep={zoom.step}
        onFit={zoom.fit}
        fitLabel="Show the whole plan"
        before={
          hung.length > 0 &&
          !shaping && (
            <Button
              variant={hungOnly ? "default" : "ghost"}
              size="sm"
              className="max-sm:size-7 max-sm:px-0"
              aria-pressed={hungOnly}
              aria-label="Hung things only"
              title="Fade the floor objects, to pick what hangs on the walls over them"
              onClick={() => {
                setHungOnly(!hungOnly)
                select(-1)
              }}
              data-plan-hung-only
            >
              <LayersIcon />
              <span className="max-sm:hidden">Hung things only</span>
            </Button>
          )
        }
      />
    </div>
  )
}
