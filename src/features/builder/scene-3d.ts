import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

import { BUILDER, ITEM_FORM, ITEM_SHAPE, VIEW_CORNER, WALL_FINISH } from "@/lib/constants"
import type { ItemBox, Plan, PlanItem, PlanShot } from "./api"
import { hasParts, isMountedShape, isWallItem, partsOf } from "./builder-store"
import { cameraStand, wallOf, wallPoint, walls, type OutlineWall } from "./room-outline"
import { FLOOR_TILE_METRES, paintFloor, shade } from "./floor-texture"
import { paintWall, WALL_TILE_METRES, wallSurface } from "./wall-texture"

/**
 * Draws a built room in 3D: the floor in its material and color, the walls and the ceiling, the windows and doors in
 * them and what hangs on them, and each object as a simple model of its shape, size and color. The camera stands across the room from the
 * wall the plan looks at (`plan.view`, see `cameraStand`), at a photographer's height and held level. The same picture is the
 * guide the image model turns into a photo, so what the user sees is what it gets.
 */
export class PlanScene {
  private readonly renderer: THREE.WebGLRenderer
  private camera: THREE.PerspectiveCamera | null = null

  /**
   * @param canvas - The canvas to draw on.
   * @throws Error when the browser has no WebGL.
   */
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
  }

  /**
   * Draws the room at a size in CSS pixels.
   * @param plan - The room.
   * @param width - The width to draw, in CSS px.
   * @param height - The height to draw, in CSS px.
   * @param ratio - Device pixels per CSS pixel.
   */
  render(plan: Plan, width: number, height: number, ratio = window.devicePixelRatio || 1) {
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(width, height, false)
    const scene = buildScene(plan, this.renderer.capabilities.getMaxAnisotropy())

    this.camera = camera(plan, width, height)
    this.renderer.render(scene, this.camera)
    dispose(scene)
  }

  /**
   * The wall at a point of the last picture drawn, if a wall in view is there (not the one behind the camera).
   * @param plan - The room drawn.
   * @param x - Across the picture, -1 (left) to 1 (right).
   * @param y - Up the picture, -1 (bottom) to 1 (top).
   */
  wallAt(plan: Plan, x: number, y: number): number | null {
    if (!this.camera) {
      return null
    }

    const raycaster = new THREE.Raycaster()
    const behind = cameraStand(plan).behind
    const meshes = walls(plan)
      .filter((wall) => wall.index !== behind)
      .map((wall) => wallMesh(plan, wall, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })))

    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera)

    // The walls aren't in a scene, so their placement is applied by hand before the ray is cast.
    for (const mesh of meshes) {
      mesh.updateMatrixWorld()
    }

    const hit = raycaster.intersectObjects(meshes)[0]

    for (const mesh of meshes) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }

    return (hit?.object.userData.wall as number | undefined) ?? null
  }

  /**
   * Frees the GPU resources.
   * @param release - Whether to free the WebGL context at once too (browsers allow only a few at a time); only for a
   *   canvas that is thrown away, as its context can't be used again.
   */
  dispose(release = false) {
    this.renderer.dispose()

    if (release) {
      this.renderer.forceContextLoss()
    }
  }
}

/**
 * The room's 3D view at the guide's size, as a PNG for the image model.
 * @param plan - The room.
 * @returns The PNG.
 * @throws Error when WebGL is missing or the picture can't be made.
 */
export async function renderGuide(plan: Plan): Promise<Blob> {
  const canvas = document.createElement("canvas")
  const view = new PlanScene(canvas)

  try {
    view.render(plan, BUILDER.guide.width, BUILDER.guide.height, 1)

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No picture"))), "image/png"))
  } finally {
    view.dispose(true)
  }
}

/**
 * The camera: across the room from the middle of the wall in view, just inside the room (`cameraStand`), at a
 * photographer's height, held level and looking straight at the wall in view. Its lens shows the room's whole width from halfway to the far wall
 * (within an interior photographer's widest range), so the side walls and what stands by them are in the picture, and
 * it is shifted down to show more floor than ceiling. From a near corner it is turned to look diagonally across the
 * room through a fixed wide lens; from the plan's camera spot it is turned towards the wall's middle, its lens fitted
 * from where it stands. The API's PlanCamera uses the same lens.
 * @param plan - The room.
 * @param width - The picture's width.
 * @param height - The picture's height.
 */
