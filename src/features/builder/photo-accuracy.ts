import * as THREE from "three"

import { BUILDER, OBJECT_CATEGORY } from "@/lib/constants"
import type { LabelMap } from "@/features/editor/label-map"
import type { DetectedObject } from "@/features/rooms/types"
import type { Plan } from "./api"
import { isWallItem } from "./builder-store"
import { wallPoint } from "./room-outline"
import { MASK_ID, renderMasks } from "./scene-3d"

/** How well one object of the plan came out in the generated photo. */
export type ObjectScore = {
  /** Its position in `plan.items`. */
  index: number
  /** Its name on the plan. */
  label: string
  /** The photo object it was matched to (by the analysis's name), or null when the photo has none where it should be. */
  matched: string | null
  /** How much the expected and the photo's outlines cover each other: 0 (not at all) to 1 (exactly). */
  overlap: number
  /** The photo's width over the expected width, minus 1 (+0.1 is 10% too wide); null when unmatched or cut by the frame. */
  widthError: number | null
  /** The same for its height. */
  heightError: number | null
  /** How far the photo's object is from where it should be, in centimetres; null when unmatched. */
  offsetCm: number | null
  /** Whether the frame cuts the expected outline (its size can't be compared then). */
  cut: boolean
  /** Other plan objects the analysis saw as the same photo object, measured together with this one. */
  together: string[]
}

/** How well a generated photo follows its plan. */
export type PhotoScore = {
  /** Every plan object the photo should show. */
  objects: ObjectScore[]
  /** Photo objects that match nothing on the plan and stand on their own: added by the image model. */
  extras: { label: string; share: number }[]
  /** Small photo objects lying mostly on a plan object (cushions on a sofa): decorations, not counted as extras. */
  decorations: string[]
  /** The room's trim the image model drew (skirting boards, crown moulding): not objects, not counted as extras. */
  trim: string[]
  /** How well the floor's outline matches (0 to 1): the room's shape and the camera. */
  floorOverlap: number
  /** How well the walls' outline matches (0 to 1). */
  wallOverlap: number
  /** The average overlap of the objects the photo should show (missing ones count as 0). */
  meanOverlap: number
  /** The average size error (width and height, as a share) of the matched objects the frame doesn't cut. */
  meanSizeError: number
  /** The average distance from where they should be, in centimetres. */
  meanOffsetCm: number
}

/** A mask's pixel count and bounding box, in pixels. */
type Extent = { count: number; left: number; right: number; top: number; bottom: number }

/** Photo categories that are the room itself, not objects in it. */
const SURFACES = new Set<string>([OBJECT_CATEGORY.Wall, OBJECT_CATEGORY.Floor, OBJECT_CATEGORY.Ceiling])

/**
 * Measures how exactly a generated photo follows the plan it was made from, from the photo's analysis: each plan
 * object's outline in the 3D view (`renderMasks`, the same camera as the photo) against the photo object over it. The
 * clearly overlapping pairs are matched one to one; a plan object left over joins the photo object covering most of
 * it (two plan objects the analysis saw as one are measured together); each match gets its overlap, its size error
 * (both outlines turned into centimetres at the distance where they stand on the floor, or where their wall is) and
 * how far it moved. Plan objects with no match are missing; photo objects with none are extras, unless they lie on a
 * plan object (decorations) or are the room's trim.
 * @param plan - The room as it was when the photo was made.
 * @param objects - The objects the analysis found in the photo.
 * @param labels - The photo's label map.
 * @throws Error when the browser has no WebGL.
 */
