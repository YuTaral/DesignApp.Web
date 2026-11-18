import { create } from "zustand"

import { BUILDER, ITEM_FORM, ITEM_SHAPE } from "@/lib/constants"
import type { CatalogObject, CatalogVariant, ItemParts, Plan, PlanItem } from "./api"
import { extent, fitInside, fromWall, isValidOutline, nearestWall, normalize, rectangle, stretch, wallLength, wallPoint, walls, type Reshaped } from "./room-outline"

/** What the room settings change: its name, walls, colors, floor and view. */
type RoomChange = Partial<Pick<Plan, "name" | "width" | "length" | "height" | "wallColor" | "floorColor" | "floorType" | "view" | "corner">>

type BuilderState = {
  /** The room being built, as shown (saved shortly after each change). */
  plan: Plan | null
  /** The selected object's position in `plan.items`, or -1. */
  selected: number
  /** Counts the changes not yet saved; 0 when everything is saved. */
  unsaved: number
  /** The object copied with Ctrl+C, kept when another room is opened so it can be pasted there. */
  clipboard: PlanItem | null

  /** Starts editing a plan (keeps the one shown when it is the same plan). */
  load: (plan: Plan) => void
  /** Records that the plan was saved, as it was `version` changes ago. */
  saved: (changes: number) => void
  /**
   * Changes the walls, colors, floor, view or name; objects are kept inside the new walls. A new width or length
   * stretches the outline (its right-hand or front walls move).
   */
  setRoom: (room: RoomChange) => void
  /**
   * Adds an object and selects it: on the floor at a point (the room's middle when missing), or, for a window or door,
   * on a wall (the one nearest the point, else the wall the photo looks at) at a point along it.
   */
  add: (object: CatalogObject, at?: { x: number; y: number } | { wall: number; along: number }, decorations?: string[]) => void
  /**
   * Changes the room's shape, starting from the room as it was (`base`, so a drag never builds on its own steps): the
   * walls that moved take their windows, doors and hung things and the view with them, and floor objects stay inside.
   * @returns How far the plan moved to keep its top-left corner at 0, 0, or null when the shape isn't a valid room (then
   *   nothing changes).
   */
  reshape: (base: Plan, change: Reshaped) => { x: number; y: number } | null
  /** Makes the room a plain rectangle of its overall size again. */
  resetShape: () => void
  /** Changes an object (kept inside the walls). */
  update: (index: number, change: Partial<PlanItem>) => void
  /** Turns an object a quarter turn clockwise (windows and doors don't turn). */
  rotate: (index: number) => void
  /** Removes an object. */
  remove: (index: number) => void
  /** Selects an object, or none with -1. */
  select: (index: number) => void
  /** Copies the selected object. */
  copy: () => void
  /**
   * Adds a copy of the copied object and selects it: a floor object a little to the right and down, a window or door
   * on the same wall just past it (so cabinets line up). The copy is the next one pasted from, so pastes step on.
   */
  paste: () => void
}

/**
 * The room builder's state: the plan as the user changes it, and the selected object. Every change counts as unsaved
 * until the page's autosave has sent it.
 */