export function camera(plan: Plan, width: number, height: number) {
  const eye = Math.min(BUILDER.scene.eyeHeight, plan.height - 0.3)
  const stand = cameraStand(plan)
  const [across, away] = [stand.across / 100, stand.stand / 100]
  const [x, z] = [stand.x / 100, stand.y / 100]
  const [lookX, lookZ] = [x + stand.lookX, z + stand.lookY]

  // The horizontal view that fits the far wall, kept in a wide lens's range, then the vertical view of the taller,
  // shifted frame the picture is cut from.
  // The whole width shows from part of the way to the far wall, so the side walls are in the picture.
  const fit = THREE.MathUtils.radToDeg(2 * Math.atan((across / 2) / Math.max(0.5, away * BUILDER.scene.fitDepthShare)))
  const corners = stand.corner === VIEW_CORNER.Left || stand.corner === VIEW_CORNER.Right
  const fov = corners ? BUILDER.scene.cornerFov : Math.min(BUILDER.scene.maxFov, Math.max(BUILDER.scene.minFov, fit))
  const horizontal = THREE.MathUtils.degToRad(fov)
  const fullHeight = height * (1 + BUILDER.scene.lensShift)
  const vertical = 2 * Math.atan(Math.tan(horizontal / 2) * (fullHeight / width))
  const view = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(vertical), width / fullHeight, 0.05, 100)

  view.setViewOffset(width, fullHeight, 0, fullHeight - height, width, height)
  view.position.set(x, eye, z)
  view.lookAt(lookX, eye, lookZ)

  return view
}

/**
 * The room as a three.js scene, in metres: x across (0 at the left wall), y up, z towards the front (0 at the back
 * wall).
 * @param plan - The room.
 * @param anisotropy - The sharpest texture filtering the GPU offers.
 */
function buildScene(plan: Plan, anisotropy: number) {
  const { width, length, height, finish } = plan
  const mood = BUILDER.scene.moods[finish.timeOfDay]
  const scene = new THREE.Scene()
  const sun = new THREE.DirectionalLight(mood.sun, mood.sunPower)
  const reach = Math.max(width, length) * 1.2
  // The floor and ceiling are the outline's shape; turned flat, the shape's y runs along the room (the floor's is
  // flipped, as it turns the other way).
  const shape = (flip: number) => new THREE.ShapeGeometry(new THREE.Shape(plan.outline.map((p) => new THREE.Vector2(p.x / 100, (flip * p.y) / 100))))
  const floor = new THREE.Mesh(shape(-1), floorMaterial(plan, anisotropy))
  // The ceiling gets no direct light, so it glows a little to read as the color it is.
  const ceiling = new THREE.Mesh(
    shape(1),
    new THREE.MeshStandardMaterial({ color: finish.ceilingColor, emissive: finish.ceilingColor, emissiveIntensity: 0.55, roughness: 0.9 })
  )
  // Every wall but the one behind the camera is drawn, with the windows and doors on them.
  const behind = cameraStand(plan).behind

  scene.background = new THREE.Color(BUILDER.scene.background)
  scene.add(new THREE.HemisphereLight(BUILDER.scene.sky, BUILDER.scene.ground, mood.sky), new THREE.AmbientLight(BUILDER.scene.sky, mood.ambient))
  sun.position.set(width * 0.3, height * 2.2, length * 0.8)
  sun.target.position.set(width / 2, 0, length / 2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.1, far: reach * 4 })
  scene.add(sun, sun.target)

  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  floor.userData.surface = MASK_ID.floor
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(0, height, 0)
  ceiling.userData.surface = MASK_ID.ceiling
  scene.add(floor, ceiling)

  for (const wall of walls(plan).filter((w) => w.index !== behind)) {
    const mesh = wallMesh(plan, wall, wallPaint(plan, wall, anisotropy))

    mesh.userData.surface = MASK_ID.wall
    mesh.receiveShadow = true
    scene.add(mesh, skirting(plan, wall))
  }

  for (const [index, item] of plan.items.entries()) {
    const drawn = !isWallItem(item) ? model(item) : item.wall !== behind ? (isMountedShape(item.shape) ? hung(plan, item) : opening(plan, item)) : null

    if (!drawn) {
      continue
    }

    drawn.userData.item = index
    scene.add(drawn)
  }

  return scene
}

/**
 * Small pictures of several views of the room, drawn by one renderer one at a time (so the page stays responsive),
 * each with whatever blocks it (see `blockingItem`), for choosing which views to make photos of.
 * @param plan - The room.
 * @param shots - The views: the wall each looks at and where its camera stands.
 * @param width - Each picture's width, in pixels (its height is the guide's 4:3).
 * @param onPicture - Takes each picture as it is drawn: its view, a JPEG data URL and the object blocking it, if any.
 * @param stopped - Whether to stop drawing (the pictures are no longer wanted).
 * @throws Error when the browser has no WebGL.
 */
export async function drawViewPictures(
  plan: Plan,
  shots: PlanShot[],
  width: number,
  onPicture: (picture: { shot: PlanShot; url: string; blocking: PlanItem | null }) => void,
  stopped: () => boolean
) {
  const height = Math.round((width * BUILDER.guide.height) / BUILDER.guide.width)
  const canvas = document.createElement("canvas")
  const view = new PlanScene(canvas)

  try {
    for (const shot of shots) {
      // Lets the page paint between pictures (a timer rather than a frame, which a hidden tab never gets).
      await new Promise((resolve) => setTimeout(resolve, 0))

      if (stopped()) {
        return
      }

      const seen = { ...plan, ...shot }

      view.render(seen, width, height, 1)
      onPicture({ shot, url: canvas.toDataURL("image/jpeg", 0.85), blocking: blockingItem(seen) })
    }
  } finally {
    view.dispose(true)
  }
}

