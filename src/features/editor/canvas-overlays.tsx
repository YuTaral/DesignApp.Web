import type { PointerEvent as ReactPointerEvent } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { cn } from "cn"

import { OUTLINE_BRUSH_MODE, STROKE_SHAPE, type OutlineBrushMode, type StrokeShape } from "@/lib/constants"
import type { DrawnArea } from "./use-brush-stroke"

/**
 * The draggable before/after divider: the original photo shows to its left.
 * @param props.x - Its position, in CSS px from the canvas's left edge.
 * @param props.top - Top of the visible photo.
 * @param props.height - Height of the visible photo.
 * @param props.onMove - Called with the new x while dragging.
 */
export function CompareHandle({ x, top, height, onMove }: { x: number; top: number; height: number; onMove: (x: number) => void }) {
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    const bounds = event.currentTarget.parentElement!.getBoundingClientRect()

    onMove(event.clientX - bounds.left)
  }

  return (
    <div
      role="separator"
      aria-label="Before and after divider"
      aria-orientation="vertical"
      className="absolute z-10 w-8 -translate-x-1/2 cursor-ew-resize touch-none"
      style={{ left: x, top, height }}
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={drag}
    >
      <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]" />
      <span className="absolute top-3 right-full mr-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium shadow-soft">Before</span>
      <span className="absolute top-3 left-full ml-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium shadow-soft">After</span>
      <div className="absolute top-1/2 left-1/2 size-7 -translate-1/2 rounded-full border-2 border-white bg-black/30 shadow-float backdrop-blur" />
    </div>
  )
}

/**
 * The veil over the photo while objects are being removed.
 * @param props.removing - The names of the objects being removed.
 */
export function RemovingVeil({ removing }: { removing: readonly string[] }) {
  return (
    <div role="status" data-removing className="absolute inset-0 z-20 grid cursor-progress place-items-center bg-background/45 backdrop-blur-[2px]">
      <div className="flex max-w-[80%] items-center gap-2.5 rounded-xl bg-background/90 px-4 py-2.5 text-sm font-medium shadow-float">
        <LoaderCircleIcon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
        <span className="first-letter:uppercase">
          {removing.length === 1 ? `Removing the ${removing[0]}…` : `Removing the ${removing[0]} and ${removing.length - 1} more…`}
        </span>
      </div>
    </div>
  )
}

/**
 * The badge saying what a drag on the photo does while a brush is on, or that a stroke is being saved.
 * @param props.saving - Whether a stroke is being saved.
 * @param props.marking - Whether a new object is being marked (else an outline is fixed).
 * @param props.tool - Paint or erase.
 * @param props.shape - The brush shape.
 */
export function BrushBadge({ saving, marking, tool, shape }: { saving: boolean; marking: boolean; tool: OutlineBrushMode | null; shape: StrokeShape }) {
  const gesture = shape === STROKE_SHAPE.Box ? "drag a box over" : shape === STROKE_SHAPE.Lasso ? "draw around" : "drag over"
  const paint = tool === OUTLINE_BRUSH_MODE.Paint

  return (
    <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-background/85 px-2.5 py-1 text-xs font-medium shadow-soft backdrop-blur">
      {saving && <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />}
      {saving
        ? "Saving…"
        : marking
          ? paint ? `Marking: ${gesture} the new object` : `Unmarking: ${gesture} what isn't part of it`
          : paint ? `Adding: ${gesture} what's missing` : `Erasing: ${gesture} what's wrong`}
    </div>
  )
}

/**
 * The outline of a box or lasso being drawn, dashed when it erases.
 * @param props.area - The box or lasso, in CSS px of the canvas.
 * @param props.erase - Whether it erases.
 */
export function DrawnAreaOutline({ area, erase }: { area: DrawnArea; erase: boolean }) {
  return (
    <svg aria-hidden data-stroke-area={area.shape} className="pointer-events-none absolute inset-0 size-full">
      {[{ className: "stroke-black/45", width: 3.5 }, { className: "stroke-white", width: 1.5 }].map((line) => {
        const look = {
          className: cn(line.className, line.width < 2 && "fill-white/15"),
          fill: "none",
          strokeWidth: line.width,
          strokeDasharray: erase && line.width < 2 ? "5 4" : undefined,
        }

        return area.shape === STROKE_SHAPE.Box && area.points.length === 2 ? (
          <rect
            key={line.width}
            x={Math.min(area.points[0].x, area.points[1].x)}
            y={Math.min(area.points[0].y, area.points[1].y)}
            width={Math.abs(area.points[1].x - area.points[0].x)}
            height={Math.abs(area.points[1].y - area.points[0].y)}
            {...look}
          />
        ) : (
          <polygon key={line.width} points={area.points.map((p) => `${p.x},${p.y}`).join(" ")} strokeLinejoin="round" {...look} />
        )
      })}
    </svg>
  )
}

/**
 * The round brush under the pointer, dashed when it erases.
 * @param props.x - Its center, across, in CSS px of the canvas.
 * @param props.y - Its center, down.
 * @param props.size - Its diameter, in CSS px.
 * @param props.erase - Whether it erases.
 */
export function BrushCursor({ x, y, size, erase }: { x: number; y: number; size: number; erase: boolean }) {
  return (
    <div
      aria-hidden
      data-brush-cursor
      className={cn("pointer-events-none absolute rounded-full border-2 shadow-[0_0_0_1px_rgb(0_0_0/0.45)]", erase ? "border-dashed border-white" : "border-white")}
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}
    />
  )
}
