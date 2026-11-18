import { BUILDER, PLAN_SIDE, PLAN_SIDE_NAMES, VIEW_CORNER, type PlanSide, type ViewCorner } from "@/lib/constants"
import type { OutlinePoint, Plan } from "./api"

/** The part of a room its walls come from. */
type Shaped = Pick<Plan, "outline">

/**
 * One wall of a room's outline (mirrors the API's OutlineWall): from one corner to the next going clockwise on the plan
 * (y down). Along it runs from its start, its left end seen from inside the room facing it; its normal points into the
 * room.
 */
export type OutlineWall = {
  /** Its number: walls are numbered clockwise from the top-left corner. */
  index: number
  /** Its first corner. */
  start: OutlinePoint
  /** Its last corner. */
  end: OutlinePoint
  /** Its direction across the plan: 1, -1, or 0 when it runs down the plan. */
  dx: number
  /** Its direction down the plan: 1, -1, or 0 when it runs across the plan. */
  dy: number
  /** Its length, in centimetres. */
  length: number
  /** Its normal into the room, across the plan. */
  nx: number
  /** Its normal into the room, down the plan. */
  ny: number
  /** The side of the plan it faces from: running right it is a back wall, down a right wall, and so on. */
  side: PlanSide
}

/**
 * A rectangular room's outline, its walls numbered back, right, front, left.
 * @param width - Its width, in metres.
 * @param length - Its length, in metres.
 */
export function rectangle(width: number, length: number): OutlinePoint[] {
  const [w, l] = [Math.round(width * 100), Math.round(length * 100)]

  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }]
}

/**
 * A room's walls, in order.
 * @param plan - The room.
 */
export function walls(plan: Shaped): OutlineWall[] {
  const points = plan.outline

  return points.map((start, index) => {
    const end = points[(index + 1) % points.length]
    const [dx, dy] = [Math.sign(end.x - start.x), Math.sign(end.y - start.y)]
    const side = dx === 1 ? PLAN_SIDE.Back : dy === 1 ? PLAN_SIDE.Right : dx === -1 ? PLAN_SIDE.Front : PLAN_SIDE.Left

    return { index, start, end, dx, dy, length: Math.abs(end.x - start.x) + Math.abs(end.y - start.y), nx: -dy, ny: dx, side }
  })
}

/**
 * One of a room's walls; the first when the number is out of range.
 * @param plan - The room.
 * @param wall - The wall's number.
 */
export function wallOf(plan: Shaped, wall: number): OutlineWall {
  const all = walls(plan)

  return all[wall] ?? all[0]
}

/**
 * How long a wall is, in centimetres.
 * @param plan - The room.
 * @param wall - The wall's number.
 */
export function wallLength(plan: Shaped, wall: number) {
  return wallOf(plan, wall).length
}

/**
 * A point along a wall on the floor plan, in centimetres from the plan's top-left corner.
 * @param plan - The room.
 * @param wall - The wall's number.
 * @param along - From the wall's left end as seen from inside the room facing it.
 */
export function wallPoint(plan: Shaped, wall: number, along: number) {
  const { start, dx, dy } = wallOf(plan, wall)

  return { x: start.x + dx * along, y: start.y + dy * along }
}

/**
 * A point of the floor plan seen from a wall: how far along the wall it is (from its left end, facing it), and how far
 * it is from the wall's line into the room.
 * @param plan - The room.
 * @param wall - The wall's number.
 * @param x - Across the plan, in centimetres.
 * @param y - Down the plan, in centimetres.
 */
export function fromWall(plan: Shaped, wall: number, x: number, y: number) {
  const { start, dx, dy, nx, ny } = wallOf(plan, wall)
  const [rx, ry] = [x - start.x, y - start.y]

  return { along: rx * dx + ry * dy, away: rx * nx + ry * ny }
}

/**
 * The wall nearest a point of the floor plan, and where along it the point is (kept between its ends).
 * @param plan - The room.
 * @param x - Across the plan, in centimetres.
 * @param y - Down the plan, in centimetres.
 */
export function nearestWall(plan: Shaped, x: number, y: number) {
  const seen = walls(plan).map((wall) => {
    const { along, away } = fromWall(plan, wall.index, x, y)
    const kept = Math.min(wall.length, Math.max(0, along))

    return { wall: wall.index, along: kept, distance: Math.hypot(along - kept, away) }
  })
  const nearest = seen.reduce((a, b) => (b.distance < a.distance ? b : a))

  return { wall: nearest.wall, along: nearest.along }
}