export const useBuilderStore = create<BuilderState>((set, get) => {
  /**
   * Shows new objects as one more unsaved change.
   * @param items - The objects.
   */
  const change = (items: PlanItem[]) => {
    const { plan, unsaved } = get()

    if (plan) {
      set({ plan: { ...plan, items }, unsaved: unsaved + 1 })
    }
  }

  return {
    plan: null,
    selected: -1,
    unsaved: 0,
    clipboard: null,

    load: (plan) => {
      if (get().plan?.id !== plan.id) {
        set({ plan, selected: -1, unsaved: 0 })
      }
    },
    saved: (changes) => set({ unsaved: Math.max(0, get().unsaved - changes) }),
    setRoom: (room) => {
      const { plan, unsaved } = get()

      if (!plan) {
        return
      }

      const { width, length, ...rest } = room
      const next = { ...plan, ...rest }

      set({ plan: { ...next, items: next.items.map((item) => inside(item, next)) }, unsaved: unsaved + 1 })

      if (width === undefined && length === undefined) {
        return
      }

      // A new overall size stretches the outline: its right-hand and front walls move.
      const size = extent(plan)
      const [w, l] = [Math.round((width ?? plan.width) * 100), Math.round((length ?? plan.length) * 100)]
      const outline = stretch(plan.outline, w / 100, l / 100)
      const move = (_: number, p: { x: number; y: number }) => ({ x: p.x === size.width ? w : p.x, y: p.y === size.length ? l : p.y })

      get().reshape(get().plan!, { outline, move })
    },
    reshape: (base, change) => {
      const { outline, shift } = normalize(change.outline)

      if (!isValidOutline(outline)) {
        return null
      }

      const size = extent({ outline })
      const next: Plan = { ...base, outline, width: size.width / 100, length: size.length / 100 }
      /** Where a point on an old wall is on the new walls: the same-facing wall nearest it, and how far along. */
      const follow = (wall: number, point: { x: number; y: number }) => {
        const old = walls(base)[wall]
        const moved = change.move(wall, point)
        const at = { x: moved.x + shift.x, y: moved.y + shift.y }
        const same = walls(next).filter((w) => old && w.dx === old.dx && w.dy === old.dy)
        const candidates = same.length > 0 ? same : walls(next)
        const seen = candidates.map((w) => {
          const { along, away } = fromWall(next, w.index, at.x, at.y)
          const kept = Math.min(w.length, Math.max(0, along))

          return { wall: w.index, along: kept, distance: Math.hypot(along - kept, away) }
        })

        return seen.reduce((a, b) => (b.distance < a.distance ? b : a))
      }
      const viewWall = walls(base)[base.view] ?? walls(base)[0]

      next.view = follow(viewWall.index, wallPoint(base, viewWall.index, viewWall.length / 2)).wall
      next.items = base.items.map((item) => {
        if (!isWallItem(item)) {
          return inside({ ...item, x: item.x + shift.x, y: item.y + shift.y }, next)
        }

        const placed = follow(item.wall, wallPoint(base, item.wall, item.x))

        return inside({ ...item, wall: placed.wall, x: placed.along }, next)
      })
      set({ plan: next, unsaved: get().unsaved + 1 })

      return shift
    },
    resetShape: () => {
      const { plan } = get()

      if (plan) {
        get().reshape(plan, { outline: rectangle(plan.width, plan.length), move: (_, p) => p })
      }
    },
    add: (object, at, decorations) => {
      const { plan } = get()

      if (!plan || plan.items.length >= BUILDER.maxItems) {
        return
      }

      const base = {
        label: object.label, shape: object.shape, width: object.width, depth: object.depth, height: object.height, color: object.color, rotation: 0,
        form: object.form ?? ITEM_FORM.Standard, decorations: decorations ?? [],
      }
      let item: PlanItem

      if (isWallShape(object.shape)) {
        const placed = at && "wall" in at ? at : at ? nearestWall(plan, at.x, at.y) : { wall: plan.view, along: wallLength(plan, plan.view) / 2 }
        const elevation = object.shape === ITEM_SHAPE.Door ? 0 : object.elevation

        item = { ...base, wall: placed.wall, x: placed.along, y: 0, elevation }
      } else {
        const point = at && "x" in at ? at : { x: plan.width * 50, y: plan.length * 50 }

        item = { ...base, wall: null, elevation: 0, x: toGrid(point.x), y: toGrid(point.y) }
      }

      const placed = inside(snap(withParts(item)), plan)

      // A window, door or hung thing goes to the free place on its wall nearest where it was asked for, not on top of
      // another.
      change([...plan.items, isWallItem(placed) ? { ...placed, x: freeAlong(plan, placed) } : placed])
      set({ selected: plan.items.length })
    },
    update: (index, update) => {
      const { plan } = get()

      if (!plan?.items[index]) {
        return
      }

      change(plan.items.map((item, i) => (i === index ? inside(snap(withParts({ ...item, ...update })), plan) : item)))
    },
    rotate: (index) => {
      const item = get().plan?.items[index]

      if (item && !isWallItem(item)) {
        get().update(index, { rotation: (item.rotation + BUILDER.rotationStep) % 360 })
      }
    },
    remove: (index) => {
      const { plan } = get()

      if (!plan) {
        return
      }

      change(plan.items.filter((_, i) => i !== index))
      set({ selected: -1 })
    },
    select: (index) => set({ selected: index }),
    copy: () => {
      const { plan, selected } = get()
      const item = plan?.items[selected]

      if (item) {
        set({ clipboard: item })
      }
    },
    paste: () => {
      const { plan, clipboard } = get()

      if (!plan || !clipboard || plan.items.length >= BUILDER.maxItems) {
        return
      }

      const step = BUILDER.pasteOffset
      const copy = isWallItem(clipboard)
        ? { ...clipboard, x: clipboard.x + clipboard.width + step / 3 }
        : { ...clipboard, x: clipboard.x + step, y: clipboard.y + step }
      const placed = inside(snap(withParts(copy)), plan)

      change([...plan.items, placed])
      set({ selected: plan.items.length, clipboard: placed })
    },
  }
})

