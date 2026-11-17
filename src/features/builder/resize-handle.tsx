import type { PointerEvent as ReactPointerEvent } from "react"

/** The size of a resize handle's square, in centimetres of the drawing. */
const SIZE = 18

/**
 * The square at a chosen object's corner that resizes it from there.
 * @param props.corner - Which corner (its name, for tests) and the cursor that shows the direction.
 * @param props.x - The handle's center, across.
 * @param props.y - The handle's center, down.
 * @param props.onStart - Starts the resize.
 */
export function ResizeHandle({
  corner,
  x,
  y,
  onStart,
}: {
  corner: { name: string; cursor: string }
  x: number
  y: number
  onStart: (event: ReactPointerEvent) => void
}) {
  return (
    <rect
      x={x - SIZE / 2}
      y={y - SIZE / 2}
      width={SIZE}
      height={SIZE}
      rx={4}
      className={`${corner.cursor} fill-primary stroke-background`}
      strokeWidth={2}
      data-resize={corner.name}
      onPointerDown={onStart}
    />
  )
}