/**
 * The object that blocks the camera's view, if any: one filling more than `BUILDER.scene.blockedShare` of the guide,
 * as something standing where the camera stands does (a cabinet in the corner it is taken from).
 * @param plan - The room.
 * @returns The object, or null when the view is open.
 * @throws Error when the browser has no WebGL.
 */
export function blockingItem(plan: Plan): PlanItem | null {
  const [width, height] = [Math.round(BUILDER.guide.width / BUILDER.scene.blockedScale), Math.round(BUILDER.guide.height / BUILDER.scene.blockedScale)]
  const { ids } = renderMasks(plan, width, height)
  const counts = new Map<number, number>()

  for (const id of ids) {
    if (id > 0 && id < MASK_ID.floor) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }

  const [id, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]

  return count > ids.length * BUILDER.scene.blockedShare ? (plan.items[id - 1] ?? null) : null
}

/**
 * Where each object shows in the guide (the 3D view sent for a photo): its bounding box as shares of the picture, from
 * the object mask render. Objects the camera doesn't see, or barely, are left out.
 * @param plan - The room.
 * @throws Error when the browser has no WebGL.
 */
export function objectBoxes(plan: Plan): ItemBox[] {
  const { width, height } = BUILDER.guide
  const { ids } = renderMasks(plan, width, height)
  const boxes = new Map<number, { count: number; left: number; top: number; right: number; bottom: number }>()

  for (let p = 0; p < ids.length; p++) {
    const id = ids[p]

    if (id === 0 || id >= MASK_ID.floor) {
      continue
    }

    const [x, y] = [p % width, Math.floor(p / width)]
    const box = boxes.get(id - 1) ?? { count: 0, left: x, top: y, right: x, bottom: y }

    box.count++
    box.left = Math.min(box.left, x)
    box.top = Math.min(box.top, y)
    box.right = Math.max(box.right, x)
    box.bottom = Math.max(box.bottom, y)
    boxes.set(id - 1, box)
  }

  return [...boxes.entries()]
    .filter(([, box]) => box.count >= ids.length * BUILDER.accuracy.minShare)
    .sort(([a], [b]) => a - b)
    .map(([item, box]) => ({ item, left: box.left / width, top: box.top / height, right: (box.right + 1) / width, bottom: (box.bottom + 1) / height }))
}

/**
 * What a pixel of an object mask render holds: 1 + the object's position in `plan.items`, or one of these for the
 * room's surfaces (0 is nothing).
 */
export const MASK_ID = { floor: 250, wall: 251, ceiling: 252 } as const

/**
 * The room as the photo's camera sees it, with every object in its own flat color and no light or shadow: for each
 * pixel, which object is there. It is the exact outline each object should have in the generated photo.
 * @param plan - The room.
 * @param width - The picture's width, in pixels.
 * @param height - The picture's height, in pixels.
 * @returns For each pixel, row by row from the top, 1 + the object's index, a `MASK_ID` surface, or 0; and the camera
 *   it was seen with (three.js metres: x across the plan, y up, z down the plan).
 * @throws Error when the browser has no WebGL.
 */
export function renderMasks(plan: Plan, width: number, height: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  const scene = buildScene(plan, 1)
  const view = camera(plan, width, height)
  const target = new THREE.WebGLRenderTarget(width, height)
  const rgba = new Uint8Array(width * height * 4)
  const ids = new Uint8Array(width * height)
  const flat = new Map<number, THREE.MeshBasicMaterial>()
  /** The flat material of an id, whose red channel is the id exactly. */
  const look = (id: number) => {
    if (!flat.has(id)) {
      flat.set(id, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(id / 255, 0, 0, THREE.LinearSRGBColorSpace), side: THREE.DoubleSide }))
    }

    return flat.get(id)!
  }

  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  scene.background = new THREE.Color(0, 0, 0)
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }

    let owner: THREE.Object3D | null = object

    while (owner && owner.userData.item === undefined && owner.userData.surface === undefined) {
      owner = owner.parent
    }

    const id = owner?.userData.item !== undefined ? owner.userData.item + 1 : (owner?.userData.surface ?? 0)

    for (const m of [object.material].flat() as THREE.MeshStandardMaterial[]) {
      m.map?.dispose()
      m.dispose()
    }

    object.material = look(id)
  })
  renderer.setRenderTarget(target)
  renderer.render(scene, view)
  renderer.readRenderTargetPixels(target, 0, 0, width, height, rgba)

  // WebGL reads rows from the bottom.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ids[y * width + x] = rgba[((height - 1 - y) * width + x) * 4]
    }
  }

  target.dispose()
  dispose(scene)

  for (const m of flat.values()) {
    m.dispose()
  }

  renderer.dispose()
  // Frees the WebGL context now rather than when it is collected: browsers allow only a few at once.
  renderer.forceContextLoss()

  return { ids, camera: view }
}