/**
 * A catalog object in one of its variations: the variation's name, shape, size and outline in the object's color.
 * @param object - The catalog object.
 * @param variant - One of its variations.
 */
export function inVariation(object: CatalogObject, variant: CatalogVariant): CatalogObject {
  const { label, shape, width, depth, height, elevation, form } = variant

  return { ...object, label, shape, width, depth, height, elevation, form }
}

/**
 * The catalog object an object on the plan was made from, and which of its variations it is, found by its name; null
 * when it was renamed or described by the AI.
 * @param catalog - The room type's catalog.
 * @param item - The object on the plan.
 */
export function variationOf(catalog: CatalogObject[], item: PlanItem) {
  for (const object of catalog) {
    const index = object.variants.findIndex((variant) => variant.label === item.label && variant.shape === item.shape)

    if (index >= 0) {
      return { object, index }
    }
  }

  return null
}

/**
 * The change that turns an object into another variation of its catalog object, where it is, in its color and turn.
 * @param variant - The variation.
 */
export function toVariation(variant: CatalogVariant): Partial<PlanItem> {
  const { label, shape, width, depth, height, form } = variant
  // A new outline starts with its usual parts.
  const raised = shape === ITEM_SHAPE.Window || isMountedShape(shape)

  return { label, shape, width, depth, height, form, parts: null, ...(raised ? { elevation: variant.elevation } : {}) }
}

/**
 * Whether an object is made of parts: an L (back run and corner leg) or a P (and a chaise).
 * @param item - The object.
 */
export function hasParts(item: Pick<PlanItem, "form">) {
  return item.form === ITEM_FORM.LShaped || item.form === ITEM_FORM.PShaped
}

/**
 * An L- or P-shaped object's parts: its own, or the usual ones for its size (as the API gives a new one); null for
 * other outlines.
 * @param item - The object.
 */
export function partsOf(item: Pick<PlanItem, "form" | "width" | "depth" | "parts">): ItemParts | null {
  if (!hasParts(item)) {
    return null
  }

  if (item.parts) {
    return item.parts
  }

  const smaller = Math.min(item.width, item.depth)

  if (item.form === ITEM_FORM.LShaped) {
    const run = Math.round(smaller * BUILDER.legShare)

    return { runDepth: run, legWidth: run, chaiseWidth: 0, chaiseDepth: 0 }
  }

  const leg = Math.round(smaller * BUILDER.pLegShare)

  return { runDepth: leg, legWidth: leg, chaiseWidth: Math.min(Math.round(leg * BUILDER.chaiseShare), item.width), chaiseDepth: leg }
}