/**
 * A wall's name as the user reads it: the side of the plan it is on ("Back wall"), numbered in order when the room has
 * more than one wall on that side ("Right wall 2").
 * @param plan - The room.
 * @param wall - The wall's number.
 */
export function wallName(plan: Shaped, wall: number) {
  const all = walls(plan)
  const own = all[wall] ?? all[0]
  const same = all.filter((w) => w.side === own.side)
  const name = PLAN_SIDE_NAMES[own.side]

  return same.length > 1 ? `${name} ${same.indexOf(own) + 1}` : name
}

/**
 * Whether a point of the plan is inside the room (on a wall counts as inside).
 * @param plan - The room.
 * @param x - Across the plan, in centimetres.
 * @param y - Down the plan, in centimetres.
 */
export function contains(plan: Shaped, x: number, y: number) {
  const all = walls(plan)
  const onWall = all.some((w) => between(x, w.start.x, w.end.x) && between(y, w.start.y, w.end.y))

  if (onWall) {
    return true
  }

  // Count the walls running down the plan that a ray to the right crosses.
  const crossings = all.filter((w) => w.dx === 0 && w.start.x > x && y >= Math.min(w.start.y, w.end.y) && y < Math.max(w.start.y, w.end.y))

  return crossings.length % 2 === 1
}

/**
 * Where the photo is taken from (mirrors the API's PlanPrompt frame): from the middle of the wall in view, straight
 * across the room to the wall facing it, and a little in front of that wall (for a rectangle, the middle of the
 * opposite wall). From a corner (`plan.corner`) it stands at that wall's left or right end instead, a little in from
 * the side wall too, turned towards the room. From the spot (`plan.cameraSpot`, where the photo the plan was read from
 * was taken) it stands there, turned towards the middle of the wall in view; without a spot in front of that wall it
 * stands in the middle.
 * @param plan - The room.
 * @returns The point in plan centimetres; the way it looks (`lookX`, `lookY`, a unit step on the plan); how far away
 *   the wall in view is (`deep`) and how far from it the camera stands (`stand`); how wide the room is across the view
 *   (`across`); the wall behind the camera; and where it stands (`corner`).
 */
export function cameraStand(plan: Shaped & Pick<Plan, "view"> & Partial<Pick<Plan, "corner" | "cameraSpot">>) {
  const all = walls(plan)
  const view = all[plan.view] ?? all[0]
  const middle = { x: (view.start.x + view.end.x) / 2, y: (view.start.y + view.end.y) / 2 }
  // The nearest other wall straight in front of the wall in view (it faces back at it).
  const facing = all
    .filter((w) => w.dx === -view.dx && w.dy === -view.dy)
    .map((w) => ({ wall: w, distance: (w.start.x - middle.x) * view.nx + (w.start.y - middle.y) * view.ny }))
    .filter(({ wall, distance }) => distance > 0 && (view.dx !== 0 ? between(middle.x, wall.start.x, wall.end.x) : between(middle.y, wall.start.y, wall.end.y)))
    .sort((a, b) => a.distance - b.distance)[0]
  const deep = facing?.distance ?? 100
  const inset = BUILDER.scene.inset * 100
  const xs = plan.outline.map((p) => p.x)
  const ys = plan.outline.map((p) => p.y)
  const across = view.dx !== 0 ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys)
  // Along the wall in view (the photo's right), from its left end.
  const along = (p: { x: number; y: number }) => (p.x - view.start.x) * view.dx + (p.y - view.start.y) * view.dy
  const spot = plan.corner === VIEW_CORNER.Spot ? plan.cameraSpot : null
  // How far in front of the wall in view the spot is: a spot on or behind it isn't used.
  const ahead = spot ? (spot.x - view.start.x) * view.nx + (spot.y - view.start.y) * view.ny : 0
  const corner = plan.corner === VIEW_CORNER.Spot && ahead <= inset ? VIEW_CORNER.None : (plan.corner ?? VIEW_CORNER.None)
  // Turned to the right (towards the room) from the left corner, to the left from the right one.
  const turn = DEGREE * (corner === VIEW_CORNER.Left ? BUILDER.scene.cornerTurn : corner === VIEW_CORNER.Right ? -BUILDER.scene.cornerTurn : 0)
  const stand = corner === VIEW_CORNER.Spot ? ahead : deep - inset
  let at = along(middle)

  if (spot && corner === VIEW_CORNER.Spot) {
    // From the spot, turned towards the wall's middle.
    const [toX, toY] = [middle.x - spot.x, middle.y - spot.y]
    const length = Math.hypot(toX, toY)

    return { x: spot.x, y: spot.y, lookX: toX / length, lookY: toY / length, deep, stand, across, behind: facing?.wall.index ?? -1, corner }
  }

  if (corner === VIEW_CORNER.Left || corner === VIEW_CORNER.Right) {
    // The near wall's ends (the room's sides when there is none), a little in from the side wall.
    const ends = facing ? [along(facing.wall.start), along(facing.wall.end)] : plan.outline.map(along)

    at = corner === VIEW_CORNER.Left ? Math.min(...ends) + inset : Math.max(...ends) - inset
  }

  return {
    x: view.start.x + view.dx * at + view.nx * stand,
    y: view.start.y + view.dy * at + view.ny * stand,
    lookX: -view.nx * Math.cos(turn) + view.dx * Math.sin(turn),
    lookY: -view.ny * Math.cos(turn) + view.dy * Math.sin(turn),
    deep,
    stand,
    across,
    behind: facing?.wall.index ?? -1,
    corner,
  }
}

