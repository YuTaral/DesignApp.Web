import type { DragEvent } from "react"

import { ITEM_SHAPE } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { allowCatalogDrop, droppedObject } from "./catalog-drag"
import { clashingItems, isMountedShape, isWallItem, isWallShape, useBuilderStore } from "./builder-store"
import { Hung, Opening, PlanObject } from "./plan-objects"
import { Camera, PlanWalls, ShapeHandles } from "./plan-room"
import { fromWall } from "./room-outline"
import { PLAN_MARGIN, usePlanGestures } from "./use-plan-gestures"

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
  const { selected, select, add, setRoom } = useBuilderStore()
  const { svgRef, toPlan, held, plus, setPlus, reshaping, start, startShape, startSection, move, end } = usePlanGestures(plan)
  const [roomWidth, roomLength] = [plan.width * 100, plan.length * 100]
  // Rugs first, so everything else is drawn on top of them; windows and doors are drawn with the walls.
  const order = plan.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isWallItem(item))
    .sort((a, b) => Number(b.item.shape === ITEM_SHAPE.Rug) - Number(a.item.shape === ITEM_SHAPE.Rug))
  const openings = plan.items.map((item, index) => ({ item, index })).filter(({ item }) => isWallItem(item))
  const clashing = clashingItems(plan)
  const text = Math.max(10, Math.min(roomWidth, roomLength) / 28)
  const floor = plan.outline.map((p) => `${p.x},${p.y}`).join(" ")

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
    <svg
      ref={svgRef}
      viewBox={held ? `${held.x} ${held.y} ${held.width} ${held.length}` : `${-PLAN_MARGIN} ${-PLAN_MARGIN} ${roomWidth + 2 * PLAN_MARGIN} ${roomLength + 2 * PLAN_MARGIN}`}
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
        {order.map(({ item, index }) => (
          <PlanObject
            key={index}
            item={item}
            index={index}
            chosen={index === selected}
            clashing={clashing.has(index)}
            text={text}
            onStart={(event, kind, corner) => start(event, index, kind, corner)}
          />
        ))}
        {openings.map(({ item, index }) => {
          const OnWall = isMountedShape(item.shape) ? Hung : Opening

          return (
            <OnWall
              key={index}
              plan={plan}
              item={item as PlanItem & { wall: number }}
              index={index}
              chosen={index === selected}
              clashing={clashing.has(index)}
              onSelect={(event) => start(event, index, "move")}
            />
          )
        })}
      </g>

      <Camera plan={plan} text={text} />
      {shaping && <ShapeHandles plan={plan} text={text} plus={plus} onCorner={(event, corner) => startShape(event, "corner", corner)} onPlus={startSection} />}
    </svg>
  )
}