/**
 * An object with its parts fitted to its size, as the API requires: each part at least `BUILDER.minPart`, inside the
 * object, and a P's chaise at least as wide as its leg. Objects without parts get none.
 * @param item - The object.
 */
export function withParts(item: PlanItem): PlanItem {
  const parts = partsOf(item)

  if (!parts) {
    return item.parts ? { ...item, parts: null } : item
  }

  const min = BUILDER.minPart
  const fit = (value: number, low: number, high: number) => Math.round(Math.min(Math.max(value, low), Math.max(low, high)))
  const runDepth = fit(parts.runDepth, min, item.depth - min)
  const legWidth = fit(parts.legWidth, min, item.width - min)
  const fitted =
    item.form === ITEM_FORM.PShaped
      ? { runDepth, legWidth, chaiseWidth: fit(parts.chaiseWidth, legWidth, item.width), chaiseDepth: fit(parts.chaiseDepth, min, item.depth - runDepth) }
      : { runDepth, legWidth, chaiseWidth: 0, chaiseDepth: 0 }

  return { ...item, parts: fitted }
}

/**
 * The outline of an L- or P-shaped object before turning, around its middle, from its parts: the back run at the top,
 * the leg down its right side, and a P's chaise at the leg's front end.
 * @param item - The object.
 */
export function cornerOutline(item: PlanItem): [number, number][] {
  const { runDepth: run, legWidth: leg, chaiseWidth, chaiseDepth } = partsOf(item)!
  const [w, d] = [item.width, item.depth]
  const [cw, cd] = item.form === ITEM_FORM.PShaped ? [chaiseWidth, chaiseDepth] : [leg, 0]

  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [w / 2 - cw, d / 2], [w / 2 - cw, d / 2 - cd], [w / 2 - leg, d / 2 - cd],
    [w / 2 - leg, -d / 2 + run], [-w / 2, -d / 2 + run]]
}

/**
 * Whether a shape goes on a wall: a window or door in it, or a picture or wall box hung on it.
 * @param shape - The shape.
 */
export function isWallShape(shape: string) {
  return isOpeningShape(shape) || isMountedShape(shape)
}

/**
 * Whether a shape is an opening in a wall (a window or door).
 * @param shape - The shape.
 */
export function isOpeningShape(shape: string) {
  return shape === ITEM_SHAPE.Window || shape === ITEM_SHAPE.Door
}

/**
 * Whether a shape hangs on a wall (a picture or a wall box).
 * @param shape - The shape.
 */
export function isMountedShape(shape: string) {
  return shape === ITEM_SHAPE.Picture || shape === ITEM_SHAPE.WallBox
}

/**
 * Whether an object is on a wall (a window, door or hung object).
 * @param item - The object.
 */
export function isWallItem(item: Pick<PlanItem, "wall">): item is PlanItem & { wall: number } {
  return item.wall != null
}

/**
 * An object's footprint on the floor plan (width across, depth along), after its turn.
 * @param item - The object.
 */
export function footprint(item: Pick<PlanItem, "width" | "depth" | "rotation">) {
  return item.rotation % 180 === 0 ? { width: item.width, depth: item.depth } : { width: item.depth, depth: item.width }
}

/**
 * Whether two objects get in each other's way: two standing objects whose footprints overlap (rugs lie under things,
 * so they never count), or two things on the same wall (windows, doors, hung things) that cover the same part of it,
 * along it and in height. A standing object and a wall's object never count: a sofa may stand under a window.
 * @param a - One object.
 * @param b - The other.
 */
export function overlaps(a: PlanItem, b: PlanItem) {
  if (isWallItem(a) && isWallItem(b)) {
    return a.wall === b.wall && Math.abs(a.x - b.x) * 2 < a.width + b.width - 1
      && a.elevation < b.elevation + b.height - 1 && b.elevation < a.elevation + a.height - 1
  }

  if (a.shape === ITEM_SHAPE.Rug || b.shape === ITEM_SHAPE.Rug || isWallItem(a) || isWallItem(b)) {
    return false
  }

  const [fa, fb] = [footprint(a), footprint(b)]

  return Math.abs(a.x - b.x) * 2 < fa.width + fb.width - 1 && Math.abs(a.y - b.y) * 2 < fa.depth + fb.depth - 1
}