/**
 * Where the camera can stand to look at a wall: across from its middle and in the near corners, and at the camera spot
 * when the room has one.
 * @param spot - Whether the room has a camera spot.
 */
export function cameraPlaces(spot: boolean): ViewCorner[] {
  return Object.values(VIEW_CORNER).filter((corner) => spot || corner !== VIEW_CORNER.Spot)
}

/** One degree in radians. */
const DEGREE = Math.PI / 180

/**
 * The outline's bounding box, in centimetres (its top-left corner is 0, 0).
 * @param plan - The room.
 */
export function extent(plan: Shaped) {
  return { width: Math.max(...plan.outline.map((p) => p.x)), length: Math.max(...plan.outline.map((p) => p.y)) }
}

/**
 * Whether a value lies between two others, whichever way round.
 * @param value - The value.
 * @param a - One end.
 * @param b - The other.
 */
function between(value: number, a: number, b: number) {
  return value >= Math.min(a, b) && value <= Math.max(a, b)
}

/**
 * An outline stretched to a new overall size: the corners on its right-hand side move with it across, those at its
 * front move with it down, and the others stay.
 * @param outline - The corners.
 * @param width - The new width, in metres.
 * @param length - The new length, in metres.
 */
export function stretch(outline: OutlinePoint[], width: number, length: number): OutlinePoint[] {
  const { width: oldWidth, length: oldLength } = extent({ outline })
  const [w, l] = [Math.round(width * 100), Math.round(length * 100)]

  return outline.map((p) => ({ x: p.x === oldWidth ? w : p.x, y: p.y === oldLength ? l : p.y }))
}

/**
 * Whether a point of the plan can be seen standing at a wall and looking straight out into the room: it is in front of
 * the wall, between its ends, and no other wall stands between them (as one does behind an inner corner).
 * @param plan - The room.
 * @param wall - The wall's number.
 * @param x - Across the plan, in centimetres.
 * @param y - Down the plan, in centimetres.
 */
export function seenFrom(plan: Shaped, wall: number, x: number, y: number) {
  const own = wallOf(plan, wall)
  const { along, away } = fromWall(plan, wall, x, y)

  if (away < 0 || along < 0 || along > own.length) {
    return false
  }

  // A wall parallel to this one, between it and the point, across the line from the point straight to the wall.
  return !walls(plan).some((other) => {
    if (other.index === own.index || (other.dx === 0) !== (own.dx === 0)) {
      return false
    }

    const gap = fromWall(plan, wall, other.start.x, other.start.y).away
    const [a, b] = [fromWall(plan, wall, other.start.x, other.start.y).along, fromWall(plan, wall, other.end.x, other.end.y).along]

    return gap > 0 && gap < away && along > Math.min(a, b) && along < Math.max(a, b)
  })
}

/**
 * Whether a rectangle on the plan (an object's footprint) lies wholly inside the room: its corners are inside, and no
 * corner of the room pokes into it.
 * @param plan - The room.
 * @param x - Its middle across the plan.
 * @param y - Its middle down the plan.
 * @param width - Its size across the plan.
 * @param depth - Its size down the plan.
 */