export function scorePhoto(plan: Plan, objects: DetectedObject[], labels: LabelMap): PhotoScore {
  const { width, height } = labels
  const { ids, camera } = renderMasks(plan, width, height)
  const pixels = width * height
  const enough = pixels * BUILDER.accuracy.minShare

  // A part (a chair's seat) counts as its whole object.
  const byIndex = new Map(objects.map((o) => [o.index, o]))
  const root = (index: number) => {
    let o = byIndex.get(index)
    while (o?.parentIndex != null && byIndex.has(o.parentIndex)) o = byIndex.get(o.parentIndex)
    return o
  }

  const expected = new Map<number, Extent>()
  const actual = new Map<number, Extent>()
  const both = new Map<string, number>()
  const add = (map: Map<number, Extent>, key: number, x: number, y: number) => {
    const e = map.get(key) ?? { count: 0, left: x, right: x, top: y, bottom: y }
    e.count++
    e.left = Math.min(e.left, x)
    e.right = Math.max(e.right, x)
    e.top = Math.min(e.top, y)
    e.bottom = Math.max(e.bottom, y)
    map.set(key, e)
  }
  let [floorBoth, floorExpected, floorActual, wallBoth, wallExpected, wallActual] = [0, 0, 0, 0, 0, 0]
  for (let p = 0; p < pixels; p++) {
    const [x, y] = [p % width, Math.floor(p / width)]
    const id = ids[p]
    const found = labels.labels[p] ? root(labels.labels[p]) : undefined
    const item = id > 0 && id < MASK_ID.floor ? id - 1 : -1
    if (item >= 0) add(expected, item, x, y)
    const object = found && !SURFACES.has(found.category) ? found.index : -1
    if (object >= 0) add(actual, object, x, y)
    if (item >= 0 && object >= 0) both.set(`${item}:${object}`, (both.get(`${item}:${object}`) ?? 0) + 1)
    const [isFloor, isWall] = [found?.category === OBJECT_CATEGORY.Floor, found?.category === OBJECT_CATEGORY.Wall]
    floorExpected += Number(id === MASK_ID.floor)
    floorActual += Number(isFloor)
    floorBoth += Number(id === MASK_ID.floor && isFloor)
    wallExpected += Number(id === MASK_ID.wall)
    wallActual += Number(isWall)
    wallBoth += Number(id === MASK_ID.wall && isWall)
  }

  // Pair plan objects with photo objects: first the clear one-to-one pairs; then each plan object left over goes to the
  // photo object covering most of it, even one already paired (the analysis may see two cabinet runs as one counter,
  // and then they are measured together); then weaker one-to-one pairs. The rest is missing.
  const shared = (item: number, object: number) => both.get(`${item}:${object}`) ?? 0
  const visible = [...expected.keys()].filter((item) => expected.get(item)!.count >= enough).sort((a, b) => a - b)
  const groups = new Map<number, number[]>()
  const groupOf = new Map<number, number>()
  const join = (item: number, object: number) => {
    groups.set(object, [...(groups.get(object) ?? []), item])
    groupOf.set(item, object)
  }
  const overlap = (items: number[], object: number) => {
    const common = items.reduce((sum, item) => sum + shared(item, object), 0)
    const wanted = items.reduce((sum, item) => sum + expected.get(item)!.count, 0)
    return common / (wanted + actual.get(object)!.count - common)
  }
  const pairUp = (least: number) => {
    const pairs = [...both.keys()]
      .map((key) => key.split(":").map(Number))
      .filter(([item, object]) => !groupOf.has(item) && !groups.has(object) && expected.get(item)!.count >= enough)
      .map(([item, object]) => ({ item, object, overlap: overlap([item], object) }))
      .filter((pair) => pair.overlap >= least)
      .sort((a, b) => b.overlap - a.overlap)
    for (const pair of pairs) if (!groupOf.has(pair.item) && !groups.has(pair.object)) join(pair.item, pair.object)
  }
  pairUp(BUILDER.accuracy.clearOverlap)
  for (const item of visible) {
    if (groupOf.has(item)) continue
    const best = [...actual.keys()].map((object) => ({ object, covered: shared(item, object) / expected.get(item)!.count })).sort((a, b) => b.covered - a.covered)[0]
    if (best && best.covered >= BUILDER.accuracy.coveredShare) join(item, best.object)
  }
  pairUp(BUILDER.accuracy.minOverlap)

  const measure = measurer(camera, width, height)
  /** The outline of several plan objects together. */
  const together = (items: number[]): Extent => {
    const parts = items.map((item) => expected.get(item)!)
    return {
      count: parts.reduce((sum, e) => sum + e.count, 0),
      left: Math.min(...parts.map((e) => e.left)),
      right: Math.max(...parts.map((e) => e.right)),
      top: Math.min(...parts.map((e) => e.top)),
      bottom: Math.max(...parts.map((e) => e.bottom)),
    }
  }
  const scores: ObjectScore[] = visible.map((index) => {
    const item = plan.items[index]
    const object = groupOf.get(index)
    const own = expected.get(index)!
    const cut = own.left === 0 || own.top === 0 || own.right === width - 1 || own.bottom === height - 1
    const empty = { index, label: item.label, matched: null, overlap: 0, widthError: null, heightError: null, offsetCm: null, cut, together: [] }
    if (object === undefined) return empty
    const group = groups.get(object)!
    const e = together(group)
    const groupCut = e.left === 0 || e.top === 0 || e.right === width - 1 || e.bottom === height - 1
    const a = actual.get(object)!
    // Where they stand: on the floor for floor objects; on their wall (as planned) for the rest.
    const onWall = isWallItem(item) ? wallPoint(plan, item.wall, item.x) : null
    const wanted = measure(e, onWall)
    const got = measure(a, onWall)
    return {
      ...empty,
      cut: groupCut,
      matched: byIndex.get(object)!.label,
      together: group.filter((other) => other !== index).map((other) => plan.items[other].label),
      overlap: overlap(group, object),
      widthError: groupCut || !wanted || !got ? null : got.width / wanted.width - 1,
      heightError: groupCut || !wanted || !got ? null : got.height / wanted.height - 1,
      offsetCm: wanted && got ? Math.hypot(got.x - wanted.x, got.y - wanted.y, got.z - wanted.z) * 100 : null,
    }
  })

  // Unmatched photo objects: room trim (skirting boards, moulding), decorations when most of them lies on a plan
  // object's outline, else extras.
  const extras: PhotoScore["extras"] = []
  const decorations: string[] = []
  const trim: string[] = []
  for (const [object, a] of actual) {
    if (groups.has(object) || a.count < enough) continue
    let onItems = 0
    for (const [key, count] of both) if (key.endsWith(`:${object}`)) onItems += count
    const label = byIndex.get(object)!.label
    if (BUILDER.accuracy.trimWords.some((word) => label.toLowerCase().includes(word))) trim.push(label)
    else if (onItems / a.count >= BUILDER.accuracy.decorationShare) decorations.push(label)
    else extras.push({ label, share: a.count / pixels })
  }

  const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0)
  return {
    objects: scores,
    extras,
    decorations,
    trim,
    floorOverlap: floorBoth / Math.max(1, floorExpected + floorActual - floorBoth),
    wallOverlap: wallBoth / Math.max(1, wallExpected + wallActual - wallBoth),
    meanOverlap: average(scores.map((s) => s.overlap)),
    meanSizeError: average(scores.flatMap((s) => [s.widthError, s.heightError]).filter((v): v is number => v !== null).map(Math.abs)),
    meanOffsetCm: average(scores.map((s) => s.offsetCm).filter((v): v is number => v !== null)),
  }
}