/**
 * A wall as a plane facing into the room, marked with which wall it is.
 * @param plan - The room.
 * @param wall - The wall.
 * @param paint - Its material.
 */
function wallMesh(plan: Plan, wall: OutlineWall, paint: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wall.length / 100, plan.height), paint)

  mesh.position.set((wall.start.x + wall.end.x) / 200, plan.height / 2, (wall.start.y + wall.end.y) / 200)
  mesh.rotation.y = wallTurn(wall)
  mesh.userData.wall = wall.index

  return mesh
}

/**
 * A wall's surface: the room's wall finish and color, or the accent wall's own; plain paint is a matte color, any other
 * finish a texture of it (bricks, panels, tiles...) at its real size along the wall.
 * @param plan - The room.
 * @param wall - The wall.
 * @param anisotropy - The sharpest texture filtering the GPU offers.
 */
function wallPaint(plan: Plan, wall: OutlineWall, anisotropy: number) {
  const [kind, color] = wallSurface(plan, wall.index)

  if (kind === WALL_FINISH.Paint) {
    return material(color)
  }

  return tileMaterial((context, size) => paintWall(context, kind, color, size), wall.length / 100 / WALL_TILE_METRES, plan.height / WALL_TILE_METRES, anisotropy)
}

/**
 * The skirting boards along a wall's foot, in the room's trim color, stopping at its doors (and at windows down to the
 * floor). They count as the wall in the object masks.
 * @param plan - The room.
 * @param wall - The wall.
 */
function skirting(plan: Plan, wall: OutlineWall) {
  const { height, depth } = BUILDER.scene.skirting
  const group = new THREE.Group()
  const block = blockAdder(group, material(plan.finish.trimColor))
  const gaps = plan.items
    .filter((i) => i.wall === wall.index && (i.shape === ITEM_SHAPE.Door || (i.shape === ITEM_SHAPE.Window && i.elevation < height * 100)))
    .map((i) => [i.x - i.width / 2, i.x + i.width / 2] as const)
    .sort((a, b) => a[0] - b[0])
  let from = 0

  for (const [start, end] of [...gaps, [wall.length, wall.length] as const]) {
    if (start - from > 1) {
      block((start - from) / 100, height, depth, ((from + start) / 2 - wall.length / 2) / 100, height / 2, depth / 2)
    }

    from = Math.max(from, end)
  }

  group.position.set((wall.start.x + wall.end.x) / 200, 0, (wall.start.y + wall.end.y) / 200)
  group.rotation.y = wallTurn(wall)
  group.userData.surface = MASK_ID.wall

  return group
}

/**
 * How a wall is turned: the same turn as its plane, so a model's x runs along the wall from its left end (facing it)
 * and its z points into the room.
 * @param wall - The wall.
 */
function wallTurn(wall: OutlineWall) {
  return -Math.atan2(wall.dy, wall.dx)
}

/**
 * A window or door in its wall: a framed pane of glass at its height above the floor, or a door leaf with its frame
 * and handle (two leaves for a wide door).
 * @param plan - The room.
 * @param item - The window or door.
 */