/**
 * An object with its position and sides in whole centimetres, its sides within the limits. Moving and dropping put
 * objects on the grid (`toGrid`); a resize keeps the corner opposite the handle exactly where it was, so its middle
 * lands wherever the new size puts it.
 * @param item - The object.
 */
function snap(item: PlanItem): PlanItem {
  const side = (cm: number) => Math.min(BUILDER.item.max, Math.max(BUILDER.item.min, Math.round(cm)))
  const sized = { ...item, width: side(item.width), depth: side(item.depth), height: side(item.height) }

  return isWallItem(item)
    ? { ...sized, x: Math.round(item.x), y: 0, elevation: Math.max(0, Math.round(item.elevation)), rotation: 0 }
    : { ...sized, x: Math.round(item.x), y: Math.round(item.y), elevation: 0 }
}

/**
 * A position on the plan's grid, where moved and dropped objects land.
 * @param cm - The position, in centimetres.
 */
export function toGrid(cm: number) {
  return Math.round(cm / BUILDER.gridCm) * BUILDER.gridCm
}

/**
 * An object moved inside the walls (centered when it is bigger than the room; in a room with bent walls, to the
 * nearest place it fits). A window, door or hung object stays
 * between its wall's ends and under the ceiling, a door stands on the floor, and a hung object sticks out only so far.
 * @param item - The object.
 * @param plan - The room.
 */
function inside(item: PlanItem, plan: Pick<Plan, "outline" | "height">): PlanItem {
  const clamp = (value: number, size: number, room: number) => (size >= room ? room / 2 : Math.min(room - size / 2, Math.max(size / 2, value)))

  if (isWallItem(item)) {
    const [along, ceiling] = [wallLength(plan, item.wall), plan.height * 100]
    const width = Math.min(item.width, along)
    const height = Math.min(item.height, ceiling)
    const elevation = item.shape === ITEM_SHAPE.Door ? 0 : Math.min(Math.max(0, item.elevation), ceiling - height)
    const depth = isMountedShape(item.shape) ? Math.min(item.depth, BUILDER.maxMountedDepth) : item.depth

    return { ...item, width, height, depth, elevation, x: clamp(item.x, width, along) }
  }

  const { width, depth } = footprint(item)
  const room = extent(plan)
  const kept = { x: clamp(item.x, width, room.width), y: clamp(item.y, depth, room.length) }

  // A room with bent walls: the nearest place where the whole footprint is inside them.
  return { ...item, ...(plan.outline.length > 4 ? fitInside(plan, kept.x, kept.y, width, depth) : kept) }
}

/**
 * The positions of the objects that get in another's way (see `overlaps`), for marking them in red.
 * @param plan - The room.
 */
export function clashingItems(plan: Pick<Plan, "items">) {
  return new Set(plan.items.flatMap((a, i) => (plan.items.some((b, j) => i !== j && overlaps(a, b)) ? [i] : [])))
}

/**
 * Where along its wall a window, door or hung thing fits without covering another one there: the nearest place to
 * where it is, in 10 cm steps either way; where it is when the wall has no such place.
 * @param plan - The room.
 * @param item - The object, already sized to its wall.
 */
function freeAlong(plan: Pick<Plan, "outline" | "items">, item: PlanItem & { wall: number }) {
  const length = wallLength(plan, item.wall)
  const free = (x: number) => x >= item.width / 2 && x <= length - item.width / 2 && !plan.items.some((other) => overlaps({ ...item, x }, other))

  for (let shift = 0; shift <= length; shift += BUILDER.gridCm) {
    const found = [item.x + shift, item.x - shift].find(free)

    if (found !== undefined) {
      return found
    }
  }

  return item.x
}