/**
 * Turns an outline in the picture into real sizes: where it stands (the floor under its bottom edge's middle, or a
 * point on its wall), and its width and height at that distance from the camera, in metres.
 * @param camera - The photo's camera.
 * @param width - The picture's width, in pixels.
 * @param height - The picture's height, in pixels.
 */
function measurer(camera: THREE.PerspectiveCamera, width: number, height: number) {
  const ray = new THREE.Raycaster()
  const forward = camera.getWorldDirection(new THREE.Vector3())
  /** The ray through a pixel. */
  const through = (x: number, y: number) => {
    ray.setFromCamera(new THREE.Vector2(((x + 0.5) / width) * 2 - 1, -((y + 0.5) / height) * 2 + 1), camera)
    return ray.ray.clone()
  }
  /** Where a pixel's ray meets the plane facing the camera at a depth. */
  const atDepth = (x: number, y: number, depth: number) => {
    const plane = new THREE.Plane(forward.clone().negate(), forward.dot(camera.position) + depth)
    return through(x, y).intersectPlane(plane, new THREE.Vector3())
  }
  return (e: Extent, onWall: { x: number; y: number } | null) => {
    const middle = (e.left + e.right) / 2
    let spot: THREE.Vector3 | null
    if (onWall) {
      spot = new THREE.Vector3(onWall.x / 100, 0, onWall.y / 100)
    } else {
      spot = through(middle, e.bottom).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
    }
    if (!spot) return null
    const depth = spot.clone().sub(camera.position).dot(forward)
    const [left, right, top, bottom] = [atDepth(e.left, e.bottom, depth), atDepth(e.right + 1, e.bottom, depth), atDepth(middle, e.top, depth), atDepth(middle, e.bottom + 1, depth)]
    if (!left || !right || !top || !bottom) return null
    const centre = onWall ? atDepth(middle, (e.top + e.bottom) / 2, depth) ?? spot : spot
    return { x: centre.x, y: centre.y, z: centre.z, width: left.distanceTo(right), height: top.distanceTo(bottom) }
  }
}