export function fits(plan: Shaped, x: number, y: number, width: number, depth: number) {
  const [left, right, top, bottom] = [x - width / 2, x + width / 2, y - depth / 2, y + depth / 2]
  const corners = [[left, top], [right, top], [right, bottom], [left, bottom]]

  if (!corners.every(([cx, cy]) => contains(plan, cx, cy))) {
    return false
  }

  return !plan.outline.some((p) => p.x > left && p.x < right && p.y > top && p.y < bottom)
}

/**
 * Where a footprint fits inside the room nearest to where it is: the same place when it fits, else the nearest place
 * on a 10 cm grid around it (the middle of the room's extent when nothing nearer fits, as for an object bigger than
 * the room).
 * @param plan - The room.
 * @param x - Its middle across the plan.
 * @param y - Its middle down the plan.
 * @param width - Its size across the plan.
 * @param depth - Its size down the plan.
 */
export function fitInside(plan: Shaped, x: number, y: number, width: number, depth: number) {
  if (fits(plan, x, y, width, depth)) {
    return { x, y }
  }

  const room = extent(plan)
  const step = BUILDER.gridCm
  let best: { x: number; y: number; distance: number } | null = null

  for (let cy = depth / 2; cy <= room.length - depth / 2 + 0.01; cy += step) {
    for (let cx = width / 2; cx <= room.width - width / 2 + 0.01; cx += step) {
      const distance = Math.hypot(cx - x, cy - y)

      if ((!best || distance < best.distance) && fits(plan, cx, cy, width, depth)) {
        best = { x: cx, y: cy, distance }
      }
    }
  }

  return best ? { x: best.x, y: best.y } : { x: room.width / 2, y: room.length / 2 }
}

/**
 * A change to a room's outline: its new corners (not yet tidied), and where a point on one of the old walls ends up, so
 * the windows, doors and hung things on a moved wall move with it.
 */
export type Reshaped = {
  /** The new corners, clockwise. */
  outline: OutlinePoint[]
  /**
   * Where a point on an old wall is after the change.
   * @param wall - The old wall's number.
   * @param point - The point, on that wall.
   */
  move: (wall: number, point: OutlinePoint) => OutlinePoint
}

/**
 * An outline tidied as the API stores it: whole centimetres, no zero-length walls, no corner in the middle of a straight
 * wall, its top-left corner at 0, 0 and first.
 * @param points - The corners, clockwise.
 * @returns The corners, and how far everything moved to put the top-left corner at 0, 0.
 */
export function normalize(points: OutlinePoint[]) {
  let list = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))

  for (let changed = true; changed && list.length > 2; ) {
    changed = false

    for (let i = 0; i < list.length && list.length > 2; i++) {
      const [before, here, after] = [list[(i - 1 + list.length) % list.length], list[i], list[(i + 1) % list.length]]
      const repeated = here.x === after.x && here.y === after.y
      const straight = (before.x === here.x && here.x === after.x) || (before.y === here.y && here.y === after.y)

      if (repeated || straight) {
        list = list.filter((_, n) => n !== i)
        changed = true
        break
      }
    }
  }

  const shift = { x: -Math.min(...list.map((p) => p.x)), y: -Math.min(...list.map((p) => p.y)) }

  list = list.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y }))
  const first = list.reduce((best, p, i) => (p.y < list[best].y || (p.y === list[best].y && p.x < list[best].x) ? i : best), 0)

  return { outline: [...list.slice(first), ...list.slice(0, first)], shift }
}

/**
 * Whether corners make a room the API accepts (mirrors the Domain's RoomOutline): 4 to `BUILDER.maxCorners` whole-cm
 * corners, clockwise from the top-left one at 0, 0, walls running straight across or down in turn, each at least
 * `BUILDER.minWallCm`, none touching another except at its corners, and an overall size within `BUILDER.wall`.
 * @param points - The corners.
 */
