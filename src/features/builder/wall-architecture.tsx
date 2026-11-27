import { BUILDER, WAINSCOT } from "@/lib/constants"
import type { Plan, PlanItem } from "./api"
import { shade } from "./floor-texture"
import { archedPath, archRadius, casingFor, trimBands, trimRuns } from "./trim"

/**
 * The trim along the wall the Wall tab shows, in the room's trim color, stopping at its doors, archways and windows
 * (and their casings): the wainscoting (its panels or beadboard's grooves drawn as lines), its cap or the dado rail,
 * the picture rail and the crown. Drawn over the wall's finish, under its windows and doors.
 * @param props.plan - The room.
 * @param props.wall - The wall's number.
 * @param props.height - The wall's height in cm (the drawing's floor line).
 */
export function WallTrim({ plan, wall, height }: { plan: Plan; wall: number; height: number }) {
  const { wainscot } = plan.finish.details
  const trimColor = plan.finish.trimColor
  const line = shade(trimColor, 0.7)
  const skirting = BUILDER.scene.skirting.height * 100
  const { frame, board } = BUILDER.scene.trim.panel
  const top = height - BUILDER.wainscotHeight

  return (
    <g className="pointer-events-none" data-trim={plan.finish.details.mouldings.join(" ") || "none"}>
      {wainscot !== WAINSCOT.None &&
        trimRuns(plan, wall, 0, BUILDER.wainscotHeight).map(([from, to]) => {
          const width = to - from
          const panels = Math.max(1, Math.round(width / 60))
          const each = (width - (panels + 1) * frame * 100) / panels

          return (
            <g key={from} data-wainscot={wainscot}>
              <rect x={from} y={top} width={width} height={BUILDER.wainscotHeight - skirting} fill={trimColor} stroke={line} strokeWidth={1} />
              {wainscot === WAINSCOT.Beadboard
                ? Array.from({ length: Math.max(0, Math.floor(width / (board * 100)) - 1) }, (_, n) => (
                    <line key={n} x1={from + (n + 1) * board * 100} y1={top} x2={from + (n + 1) * board * 100} y2={height - skirting} stroke={line} strokeWidth={0.8} />
                  ))
                : Array.from({ length: panels }, (_, n) => (
                    <rect
                      key={n}
                      x={from + frame * 100 + n * (each + frame * 100)}
                      y={top + frame * 100}
                      width={Math.max(0, each)}
                      height={Math.max(0, BUILDER.wainscotHeight - skirting - 2 * frame * 100)}
                      fill="none"
                      stroke={line}
                      strokeWidth={1}
                      rx={wainscot === WAINSCOT.RaisedPanels ? 2 : 0}
                    />
                  ))}
            </g>
          )
        })}
      {trimBands(plan).flatMap((band) =>
        trimRuns(plan, wall, band.bottom, band.bottom + band.height).map(([from, to]) => (
          <rect key={`${band.kind}-${from}`} x={from} y={height - band.bottom - band.height} width={to - from} height={band.height} fill={trimColor} stroke={line} strokeWidth={1} data-band={band.kind} />
        ))
      )}
    </g>
  )
}

/**
 * The casing around a door, window or archway on the Wall tab, in the room's trim color and its width for the room's
 * casing style (narrower next to a corner), drawn behind the opening (round over an arched one); nothing for plain reveals.
 * @param props.plan - The room.
 * @param props.item - The opening.
 * @param props.height - The wall's height in cm (the drawing's floor line).
 */
export function OpeningCasing({ plan, item, height }: { plan: Plan; item: PlanItem; height: number }) {
  const width = casingFor(plan, item)
  const [left, top] = [item.x - item.width / 2 - width, height - item.elevation - item.height - width]
  const arch = archRadius(item)

  if (width <= 0) {
    return null
  }

  return (
    <path
      d={archedPath(left, top, item.width + 2 * width, item.height + width, arch > 0 ? arch + width : 0)}
      fill={plan.finish.trimColor}
      stroke={shade(plan.finish.trimColor, 0.7)}
      strokeWidth={1}
      className="pointer-events-none"
      data-casing={plan.finish.details.casing}
    />
  )
}

/**
 * An archway on the Wall tab: the dim space beyond, square or under its arch, inside a reveal in its color.
 * @param props.item - The archway.
 * @param props.height - The wall's height in cm (the drawing's floor line).
 */
export function ArchwayFace({ item, height }: { item: PlanItem; height: number }) {
  const [left, top] = [item.x - item.width / 2, height - item.elevation - item.height]

  return (
    <path
      d={archedPath(left, top, item.width, item.height, archRadius(item))}
      fill={BUILDER.scene.trim.beyond}
      stroke={item.color}
      strokeWidth={6}
      data-archway
    />
  )
}

/**
 * A niche on the Wall tab: its darker inside, square or under its arch, a shadow under its top and down its left
 * side, and its shelves' front edges if it has them.
 * @param props.item - The niche.
 * @param props.height - The wall's height in cm (the drawing's floor line).
 */
export function NicheFace({ item, height }: { item: PlanItem; height: number }) {
  const [left, top, w, h] = [item.x - item.width / 2, height - item.elevation - item.height, item.width, item.height]
  const arch = archRadius(item)
  const recess = BUILDER.scene.trim.recessShade
  const shelves = /shel/i.test(item.label) ? Math.max(1, Math.floor(h / 40)) : 0

  return (
    <g data-niche>
      <path d={archedPath(left, top, w, h, arch)} fill={shade(item.color, recess)} stroke={item.color} strokeWidth={4} />
      <rect x={left + 2} y={top + arch} width={4} height={h - arch - 2} fill={shade(item.color, recess * 0.8)} className="pointer-events-none" />
      {Array.from({ length: shelves }, (_, n) => (
        <rect key={n} x={left} y={top + arch + ((h - arch) * (n + 1)) / (shelves + 1)} width={w} height={2.5} fill={item.color} className="pointer-events-none" />
      ))}
    </g>
  )
}