function opening(plan: Plan, item: PlanItem & { wall: number }) {
  const [w, h, bottom] = [item.width / 100, item.height / 100, item.elevation / 100]
  const paint = material(item.color)
  const group = new THREE.Group()
  const block = blockAdder(group, paint)
  const frame = 0.06
  const at = wallPoint(plan, item.wall, item.x)

  if (item.shape === ITEM_SHAPE.Window) {
    const pane = new THREE.MeshStandardMaterial({ color: BUILDER.scene.glass, emissive: BUILDER.scene.glass, emissiveIntensity: 0.55, roughness: 0.15 })
    // An arched window's round top is a half circle as wide as the window (kept within its height).
    const arch = item.label.toLowerCase().includes(BUILDER.archWord) ? Math.min(w / 2, h * 0.6) : 0
    const sides = h - arch

    if (arch > 0) {
      const inner = arch - frame / 2
      const outline = new THREE.Shape()

      outline.moveTo(-inner, 0)
      outline.lineTo(inner, 0)
      outline.lineTo(inner, sides - frame / 2)
      outline.absarc(0, sides - frame / 2, inner, 0, Math.PI, false)
      outline.closePath()
      const glass = new THREE.Mesh(new THREE.ShapeGeometry(outline, 32), pane)

      block(1, 1, 1, 0, bottom + sides, frame / 2, paint, new THREE.RingGeometry(arch - frame, arch, 32, 1, 0, Math.PI))
      glass.position.set(0, bottom + frame / 2, 0.004)
      group.add(glass)
    } else {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - frame, h - frame), pane)

      glass.position.set(0, bottom + h / 2, 0.004)
      group.add(glass)
      block(w, frame, frame, 0, bottom + h - frame / 2, frame / 2)
    }

    block(w, frame, frame, 0, bottom + frame / 2, frame / 2)
    block(frame, sides, frame, -w / 2 + frame / 2, bottom + sides / 2, frame / 2)
    block(frame, sides, frame, w / 2 - frame / 2, bottom + sides / 2, frame / 2)

    if (w > 1.3) {
      block(frame * 0.8, h, frame, 0, bottom + h / 2, frame / 2)
    }

    if (bottom > 0.05) {
      block(w + 0.08, 0.03, 0.14, 0, bottom - 0.015, 0.07)
    }
  } else {
    const trim = material(shade(item.color, 1.06))
    const metal = new THREE.MeshStandardMaterial({ color: BUILDER.scene.metal, roughness: 0.35, metalness: 0.8 })
    const leaves = w > 1.2 ? 2 : 1
    const leaf = (w - 2 * frame) / leaves

    block(frame, h, 0.03, -w / 2 + frame / 2, h / 2, 0.015, trim)
    block(frame, h, 0.03, w / 2 - frame / 2, h / 2, 0.015, trim)
    block(w, frame, 0.03, 0, h - frame / 2, 0.015, trim)

    for (let i = 0; i < leaves; i++) {
      const middle = -w / 2 + frame + leaf * (i + 0.5)
      // The handle sits on the leaf's edge away from its hinge: the middle for a pair of leaves.
      const side = leaves === 2 ? (i === 0 ? 1 : -1) : 1

      block(leaf - 0.006, h - frame, 0.04, middle, (h - frame) / 2, 0.02)
      block(0.12, 0.02, 0.03, middle + side * (leaf / 2 - 0.12), 1.0, 0.06, metal)
    }
  }

  group.position.set(at.x / 100, 0, at.y / 100)
  group.rotation.y = wallTurn(wallOf(plan, item.wall))

  return group
}

/**
 * A function that adds a box to a group, casting and receiving shadows: its width, height and depth, where its middle
 * is, its look (the group's paint when missing) and, in place of the box, another shape scaled afterwards.
 * @param group - The group the boxes go in.
 * @param paint - Their usual look.
 * @returns The function, which returns the mesh it added.
 */
function blockAdder(group: THREE.Group, paint: THREE.Material) {
  return (bw: number, bh: number, bd: number, x: number, y: number, z: number, look: THREE.Material = paint, geometry?: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry ?? new THREE.BoxGeometry(bw, bh, bd), look)

    mesh.position.set(x, y, z)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)

    return mesh
  }
}

/**
 * A thing hung on its wall: a picture in its frame (a mirror's glass, a TV's dark screen, or a plain mid-tone face for
 * a painting, which the photo fills with art), or a wall box (a cabinet with a seam per door, a shelf, or a cooker hood with its canopy
 * and a chimney up to the ceiling).
 * @param plan - The room.
 * @param item - The hung object.
 */
function hung(plan: Plan, item: PlanItem & { wall: number }) {
  const [w, h, d, bottom] = [item.width / 100, item.height / 100, Math.max(item.depth, 1) / 100, item.elevation / 100]
  const paint = material(item.color)
  const group = new THREE.Group()
  const block = blockAdder(group, paint)
  const name = item.label.toLowerCase()
  const at = wallPoint(plan, item.wall, item.x)

  if (item.shape === ITEM_SHAPE.Picture) {
    const frame = Math.min(0.05, w / 8, h / 8)
    const face = name.includes(BUILDER.mirrorWord)
      ? new THREE.MeshStandardMaterial({ color: BUILDER.scene.glass, emissive: BUILDER.scene.glass, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.6 })
      : name.split(/\W+/).includes(BUILDER.screenWord)
        ? new THREE.MeshStandardMaterial({ color: "#1E1E1E", roughness: 0.25 })
        : material(BUILDER.scene.art)
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * frame, h - 2 * frame), face)

    block(w, h, d, 0, bottom + h / 2, d / 2)
    panel.position.set(0, bottom + h / 2, d + 0.002)
    group.add(panel)
  } else if (name.includes(BUILDER.hoodWord)) {
    const canopy = Math.min(h, 0.25)
    const top = Math.max(bottom + canopy, plan.height - 0.01)

    block(w, canopy, d, 0, bottom + canopy / 2, d / 2)
    block(w * 0.35, top - bottom - canopy, d * 0.5, 0, (top + bottom + canopy) / 2, d * 0.25)
  } else {
    // Cabinet doors: a dark seam every 60 cm or so.
    const doors = h > 0.2 ? Math.max(1, Math.round(w / 0.6)) : 1
    const seam = material(shade(item.color, 0.7))

    block(w, h, d, 0, bottom + h / 2, d / 2)

    for (let n = 1; n < doors; n++) {
      block(0.006, h * 0.96, 0.004, -w / 2 + (w * n) / doors, bottom + h / 2, d + 0.002, seam)
    }
  }

  group.position.set(at.x / 100, 0, at.y / 100)
  group.rotation.y = wallTurn(wallOf(plan, item.wall))

  return group
}