export function isValidOutline(points: OutlinePoint[]) {
  const n = points.length

  if (n < 4 || n > BUILDER.maxCorners || points.some((p) => !Number.isInteger(p.x) || !Number.isInteger(p.y))) {
    return false
  }

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [min, max] = [BUILDER.wall.min * 100, BUILDER.wall.max * 100]

  if (Math.min(...xs) !== 0 || Math.min(...ys) !== 0 || Math.max(...xs) < min || Math.max(...xs) > max || Math.max(...ys) < min || Math.max(...ys) > max) {
    return false
  }

  const topLeft = points.filter((p) => p.y === 0).reduce((a, b) => (b.x < a.x ? b : a))

  if (points[0] !== topLeft && (points[0].x !== topLeft.x || points[0].y !== topLeft.y)) {
    return false
  }

  const all = walls({ outline: points })

  for (let i = 0; i < n; i++) {
    const [wall, next] = [all[i], all[(i + 1) % n]]
    const straight = (wall.dx === 0) !== (wall.dy === 0)

    if (!straight || wall.length < BUILDER.minWallCm || (wall.dx === 0) === (next.dx === 0)) {
      return false
    }
  }

  const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % n].y - points[(i + 1) % n].x * p.y, 0)

  if (area <= 0) {
    return false
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) {
        continue
      }

      const [a, b] = [all[i], all[j]]
      const overlap =
        Math.min(a.start.x, a.end.x) <= Math.max(b.start.x, b.end.x) && Math.min(b.start.x, b.end.x) <= Math.max(a.start.x, a.end.x) &&
        Math.min(a.start.y, a.end.y) <= Math.max(b.start.y, b.end.y) && Math.min(b.start.y, b.end.y) <= Math.max(a.start.y, a.end.y)

      if (overlap) {
        return false
      }
    }
  }

  return true
}

/**
 * A wall pushed out of the room or pulled into it, whole: its neighbours stretch or shrink to meet it.
 * @param outline - The corners.
 * @param wall - The wall's number.
 * @param distance - How far, in centimetres: outwards when positive, into the room when negative.
 */
export function moveWall(outline: OutlinePoint[], wall: number, distance: number): Reshaped {
  const own = walls({ outline })[wall]
  const [ox, oy] = [-own.nx * distance, -own.ny * distance]
  const next = (wall + 1) % outline.length

  return {
    outline: outline.map((p, i) => (i === wall || i === next ? { x: p.x + ox, y: p.y + oy } : p)),
    move: (w, p) => (w === wall ? { x: p.x + ox, y: p.y + oy } : p),
  }
}

/**
 * A corner dragged to a point: the two walls meeting at it move with it (each only across its own line).
 * @param outline - The corners.
 * @param corner - The corner's number (walls `corner - 1` and `corner` meet at it).
 * @param x - Its new place across the plan.
 * @param y - Its new place down the plan.
 */
export function moveCorner(outline: OutlinePoint[], corner: number, x: number, y: number): Reshaped {
  const all = walls({ outline })
  const n = outline.length
  const [before, after] = [(corner - 1 + n) % n, corner]
  const across = (w: number) => all[w].dy === 0
  const shifted = (w: number, p: OutlinePoint) => (across(w) ? { x: p.x, y } : { x, y: p.y })

  return {
    outline: outline.map((p, i) => (i === corner ? { x, y } : i === before ? shifted(before, p) : i === (corner + 1) % n ? shifted(after, p) : p)),
    move: (w, p) => (w === before || w === after ? shifted(w, p) : p),
  }
}

/**
 * A section of a wall pushed out of the room (an alcove or bay) or pulled into it (a step), with new short walls at
 * its ends.
 * @param outline - The corners.
 * @param wall - The wall's number.
 * @param from - Where the section starts along the wall, in centimetres from its left end (seen from inside).
 * @param to - Where it ends.
 * @param distance - How far, in centimetres: outwards when positive, into the room when negative.
 */
export function pushSection(outline: OutlinePoint[], wall: number, from: number, to: number, distance: number): Reshaped {
  const own = walls({ outline })[wall]
  const [ox, oy] = [-own.nx * distance, -own.ny * distance]
  const at = (along: number) => ({ x: own.start.x + own.dx * along, y: own.start.y + own.dy * along })
  const [a, b] = [at(from), at(to)]
  const inserted = [a, { x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy }, b]

  return {
    outline: [...outline.slice(0, wall + 1), ...inserted, ...outline.slice(wall + 1)],
    move: (w, p) => {
      if (w !== wall) {
        return p
      }

      const along = (p.x - own.start.x) * own.dx + (p.y - own.start.y) * own.dy

      return along >= from && along <= to ? { x: p.x + ox, y: p.y + oy } : p
    },
  }
}
