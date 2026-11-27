import { BACKSPLASH, BUILDER, COVERING_KIND, CURTAIN_LENGTH, WALL_FINISH, type TilePattern } from "@/lib/constants"
import type { Worktop, WindowCovering } from "./api"
import { isCurtains } from "./covering"
import { wallTileUrl } from "./wall-texture"
import { ownSplashColor, SPLASH_TILE_METRES } from "./worktop"

/**
 * A window's curtains or blinds in the Wall tab, as the 3D view draws them, in the wall's centimetres (y down from the
 * ceiling, the floor at `floor`): curtains from a rod above the window, past its sides as far as the wall goes, to the
 * sill or the floor, a folded panel at each side and sheers across; a roller or Roman blind over the glass's top half;
 * venetian or vertical blinds in slats. Clicks pass through it to the window.
 * @param props.covering - What the window is dressed with.
 * @param props.left - The window's left side.
 * @param props.top - Its top.
 * @param props.width - Its width.
 * @param props.height - Its height.
 * @param props.floor - Where the floor is.
 * @param props.room - How much wall there is beside the window, to the left and to the right.
 */
export function WindowDressing({
  covering,
  left,
  top,
  width,
  height,
  floor,
  room,
}: {
  covering: WindowCovering
  left: number
  top: number
  width: number
  height: number
  floor: number
  room: { left: number; right: number }
}) {
  const C = BUILDER.scene.coverings
  const bottom = top + height
  // The blind sits inside the frame and comes down part of the way.
  const [inner, innerLeft, drop] = [width - 4, left + 2, height * C.blindShare]
  const folds = [1, 2].map((fold) => top + (drop / 3) * fold)

  if (isCurtains(covering.kind)) {
    const reach = (space: number) => Math.min(C.rodPast * 100, Math.max(0, space - C.rodGap * 100))
    const [rodLeft, rodRight] = [left - reach(room.left), left + width + reach(room.right)]
    const rod = top - C.rodAbove * 100
    const end = covering.length === CURTAIN_LENGTH.Floor ? floor - 2 : Math.min(floor - 2, bottom + C.belowSill * 100)
    const side = Math.max(C.minPanel * 100, width * C.panelShare)
    const sheer = covering.kind === COVERING_KIND.Sheers ? covering.color : C.sheer
    const panels = [rodLeft, rodRight - side]

    return (
      <g className="pointer-events-none" data-wall-covering={covering.kind}>
        {covering.kind !== COVERING_KIND.Curtains && (
          <rect x={rodLeft} y={rod} width={rodRight - rodLeft} height={end - rod} fill={sheer} opacity={C.sheerOpacity} />
        )}
        {covering.kind !== COVERING_KIND.Sheers &&
          panels.map((x) => (
            <g key={x}>
              <rect x={x} y={rod} width={side} height={end - rod} fill={covering.color} stroke="black" strokeOpacity="0.2" />
              {Array.from({ length: C.folds }, (_, fold) => (
                <line key={fold} x1={x + (side * (fold + 0.5)) / C.folds} y1={rod} x2={x + (side * (fold + 0.5)) / C.folds} y2={end} stroke="black" strokeOpacity="0.12" strokeWidth={1.5} />
              ))}
            </g>
          ))}
        <line x1={rodLeft} y1={rod} x2={rodRight} y2={rod} stroke={BUILDER.scene.metal} strokeWidth={3} strokeLinecap="round" />
      </g>
    )
  }

  return (
    <g className="pointer-events-none" data-wall-covering={covering.kind}>
      {covering.kind === COVERING_KIND.RollerBlind || covering.kind === COVERING_KIND.RomanBlind ? (
        <>
          <rect x={innerLeft} y={top} width={inner} height={drop} fill={covering.color} stroke="black" strokeOpacity="0.2" />
          {covering.kind === COVERING_KIND.RomanBlind
            ? folds.map((y) => <line key={y} x1={innerLeft} y1={y} x2={innerLeft + inner} y2={y} stroke="black" strokeOpacity="0.18" strokeWidth={1.5} />)
            : <rect x={innerLeft} y={top - 3} width={inner} height={6} rx={3} fill={covering.color} stroke="black" strokeOpacity="0.3" />}
        </>
      ) : covering.kind === COVERING_KIND.VenetianBlind ? (
        Array.from({ length: Math.floor(height / (C.slat * 100)) }, (_, slat) => (
          <rect key={slat} x={innerLeft} y={top + slat * C.slat * 100 + 1} width={inner} height={C.slat * 60} fill={covering.color} />
        ))
      ) : (
        Array.from({ length: Math.floor(inner / (C.verticalSlat * 100)) }, (_, slat) => (
          <rect key={slat} x={innerLeft + slat * C.verticalSlat * 100 + 1} y={top} width={C.verticalSlat * 60} height={height} fill={covering.color} />
        ))
      )}
    </g>
  )
}

/**
 * A kitchen unit's backsplash on the wall behind it, in the Wall tab: the worktop's material or tiles or glass in their
 * own color, from the worktop up; tiles laid in the room's pattern, as the 3D view paints them.
 * @param props.worktop - The unit's worktop.
 * @param props.left - The unit's left side along the wall.
 * @param props.width - Its width.
 * @param props.top - Where the backsplash ends, above.
 * @param props.bottom - Where it starts: the worktop's top.
 * @param props.id - An id for its tiles' pattern, unique in the drawing.
 * @param props.pattern - How the room's tiles are laid.
 */
export function Backsplash({
  worktop,
  left,
  width,
  top,
  bottom,
  id,
  pattern,
}: {
  worktop: Worktop
  left: number
  width: number
  top: number
  bottom: number
  id: string
  pattern: TilePattern
}) {
  const color = ownSplashColor(worktop) ? worktop.backsplashColor : worktop.color
  const tileCm = SPLASH_TILE_METRES * 100

  return (
    <g className="pointer-events-none" data-wall-backsplash={worktop.backsplash} data-tile-pattern={worktop.backsplash === BACKSPLASH.Tiles ? pattern : undefined}>
      <rect x={left} y={top} width={width} height={bottom - top} fill={color} stroke="black" strokeOpacity="0.2" />
      {worktop.backsplash === BACKSPLASH.Tiles && (
        <>
          <defs>
            <pattern id={id} patternUnits="userSpaceOnUse" width={tileCm} height={tileCm} y={bottom}>
              <image href={wallTileUrl(WALL_FINISH.Tiles, color, undefined, pattern)} width={tileCm} height={tileCm} preserveAspectRatio="none" />
            </pattern>
          </defs>
          <rect x={left} y={top} width={width} height={bottom - top} fill={`url(#${id})`} />
        </>
      )}
      {worktop.backsplash === BACKSPLASH.Glass && <rect x={left} y={top} width={width} height={(bottom - top) / 3} fill="white" opacity={0.25} />}
    </g>
  )
}