/**
 * One object on the floor as a simple model, placed and turned as on the plan. An L-shaped one is two pieces: the run
 * along its back (with no arm where it meets the leg) and the leg at its right end (a chaise for a sofa); a P-shaped one
 * adds a wider chaise at the leg's front end.
 * @param item - The object.
 */
function model(item: PlanItem) {
  let group: THREE.Group

  if (hasParts(item)) {
    // Each part as its own piece, sized from the object's parts: the back run, the leg below it and a P's chaise.
    const { runDepth, legWidth, chaiseWidth, chaiseDepth } = partsOf(item)!
    const front = item.form === ITEM_FORM.PShaped ? chaiseDepth : 0
    const run = piece({ ...item, depth: runDepth }, { openRight: true })
    const legLength = item.depth - runDepth - front

    group = new THREE.Group()
    run.position.z = -(item.depth - runDepth) / 200
    group.add(run)

    if (legLength > 0) {
      const side = piece({ ...item, width: legWidth, depth: legLength }, { chaise: true })

      side.position.set((item.width - legWidth) / 200, 0, (runDepth - front) / 200)
      group.add(side)
    }

    if (front > 0) {
      const end = piece({ ...item, width: chaiseWidth, depth: front }, { chaise: true })

      end.position.set((item.width - chaiseWidth) / 200, 0, (item.depth - front) / 200)
      group.add(end)
    }
  } else {
    group = piece(item, {})
  }

  group.position.set(item.x / 100, 0, item.y / 100)
  group.rotation.y = -THREE.MathUtils.degToRad(item.rotation)

  return group
}

/**
 * An object's model of its shape around its middle, with real proportions: seats at sitting height, a mattress on a
 * bed frame, table tops on legs (a round top on a pedestal for a round table).
 * @param item - The object, or one piece of an L-shaped one.
 * @param options - For pieces of an L: `openRight` leaves out a sofa's right arm, `chaise` makes it a seat with one arm and no back.
 */
function piece(item: Pick<PlanItem, "label" | "shape" | "width" | "depth" | "height" | "color" | "form">, options: { openRight?: boolean; chaise?: boolean }) {
  const [w, d, h] = [item.width / 100, item.depth / 100, Math.max(item.height, 1) / 100]
  const paint = material(item.color)
  const darker = material(shade(item.color, 0.78))
  const group = new THREE.Group()
  /** Adds a block of the object, by its size and the position of its middle. */
  const block = blockAdder(group, paint)
  /** Adds a soft block, with rounded edges. */
  const soft = (bw: number, bh: number, bd: number, x: number, y: number, z: number, look: THREE.Material = paint) =>
    block(bw, bh, bd, x, y, z, look, new RoundedBoxGeometry(bw, bh, bd, 3, Math.min(bw, bh, bd) * 0.25))
  /** Adds a round piece, stretched to an ellipse when its sides differ. */
  const round = (bw: number, bh: number, bd: number, y: number, top = 0.5, bottom = 0.5, look: THREE.Material = paint) => {
    const mesh = block(1, 1, 1, 0, y, 0, look, new THREE.CylinderGeometry(top, bottom, 1, 32))

    mesh.scale.set(bw, bh, bd)

    return mesh
  }
  const legs = (legHeight: number, size: number, look: THREE.Material = paint) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      block(size, legHeight, size, sx * (w / 2 - size / 2), legHeight / 2, sz * (d / 2 - size / 2), look)
    }
  }

  if (item.form === ITEM_FORM.Round && item.shape === ITEM_SHAPE.Rug) {
    round(w, 0.01, d, 0.005)

    return group
  }

  if (item.form === ITEM_FORM.Round && item.shape === ITEM_SHAPE.Table) {
    // A round or oval top on a pedestal and a foot.
    const top = Math.min(0.04, h * 0.08)

    round(w, top, d, h - top / 2)
    round(0.08, h - top, 0.08, (h - top) / 2)
    round(Math.min(w, d) * 0.5, 0.03, Math.min(w, d) * 0.5, 0.015)

    return group
  }

  switch (item.shape) {
    case ITEM_SHAPE.Rounded:
      soft(w, h, d, 0, h / 2, 0)
      break
    case ITEM_SHAPE.Cylinder: {
      if (!item.label.toLowerCase().includes(BUILDER.stoolWord)) {
        // A darker rim marks its top, so its height reads (a plain cylinder came out taller in photos).
        const rim = Math.min(0.03, h * 0.08)

        round(w, h - rim, d, (h - rim) / 2)
        round(w * 1.02, rim, d * 1.02, h - rim / 2, 0.5, 0.5, darker)
        break
      }

      // A stool: a round seat on four slightly splayed legs joined by a footrest ring, so it reads as a stool.
      const seat = Math.min(0.05, h * 0.1)

      round(w, seat, d, h - seat / 2)
      const leg = Math.min(0.03, w / 10)

      for (let i = 0; i < 4; i++) {
        const turn = Math.PI / 4 + (i * Math.PI) / 2
        const [dx, dz] = [Math.cos(turn) * (w / 2 - leg) * 0.8, Math.sin(turn) * (d / 2 - leg) * 0.8]
        const post = block(leg, h - seat, leg, dx, (h - seat) / 2, dz, darker, new THREE.CylinderGeometry(0.5, 0.5, 1, 12))

        post.scale.set(leg, h - seat, leg)
        post.rotation.set(Math.sin(turn) * 0.06, 0, -Math.cos(turn) * 0.06)
      }

      const ring = block(1, 1, 1, 0, h * 0.35, 0, darker, new THREE.TorusGeometry(0.5, 0.04, 8, 32))

      ring.scale.set(w * 0.8, w * 0.8, w * 0.8)
      ring.rotation.x = Math.PI / 2
      break
    }
    case ITEM_SHAPE.Sofa: {
      // A seat at sitting height on short legs, a cushioned back and two arms.
      const seat = Math.min(0.45, h * 0.55)
      const arm = Math.min(0.18, w * 0.12)
      const back = Math.min(0.22, d * 0.25)
      const armHeight = Math.min(h * 0.75, seat + 0.2)
      const arms = options.openRight ? 1 : 2
      const sideArm = (x: number) => soft(arm, armHeight - 0.06, d, x, 0.06 + (armHeight - 0.06) / 2, 0)

      legs(0.06, 0.05, darker)
      block(w, seat - 0.16, d, 0, 0.06 + (seat - 0.16) / 2, 0)

      if (options.chaise) {
        // The leg of a corner sofa: a long seat with an arm on its outer side, its back being the run's seat.
        soft(w - arm, 0.12, d, -arm / 2, seat - 0.06, 0)
        sideArm(w / 2 - arm / 2)
        break
      }

      soft(w - arms * arm, 0.12, d - back, options.openRight ? arm / 2 : 0, seat - 0.06, back / 2)
      soft(w, h - 0.06, back, 0, 0.06 + (h - 0.06) / 2, -d / 2 + back / 2)
      sideArm(-w / 2 + arm / 2)

      if (!options.openRight) {
        sideArm(w / 2 - arm / 2)
      }

      break
    }
    case ITEM_SHAPE.Bed: {
      // A frame, a mattress with the bedding in the bed's color, two pillows and a headboard.
      const frame = Math.min(0.3, h * 0.35)
      const mattress = Math.min(0.22, h * 0.25)
      const head = Math.min(0.08, d * 0.05)
      const pillow = material(BUILDER.scene.linen)
      const pillows = w > 1.2 ? 2 : 1

      block(w, frame, d - head, 0, frame / 2, head / 2, darker)
      soft(w - 0.04, mattress, d - head - 0.04, 0, frame + mattress / 2, head / 2)

      for (let i = 0; i < pillows; i++) {
        const pw = (w - 0.12) / pillows - 0.04

        soft(pw, 0.12, 0.4, -w / 2 + 0.08 + (pw + 0.04) * (i + 0.5), frame + mattress + 0.05, -d / 2 + head + 0.25, pillow)
      }

      block(w, h, head, 0, h / 2, -d / 2 + head / 2, darker)
      break
    }
    case ITEM_SHAPE.Table: {
      const top = Math.min(0.04, h * 0.08)

      block(w, top, d, 0, h - top / 2, 0)
      legs(h - top, Math.min(0.05, w / 6, d / 6))
      break
    }
    case ITEM_SHAPE.Chair: {
      // A seat on four legs and an open back (two posts, a top rail and a slat), so it reads as a chair from any side,
      // even from behind (a solid back panel turned into a wooden block).
      const seat = Math.min(0.46, h * 0.55)
      const post = Math.min(0.035, w / 8, d / 8)

      block(w, 0.05, d, 0, seat - 0.025, 0)
      legs(seat - 0.05, post)
      const back = -d / 2 + post / 2

      for (const side of [-1, 1]) {
        block(post, h - seat, post, side * (w / 2 - post / 2), seat + (h - seat) / 2, back)
      }

      block(w, (h - seat) * 0.28, 0.025, 0, h - ((h - seat) * 0.28) / 2, back)
      block(w - 2 * post, 0.04, 0.02, 0, seat + (h - seat) * 0.45, back)
      break
    }
    case ITEM_SHAPE.Rug:
      block(w, 0.01, d, 0, 0.005, 0)
      break
    case ITEM_SHAPE.Plant: {
      // Leaf clusters around a stem, filling its width and height, so it reads as a plant rather than a ball (photos
      // drew the ball's plant wider).
      const pot = Math.min(0.4, h * 0.3)

      round(w * 0.55, pot, d * 0.55, pot / 2, 0.5, 0.4, material(BUILDER.scene.pot))
      const top = h - pot

      round(0.03, top * 0.6, 0.03, pot + top * 0.3, 0.5, 0.5, darker)

      for (const [fx, fy, fz, size] of PLANT_CLUSTERS) {
        const leaves = block(1, 1, 1, 0, 0, 0, paint, new THREE.SphereGeometry(0.5, 16, 12))

        leaves.scale.set(w * size, top * size, d * size)
        leaves.position.set(fx * (w / 2) * (1 - size), pot + top * (size / 2 + fy * (1 - size)), fz * (d / 2) * (1 - size))
      }

      break
    }
    case ITEM_SHAPE.Lamp: {
      const shadeHeight = Math.min(0.35, h * 0.25)

      round(w * 0.6, 0.03, d * 0.6, 0.015)
      round(0.03, h - shadeHeight, 0.03, (h - shadeHeight) / 2)
      round(w, shadeHeight, d, h - shadeHeight / 2, 0.35, 0.5)
      break
    }
    default: {
      const name = item.label.toLowerCase()

      if (!name.split(/\W+/).includes(BUILDER.glassWord) || item.height <= BUILDER.glassTrayHeight) {
        block(w, h, d, 0, h / 2, 0)
        break
      }

      // A shower's glass: a low tray, clear panes on its front (part of it for a screen) and its right, a thin post at the front pane's end.
      const tray = 0.05
      const glass = new THREE.MeshStandardMaterial({ color: BUILDER.scene.glass, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1, depthWrite: false })
      const metal = new THREE.MeshStandardMaterial({ color: BUILDER.scene.metal, roughness: 0.35, metalness: 0.8 })
      const screen = name.includes(BUILDER.glassScreenWord)
      const front = screen ? w * 0.6 : w
      const thin = 0.01

      block(w, tray, d, 0, tray / 2, 0)
      block(front, h - tray, thin, -w / 2 + front / 2, tray + (h - tray) / 2, d / 2 - thin / 2, glass).castShadow = false
      block(0.02, h - tray, 0.02, -w / 2 + front - 0.01, tray + (h - tray) / 2, d / 2 - 0.01, metal)

      if (!screen) {
        block(thin, h - tray, d, w / 2 - thin / 2, tray + (h - tray) / 2, 0, glass).castShadow = false
      }

      break
    }
  }

  return group
}

/**
 * A plant's leaf clusters: where each sits, from -1 to 1 across and deep and 0 (low) to 1 (high), and its size as a
 * share of the plant's width, depth and leafy height. Together they reach every side of the plant's box.
 */
const PLANT_CLUSTERS = [
  [0, 0.45, 0, 0.62],
  [-1, 0.35, 0.3, 0.45],
  [1, 0.4, -0.3, 0.45],
  [0.3, 1, 0.4, 0.42],
  [-0.4, 0.85, -0.5, 0.42],
  [0.2, 0, 1, 0.4],
  [-0.2, 0.1, -1, 0.4],
] as const

/**
 * The floor's material: its pattern painted in its color, repeated every `FLOOR_TILE_METRES` (the floor's texture
 * coordinates are in metres).
 * @param plan - The room.
 * @param anisotropy - The sharpest texture filtering the GPU offers.
 */
function floorMaterial(plan: Plan, anisotropy: number) {
  return tileMaterial((context, size) => paintFloor(context, plan.floorType, plan.floorColor, size), 1 / FLOOR_TILE_METRES, 1 / FLOOR_TILE_METRES, anisotropy, 0.7)
}

/**
 * A matte material of a painted tile repeated across a surface (a floor's or a wall's pattern).
 * @param paint - Paints the tile on a square canvas of a size.
 * @param repeatX - How many times the tile repeats across the surface's texture coordinates.
 * @param repeatY - How many times it repeats up them.
 * @param anisotropy - The sharpest texture filtering the GPU offers.
 * @param roughness - How rough it looks.
 */
function tileMaterial(paint: (context: CanvasRenderingContext2D, size: number) => void, repeatX: number, repeatY: number, anisotropy: number, roughness = 0.85) {
  const canvas = document.createElement("canvas")

  canvas.width = canvas.height = 512
  paint(canvas.getContext("2d")!, 512)
  const texture = new THREE.CanvasTexture(canvas)

  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.anisotropy = anisotropy

  return new THREE.MeshStandardMaterial({ map: texture, roughness, metalness: 0 })
}

/**
 * A matte material of a color.
 * @param color - The color, "#RRGGBB" or rgb().
 */
function material(color: string) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0 })
}

/**
 * Frees a scene's geometries, materials and textures.
 * @param scene - The scene.
 */
function dispose(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }

    object.geometry.dispose()

    for (const m of [object.material].flat() as THREE.MeshStandardMaterial[]) {
      m.map?.dispose()
      m.dispose()
    }
  })
}
