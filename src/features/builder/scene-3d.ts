import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"

import {
  BACKSPLASH,
  BUILDER,
  CASING,
  CEILING_STYLE,
  COVERING_KIND,
  CURTAIN_LENGTH,
  ITEM_FORM,
  ITEM_SHAPE,
  MOULDING,
  PANORAMA,
  PLAN_SIDE,
  TILE_PATTERN,
  type Sheen,
  TIME_OF_DAY,
  WAINSCOT,
  WALL_FINISH,
  ZONE,
  type FloorType,
  type TilePattern,
  type WallFinish,
} from "@/lib/constants"
import type { ItemBox, OutlinePoint, Plan, PlanItem, PlanShot, RoomFittings, WindowCovering, Worktop } from "./api"
import { basinModel, cabinetFront, sinkModel } from "./cabinet-3d"
import { isCurtains } from "./covering"
import { isCabinet } from "./fittings"
import { isCeilingLight, isLightOn, spotGrid, trackHeads } from "./lights"
import { CUBE_FACES, type Vec3 } from "./panorama"
import type { PanoramaJob } from "./panorama.worker"
import { hasParts, isMountedShape, isWallItem, legSide, partsOf } from "./builder-store"
import { cameraStand, wallLength, wallOf, wallPoint, walls, type OutlineWall } from "./room-outline"
import { FLOOR_TILE_METRES, paintFloor, shade } from "./floor-texture"
import type { Frame } from "./use-view-zoom"
import { archRadius, casingFor, trimBands, trimRuns } from "./trim"
import { behindUnit, OPEN_BEHIND, ownSplashColor, splashHeight, SPLASH_TILE_METRES, type Behind } from "./worktop"
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
  // The last room drawn, kept so a zoom only draws it again (building it is the slow part).
  private last: { plan: Plan; scene: THREE.Scene; width: number; height: number; tilt: number } | null = null

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
   * @param tilt - How far to tilt the photo's camera up, in degrees (the Ceiling tab looks up at it); 0 for the photo's view.
   * @param crop - The part of the picture shown, as shares of it (the 3D view zoomed in); the whole picture when missing.
   */
  render(plan: Plan, width: number, height: number, ratio = window.devicePixelRatio || 1, tilt = 0, crop: Frame = WHOLE_PICTURE) {
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(width, height, false)
    this.forget()
    const scene = buildScene(plan, this.renderer.capabilities.getMaxAnisotropy())

    this.last = { plan, scene, width, height, tilt }
    this.reframe(crop)
  }

  /**
   * Draws the last room again showing another part of the picture, without building it again (the 3D view's zoom).
   * @param crop - The part of the picture shown, as shares of it.
   */
  reframe(crop: Frame) {
    if (!this.last) {
      return
    }

    const { plan, scene, width, height, tilt } = this.last

    this.camera = camera(plan, width, height, crop)
    this.camera.rotateX(THREE.MathUtils.degToRad(tilt))
    this.renderer.render(scene, this.camera)
  }

  /** Frees the last room drawn. */
  private forget() {
    if (this.last) {
      dispose(this.last.scene)
      this.last = null
    }
  }

  /**
   * Draws the room, every wall included, from one point in the six directions of a cube camera.
   * @param plan - The room.
   * @param at - Where the camera stands, in the scene's metres.
   * @param size - Each face's width and height, in pixels.
   * @returns Each face's pixels (RGBA, row by row from the top), in `CUBE_FACES` order; the page gets a frame between
   *   faces, so it keeps responding.
   */
  async renderFaces(plan: Plan, at: THREE.Vector3, size: number): Promise<Uint8ClampedArray[]> {
    const copy = document.createElement("canvas")
    const context = copy.getContext("2d", { willReadFrequently: true })
    const scene = buildScene(plan, this.renderer.capabilities.getMaxAnisotropy(), true)
    const faces: Uint8ClampedArray[] = []

    if (!context) {
      throw new Error("No 2D canvas")
    }

    this.renderer.setPixelRatio(1)
    this.renderer.setSize(size, size, false)
    copy.width = size
    copy.height = size

    for (const { forward, up } of CUBE_FACES) {
      this.renderer.render(scene, cubeCamera(at, forward, up))
      context.drawImage(this.renderer.domElement, 0, 0)
      faces.push(context.getImageData(0, 0, size, size).data)
      await nextFrame()
    }

    dispose(scene)

    return faces
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
    this.forget()
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
 * The room's 360° view from one spot, for the image model: an equirectangular PNG (its middle facing the back wall, its
 * ends meeting behind), with each object's box in it. It is drawn as the six faces of a cube camera at eye height,
 * every wall included, joined into one picture; the boxes come from the same faces drawn in flat object colors. The
 * joining runs in a worker, so the page keeps responding.
 * @param plan - The room.
 * @param spot - Where the camera stands, in cm on the plan.
 * @returns The PNG and the boxes.
 * @throws Error when WebGL is missing or the picture can't be made.
 */
export async function renderPanorama(plan: Plan, spot: OutlinePoint): Promise<{ guide: Blob; boxes: ItemBox[] }> {
  const { width, height, faceSize } = PANORAMA
  const at = new THREE.Vector3(spot.x / 100, eyeHeight(plan), spot.y / 100)
  const canvas = document.createElement("canvas")
  const view = new PlanScene(canvas)
  const ids: Uint8Array[] = []
  let colors: Uint8ClampedArray[]

  try {
    colors = await view.renderFaces(plan, at, faceSize)
  } finally {
    view.dispose(true)
  }

  // One face at a time, with a frame between, so the page keeps responding.
  for (const { forward, up } of CUBE_FACES) {
    ids.push(...drawIds(plan, [cubeCamera(at, forward, up)], faceSize, faceSize, true))
    await nextFrame()
  }

  const job: PanoramaJob = { colors, ids, size: faceSize, width, height, items: plan.items.length, minPixels: PANORAMA.minBoxPixels }
  // Started only once the faces are drawn, so a failed drawing leaves no worker behind.
  const worker = new Worker(new URL("./panorama.worker.ts", import.meta.url), { type: "module" })

  try {
    return await new Promise<{ guide: Blob; boxes: ItemBox[] }>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ guide: Blob; boxes: ItemBox[] } | { error: string }>) => {
        if ("error" in event.data) {
          reject(new Error(event.data.error))

          return
        }

        resolve(event.data)
      }
      worker.onerror = (event) => reject(new Error(event.message))
      worker.postMessage(job, [...colors.map((face) => face.buffer), ...ids.map((face) => face.buffer)])
    })
  } finally {
    worker.terminate()
  }
}

/** Waits for the browser's next frame, so a long drawing lets the page respond between its parts. */
function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * A square 90° camera looking one way, for one face of a cube camera.
 * @param at - Where it stands.
 * @param forward - Where it looks.
 * @param up - Which way is up in its picture.
 */
function cubeCamera(at: THREE.Vector3, forward: Vec3, up: Vec3) {
  const face = new THREE.PerspectiveCamera(90, 1, 0.05, 100)

  face.position.copy(at)
  face.up.set(...up)
  face.lookAt(at.x + forward[0], at.y + forward[1], at.z + forward[2])

  return face
}

/**
 * A photographer's eye height in the room, in metres: below its ceiling.
 * @param plan - The room.
 */
function eyeHeight(plan: Pick<Plan, "height">) {
  return Math.min(BUILDER.scene.eyeHeight, plan.height - 0.3)
}

/** The whole picture, as shares of it. */
const WHOLE_PICTURE: Frame = { x: 0, y: 0, width: 1, height: 1 }

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
 * @param crop - The part of the picture shown, as shares of it (zoomed in); the whole picture when missing.
 */
export function camera(plan: Plan, width: number, height: number, crop: Frame = WHOLE_PICTURE) {
  const eye = eyeHeight(plan)
  const stand = cameraStand(plan)
  const [across, away] = [stand.across / 100, stand.stand / 100]
  const [x, z] = [stand.x / 100, stand.y / 100]
  const [lookX, lookZ] = [x + stand.lookX, z + stand.lookY]

  // The horizontal view that fits the far wall, kept in a wide lens's range, then the vertical view of the taller,
  // shifted frame the picture is cut from.
  // The whole width shows from part of the way to the far wall, so the side walls are in the picture.
  const fit = THREE.MathUtils.radToDeg(2 * Math.atan((across / 2) / Math.max(BUILDER.scene.minFitDistance / 100, away * BUILDER.scene.fitDepthShare)))
  const fov = stand.fov ?? Math.min(BUILDER.scene.maxFov, Math.max(BUILDER.scene.minFov, fit))
  const horizontal = THREE.MathUtils.degToRad(fov)
  const fullHeight = height * (1 + BUILDER.scene.lensShift)
  const vertical = 2 * Math.atan(Math.tan(horizontal / 2) * (fullHeight / width))
  const view = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(vertical), width / fullHeight, 0.05, 100)

  // The picture is the bottom of the taller frame (the lens shifted down), and a zoom shows part of the picture.
  view.setViewOffset(width, fullHeight, crop.x * width, fullHeight - height + crop.y * height, crop.width * width, crop.height * height)
  view.position.set(x, eye, z)
  view.lookAt(lookX, eye, lookZ)

  return view
}

/**
 * A light on the ceiling as a simple model, at its place on the plan and turned as there: a pendant's cord and shade, a
 * chandelier's ring of candle lights, a flush lamp (round, or square when its name says so), recessed spotlights over
 * its size (a row or grid, see `spotGrid`), or a rail with spot heads along it (`trackHeads`). Its bulbs or shade glow
 * in the room's light color when it is on (see `switchOn` for the light it gives), and only a little when it is off.
 * @param plan - The room, for its ceiling's height and light color.
 * @param item - The ceiling light: its width and depth across, its height how far down it reaches.
 * @param on - Whether it is switched on.
 * @returns Its model, in metres, its middle at the light's place on the plan.
 */
function ceilingFixture(plan: Plan, item: PlanItem, on: boolean) {
  const L = BUILDER.scene.lights
  const group = new THREE.Group()
  const top = plan.height
  const [w, d, drop] = [item.width / 100, item.depth / 100, Math.min(item.height / 100, plan.height - 0.1)]
  const tone = L.tones[plan.finish.tone]
  // A shade is open below: seen from under it, its inside shows.
  const shadeMaterial = new THREE.MeshStandardMaterial({ color: item.color, side: THREE.DoubleSide, roughness: 0.8 })
  const metal = material(L.metal)
  const glow = new THREE.MeshStandardMaterial({ color: on ? tone : item.color, emissive: tone, emissiveIntensity: on ? L.glow : L.off })
  const put = placer(group)

  switch (item.shape) {
    case ITEM_SHAPE.PendantLight: {
      const radius = Math.max(w, d) / 2
      const height = Math.min(drop * L.pendant.shadeShare, radius * 1.2)

      put(new THREE.CylinderGeometry(L.pendant.cord, L.pendant.cord, Math.max(0.01, drop - height)), metal, 0, top - (drop - height) / 2, 0)
      put(new THREE.CylinderGeometry(radius * 0.25, radius, height, 32, 1, true), shadeMaterial, 0, top - drop + height / 2, 0)
      put(new THREE.SphereGeometry(radius * 0.3, 16, 12), glow, 0, top - drop + radius * 0.25, 0)
      break
    }

    case ITEM_SHAPE.Chandelier: {
      const ring = (Math.max(w, d) / 2) * (1 - L.chandelier.ringShare / 2)
      const { arms, candle } = L.chandelier

      put(new THREE.CylinderGeometry(0.008, 0.008, drop), metal, 0, top - drop / 2, 0)
      put(new THREE.TorusGeometry(ring, 0.012, 8, 48), metal, 0, top - drop, 0).rotation.x = Math.PI / 2

      for (let arm = 0; arm < arms; arm++) {
        const turn = (arm / arms) * Math.PI * 2

        put(new THREE.SphereGeometry(candle, 12, 10), glow, Math.cos(turn) * ring, top - drop + candle, Math.sin(turn) * ring)
      }

      break
    }

    case ITEM_SHAPE.CeilingLamp: {
      const geometry = /square/i.test(item.label) ? new THREE.BoxGeometry(w, drop, d) : new THREE.CylinderGeometry(w / 2, (w / 2) * 0.9, drop, 40)

      put(geometry, glow, 0, top - drop / 2, 0)
      break
    }

    case ITEM_SHAPE.Spotlight: {
      const { across, deep } = spotGrid(item)

      for (let c = 0; c < across; c++) {
        for (let r = 0; r < deep; r++) {
          const x = across === 1 ? 0 : -w / 2 + (c * w) / (across - 1)
          const z = deep === 1 ? 0 : -d / 2 + (r * d) / (deep - 1)

          put(new THREE.CylinderGeometry(L.spot.radius, L.spot.radius, 0.01, 24), glow, x, top - 0.005, z)
        }
      }

      break
    }

    default: {
      const { rail, can } = L.track
      const heads = trackHeads(item)

      put(new THREE.BoxGeometry(w, rail, rail), metal, 0, top - rail / 2, 0)

      for (let s = 0; s < heads; s++) {
        const x = -w / 2 + (w * (s + 0.5)) / heads

        put(new THREE.CylinderGeometry(can, can * 0.8, can * 2.4, 16), metal, x, top - rail - can * 1.2, 0).rotation.z = (s % 2 === 0 ? 1 : -1) * 0.35
        put(new THREE.CircleGeometry(can * 0.75, 16), glow, x, top - rail - can * 2.45, 0).rotation.x = Math.PI / 2
      }

      break
    }
  }

  group.position.set(item.x / 100, 0, item.y / 100)
  group.rotation.y = -THREE.MathUtils.degToRad(item.rotation)

  return group
}

/**
 * The room as a three.js scene, in metres: x across (0 at the left wall), y up, z towards the front (0 at the back
 * wall).
 * @param plan - The room.
 * @param anisotropy - The sharpest texture filtering the GPU offers.
 * @param allWalls - Whether to draw the wall behind the camera too (for a 360° view, which has no behind).
 */
function buildScene(plan: Plan, anisotropy: number, allWalls = false) {
  const { width, length, height, finish } = plan
  const mood = BUILDER.scene.moods[finish.timeOfDay]
  const scene = new THREE.Scene()
  const sun = new THREE.DirectionalLight(mood.sun, mood.sunPower)
  // How many lights already light the room (see `switchOn`).
  let lit = 0
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
  const behind = allWalls ? -1 : cameraStand(plan).behind

  scene.background = new THREE.Color(BUILDER.scene.background)
  scene.add(new THREE.HemisphereLight(BUILDER.scene.sky, BUILDER.scene.ground, mood.sky), new THREE.AmbientLight(BUILDER.scene.sky, mood.ambient))
  sun.position.copy(sunAt(plan))
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
  scene.add(floor, ceiling, ceilingDetails(plan))

  for (const wall of walls(plan).filter((w) => w.index !== behind)) {
    const mesh = wallMesh(plan, wall, wallPaint(plan, wall, anisotropy))

    mesh.userData.surface = MASK_ID.wall
    mesh.receiveShadow = true
    scene.add(mesh, trim(plan, wall))
  }

  for (const [index, item] of plan.items.entries()) {
    // An area of the floor or a wall is part of that surface (in the masks too), not an object.
    if (item.shape === ITEM_SHAPE.FloorZone) {
      scene.add(floorZone(item, anisotropy, finish.fittings.tiles))
      continue
    }

    if (item.shape === ITEM_SHAPE.WallZone) {
      if (isWallItem(item) && item.wall !== behind) {
        scene.add(wallZone(plan, item, anisotropy))
      }

      continue
    }

    const on = isLightOn(item, finish.timeOfDay)
    const drawn = isCeilingLight(item.shape)
      ? ceilingFixture(plan, item, on)
      : !isWallItem(item)
        ? model(item, item.worktop ? behindUnit(plan, item) : OPEN_BEHIND, finish.fittings)
        : item.wall !== behind
          ? isMountedShape(item.shape)
            ? hung(plan, item)
            : opening(plan, item)
          : null

    if (!drawn) {
      continue
    }

    // A light that is on glows, and lights the room while there are lights left to spend.
    if (on) {
      lit = switchOn(plan, item, drawn, lit < BUILDER.scene.lights.cap) ? lit + 1 : lit
    }

    drawn.userData.item = index
    scene.add(drawn)
  }

  return scene
}

/**
 * Where the sun stands, from the time of day and where north is on the plan (as in the northern half of the world): out
 * past the room's east side in the morning, its south side at midday and its west side at golden hour, low then and high
 * at midday; in the evening in front of the room, for the faint light from outside.
 * @param plan - The room.
 */
function sunAt(plan: Plan) {
  const { width, length, height, finish } = plan
  const S = BUILDER.scene.sun
  // The compass runs clockwise from north as the plan's sides do from its back: east is one side on from north.
  const compass = { [TIME_OF_DAY.Morning]: 1, [TIME_OF_DAY.Midday]: 2, [TIME_OF_DAY.GoldenHour]: 3 } as Record<string, number | undefined>
  const point = compass[finish.timeOfDay]
  const side = point === undefined ? 2 : (point + Object.values(PLAN_SIDE).indexOf(finish.north)) % 4
  // Out from the room's middle past its back, right, front or left side.
  const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][side]
  const out = Math.max(width, length) * S.out
  const up = finish.timeOfDay === TIME_OF_DAY.Midday ? S.high : S.low

  return new THREE.Vector3(width / 2 + dx * out, height * up, length / 2 + dz * out)
}

/**
 * Lights an object that is on: its shade or bulb glows in the room's light color, cabinets get a glowing strip beneath,
 * a piece with a lamp on it (a table lamp is a decoration, not drawn) a glowing stand-in on top; and, when `shines`, a
 * point light there lights the room. Everything is added to the object's own model, so it moves and turns with it.
 * @param plan - The room.
 * @param item - The object, which gives light and is on.
 * @param drawn - Its model.
 * @param shines - Whether it may light the room (there are lights left to spend).
 * @returns Whether it lights the room.
 */
function switchOn(plan: Plan, item: PlanItem, drawn: THREE.Object3D, shines: boolean) {
  const L = BUILDER.scene.lights
  const tone = L.tones[plan.finish.tone]
  const glow = new THREE.MeshStandardMaterial({ color: tone, emissive: tone, emissiveIntensity: L.glow })
  const [w, h, d, bottom] = [item.width / 100, item.height / 100, Math.max(item.depth, 1) / 100, item.elevation / 100]
  const label = item.label.toLowerCase()
  const decorated = (item.decorations ?? []).find((decoration) => BUILDER.lightWords.test(decoration))?.toLowerCase() ?? ""
  // Where the light comes from, in the model's own place: under a ceiling light, in a lamp's shade, out from a hung light, under lit cabinets, or over a piece with a lamp on it.
  let at: THREE.Vector3
  let power: { intensity: number; distance: number } = L.lamp

  if (isCeilingLight(item.shape)) {
    const { across, deep } = spotGrid(item)
    const many = item.shape === ITEM_SHAPE.Spotlight ? across * deep : item.shape === ITEM_SHAPE.TrackLight ? trackHeads(item) : 1

    at = new THREE.Vector3(0, plan.height - h - 0.05, 0)
    power = { intensity: L.ceiling.intensity * Math.min(Math.sqrt(many), L.ceiling.most), distance: L.ceiling.distance }
  } else if (item.shape === ITEM_SHAPE.Lamp) {
    // The shade (the model's last part) glows.
    const shadeMesh = drawn.children.at(-1)

    if (shadeMesh instanceof THREE.Mesh) {
      shadeMesh.material = glow
    }

    at = new THREE.Vector3(0, h * 0.85, 0)
  } else if (isWallItem(item) && /under/.test(decorated)) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.01, 0.03), glow)

    strip.position.set(0, bottom - 0.006, d * 0.7)
    drawn.add(strip)
    at = new THREE.Vector3(0, bottom - 0.1, d * 0.7)
    power = L.strip
  } else if (isWallItem(item) && BUILDER.lightWords.test(label)) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, h, 0.12) / 2, 16, 12), glow)

    bulb.position.set(0, bottom + h / 2, d + 0.02)
    drawn.add(bulb)
    at = new THREE.Vector3(0, bottom + h / 2, d + 0.15)
  } else {
    // A lamp standing on the piece: a glowing stand-in where its shade would be.
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(L.tableLamp.radius, 16, 12), glow)

    bulb.position.set(0, h + L.tableLamp.above, 0)
    drawn.add(bulb)
    at = new THREE.Vector3(0, h + L.tableLamp.above, 0)
    power = { intensity: L.lamp.intensity * L.tableLamp.share, distance: L.lamp.distance }
  }

  if (!shines) {
    return false
  }

  const light = new THREE.PointLight(tone, power.intensity, power.distance, 2)

  light.position.copy(at)
  drawn.add(light)

  return true
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
 * @param framesOnly - Whether a picture is only its frame (its art, screen or mirror is 0), for correcting colors:
 *   the plan's color is the frame's, and the photo fills the rest.
 * @returns For each pixel, row by row from the top, 1 + the object's index, a `MASK_ID` surface, or 0; and the camera
 *   it was seen with (three.js metres: x across the plan, y up, z down the plan).
 * @throws Error when the browser has no WebGL.
 */
export function renderMasks(plan: Plan, width: number, height: number, framesOnly = false) {
  const view = camera(plan, width, height)
  const [ids] = drawIds(plan, [view], width, height, false, framesOnly)

  return { ids, camera: view }
}

/**
 * The object masks sent with a photo's 3D view, by which the API brings the photo's colors back to the room as
 * planned: `renderMasks` at the 3D view's size, as a PNG whose red channel is each pixel's id (the API's
 * `Builder.MaskIds` must match `MASK_ID`).
 * @param plan - The room, seen from the photo's view.
 * @returns The PNG.
 * @throws Error when the browser has no WebGL or the picture can't be made.
 */
export async function renderMaskPng(plan: Plan): Promise<Blob> {
  const { width, height } = BUILDER.guide
  const { ids } = renderMasks(plan, width, height, true)
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")!
  const image = context.createImageData(width, height)

  canvas.width = width
  canvas.height = height

  for (let i = 0; i < ids.length; i++) {
    image.data.set([ids[i], ids[i], ids[i], 255], i * 4)
  }

  context.putImageData(image, 0, 0)

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No masks"))), "image/png"))
}

/**
 * The room with every object in its own flat color and no light or shadow, seen by each camera: for each pixel, which
 * object is there.
 * @param plan - The room.
 * @param cameras - The cameras.
 * @param width - Each picture's width, in pixels.
 * @param height - Each picture's height, in pixels.
 * @param allWalls - Whether the wall behind the plan's own camera is drawn too.
 * @param framesOnly - Whether a picture's art, screen or mirror is 0, leaving only its frame.
 * @returns For each camera, row by row from the top, 1 + the object's index, a `MASK_ID` surface, or 0.
 * @throws Error when the browser has no WebGL.
 */
function drawIds(plan: Plan, cameras: THREE.Camera[], width: number, height: number, allWalls: boolean, framesOnly = false) {
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  const scene = buildScene(plan, 1, allWalls)
  const target = new THREE.WebGLRenderTarget(width, height)
  const rgba = new Uint8Array(width * height * 4)
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

    const owned = owner?.userData.item !== undefined ? owner.userData.item + 1 : (owner?.userData.surface ?? 0)
    const id = framesOnly && object.userData.content ? 0 : owned

    for (const m of [object.material].flat() as THREE.MeshStandardMaterial[]) {
      m.map?.dispose()
      m.dispose()
    }

    object.material = look(id)
  })
  renderer.setRenderTarget(target)
  const pictures = cameras.map((view) => {
    const ids = new Uint8Array(width * height)

    renderer.render(scene, view)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, rgba)

    // WebGL reads rows from the bottom.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        ids[y * width + x] = rgba[((height - 1 - y) * width + x) * 4]
      }
    }

    return ids
  })

  target.dispose()
  dispose(scene)

  for (const m of flat.values()) {
    m.dispose()
  }

  renderer.dispose()
  // Frees the WebGL context now rather than when it is collected: browsers allow only a few at once.
  renderer.forceContextLoss()

  return pictures
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
 * An area of the floor in its own material and color: the material's texture at its real size, lying just above the
 * floor (under rugs) and turned as on the plan. It counts as the floor in the masks.
 * @param item - The area.
 * @param anisotropy - The sharpest texture filtering the GPU offers.
 * @param tiles - How the room's tiles are laid (for a tiled area).
 */
function floorZone(item: PlanItem, anisotropy: number, tiles: TilePattern) {
  const [w, d] = [item.width / 100, item.depth / 100]
  const paint = tileMaterial((context, size) => paintFloor(context, item.material as FloorType, item.color, size, tiles), w / FLOOR_TILE_METRES, d / FLOOR_TILE_METRES, anisotropy, 0.7)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paint)

  mesh.rotation.set(-Math.PI / 2, 0, -THREE.MathUtils.degToRad(item.rotation))
  mesh.position.set(item.x / 100, ZONE.lift, item.y / 100)
  mesh.receiveShadow = true
  mesh.userData.surface = MASK_ID.floor

  return mesh
}

/**
 * An area of a wall in its own finish and color: the finish's texture at its real size (plain paint is its color),
 * just in front of the wall, under its windows, doors, skirting and what hangs on it. It counts as the wall in the masks.
 * @param plan - The room.
 * @param item - The area.
 * @param anisotropy - The sharpest texture filtering the GPU offers.
 */
function wallZone(plan: Plan, item: PlanItem & { wall: number }, anisotropy: number) {
  const [w, h] = [item.width / 100, item.height / 100]
  const finish = item.material as WallFinish
  const paint =
    finish === WALL_FINISH.Paint
      ? material(item.color)
      : tileMaterial((context, size) => paintWall(context, finish, item.color, size, plan.finish.fittings.tiles), w / WALL_TILE_METRES, h / WALL_TILE_METRES, anisotropy)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paint)
  const group = new THREE.Group()
  const at = wallPoint(plan, item.wall, item.x)

  mesh.position.set(0, item.elevation / 100 + h / 2, ZONE.lift)
  mesh.receiveShadow = true
  group.add(mesh)
  group.position.set(at.x / 100, 0, at.y / 100)
  group.rotation.y = wallTurn(wallOf(plan, item.wall))
  group.userData.surface = MASK_ID.wall

  return group
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
    return material(color, BUILDER.scene.paintSheen[plan.finish.wallSheen])
  }

  return tileMaterial((context, size) => paintWall(context, kind, color, size, plan.finish.fittings.tiles), wall.length / 100 / WALL_TILE_METRES, plan.height / WALL_TILE_METRES, anisotropy)
}

/**
 * The trim along a wall, in the room's trim color, stopping at its doors, archways and windows (and their casings): the
 * skirting at its foot, the wainscoting with its cap, the dado and picture rails, and the crown (with a step under it,
 * so it reads as a profile). It counts as the wall in the masks.
 * @param plan - The room.
 * @param wall - The wall.
 */
function trim(plan: Plan, wall: OutlineWall) {
  const base = BUILDER.scene.skirting
  const group = new THREE.Group()
  const paint = material(plan.finish.trimColor)
  const block = blockAdder(group, paint)
  // Trim between two heights (in cm), along the wall's stretches clear of openings.
  const run = (bottom: number, height: number, depth: number) => {
    for (const [from, to] of trimRuns(plan, wall.index, bottom, bottom + height)) {
      block((to - from) / 100, height / 100, depth / 100, ((from + to) / 2 - wall.length / 2) / 100, (bottom + height / 2) / 100, depth / 200)
    }
  }

  run(0, base.height * 100, base.depth * 100)

  for (const band of trimBands(plan)) {
    run(band.bottom, band.height, band.depth)

    if (band.kind === MOULDING.Crown) {
      run(band.bottom - band.height * 0.35, band.height * 0.35, band.depth * 0.5)
    }
  }

  if (plan.finish.details.wainscot !== WAINSCOT.None) {
    wainscot(plan, wall, block, paint)
  }

  group.position.set((wall.start.x + wall.end.x) / 200, 0, (wall.start.y + wall.end.y) / 200)
  group.rotation.y = wallTurn(wall)
  group.userData.surface = MASK_ID.wall

  return group
}

/**
 * A wall's wainscoting, from the skirting up to the dado height, along its stretches clear of openings: a board in the
 * trim color, and on it beadboard's grooves, or shaker panels' frames (raised panels add a raised middle to each).
 * @param plan - The room.
 * @param wall - The wall.
 * @param block - Adds a box to the wall's trim.
 * @param paint - The trim's look.
 */
function wainscot(plan: Plan, wall: OutlineWall, block: ReturnType<typeof blockAdder>, paint: THREE.Material) {
  const { panel, rail } = BUILDER.scene.trim
  const bottom = BUILDER.scene.skirting.height
  const top = BUILDER.wainscotHeight / 100 - rail.height / 2
  const tall = top - bottom
  const middle = bottom + tall / 2
  const seam = material(shade(plan.finish.trimColor, 0.8))

  for (const [from, to] of trimRuns(plan, wall.index, 0, BUILDER.wainscotHeight)) {
    const [left, width] = [(from - wall.length / 2) / 100, (to - from) / 100]

    block(width, tall, 0.006, left + width / 2, middle, 0.003, paint)

    if (plan.finish.details.wainscot === WAINSCOT.Beadboard) {
      for (let x = left + panel.board; x < left + width - 0.01; x += panel.board) {
        block(0.004, tall, 0.002, x, middle, 0.007, seam)
      }

      continue
    }

    // Frames: a rail along the top and bottom, and a stile between panels about 60 cm wide.
    const panels = Math.max(1, Math.round(width / 0.6))
    const each = (width - (panels + 1) * panel.frame) / panels

    block(width, panel.frame, panel.depth, left + width / 2, top - panel.frame / 2, panel.depth / 2)
    block(width, panel.frame, panel.depth, left + width / 2, bottom + panel.frame / 2, panel.depth / 2)

    for (let n = 0; n <= panels; n++) {
      block(panel.frame, tall, panel.depth, left + panel.frame / 2 + n * (each + panel.frame), middle, panel.depth / 2)
    }

    if (plan.finish.details.wainscot === WAINSCOT.RaisedPanels && each > 0.1) {
      for (let n = 0; n < panels; n++) {
        const x = left + panel.frame + each / 2 + n * (each + panel.frame)

        block(each - 2 * panel.inset - 0.04, tall - 2 * panel.frame - 0.06, panel.depth * 0.8, x, middle, panel.depth * 0.4)
      }
    }
  }
}

/**
 * The ceiling's shape under its paint: exposed beams across the room's shorter span (in the beams' color), a grid of
 * coffer ribs, or a tray's lower border along every wall (both in the ceiling's color); nothing for a flat ceiling.
 * Beams and ribs stop where the room's outline does. They count as the ceiling in the masks.
 * @param plan - The room.
 */
function ceilingDetails(plan: Plan) {
  const details = plan.finish.details
  const { beam, coffer, tray } = BUILDER.scene.trim
  const group = new THREE.Group()
  const ceilingLook = new THREE.MeshStandardMaterial({ color: plan.finish.ceilingColor, emissive: plan.finish.ceilingColor, emissiveIntensity: 0.4, roughness: 0.9 })
  const block = blockAdder(group, ceilingLook)
  const xs = plan.outline.map((p) => p.x)
  const ys = plan.outline.map((p) => p.y)
  const [left, right, back, front] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  // Lines across the room every so often (in cm), along x (at a y) or along z (at an x), cut to the room's outline.
  const lines = (alongX: boolean, every: number, width: number, height: number, look: THREE.Material) => {
    const [from, to] = alongX ? [back, front] : [left, right]
    const count = Math.max(1, Math.round((to - from) / every))
    const step = (to - from) / count

    for (let n = 0; n < count; n++) {
      const at = from + step * (n + 0.5)

      for (const [a, b] of crossing(plan.outline, alongX, at)) {
        const [length, middle] = [(b - a) / 100, (a + b) / 200]

        if (alongX) {
          block(length, height, width, middle, plan.height - height / 2, at / 100, look)
        } else {
          block(width, height, length, at / 100, plan.height - height / 2, middle, look)
        }
      }
    }
  }

  group.userData.surface = MASK_ID.ceiling

  if (details.ceiling === CEILING_STYLE.Beams) {
    // The beams span the room's shorter side, so they run along it.
    lines(right - left <= front - back, beam.every * 100, beam.width, beam.height, material(details.beamColor))
  } else if (details.ceiling === CEILING_STYLE.Coffered) {
    lines(true, coffer.size * 100, coffer.rib, coffer.depth, ceilingLook)
    lines(false, coffer.size * 100, coffer.rib, coffer.depth, ceilingLook)
  } else if (details.ceiling === CEILING_STYLE.Tray) {
    for (const wall of walls(plan)) {
      const border = new THREE.Group()

      blockAdder(border, ceilingLook)(wall.length / 100, tray.drop, tray.border, 0, plan.height - tray.drop / 2, tray.border / 2)
      border.position.set((wall.start.x + wall.end.x) / 200, 0, (wall.start.y + wall.end.y) / 200)
      border.rotation.y = wallTurn(wall)
      group.add(border)
    }
  }

  return group
}

/**
 * Where a straight line across the room is inside its outline, in cm along the line: pairs of where it goes in and
 * comes out, as the outline's edges cross it.
 * @param outline - The room's outline.
 * @param alongX - Whether the line runs along x (at a y), else along y (at an x).
 * @param at - The line's y (or x).
 */
function crossing(outline: OutlinePoint[], alongX: boolean, at: number): [number, number][] {
  const hits: number[] = []

  for (const [n, p] of outline.entries()) {
    const q = outline[(n + 1) % outline.length]
    const [pa, qa, pb, qb] = alongX ? [p.y, q.y, p.x, q.x] : [p.x, q.x, p.y, q.y]

    if ((pa <= at && at < qa) || (qa <= at && at < pa)) {
      hits.push(pb + ((at - pa) * (qb - pb)) / (qa - pa))
    }
  }

  hits.sort((a, b) => a - b)

  return hits.flatMap((hit, n) => (n % 2 === 0 && n + 1 < hits.length ? [[hit, hits[n + 1]] as [number, number]] : []))
}

/**
 * The casing around a door, window or archway, in the room's trim color and its width for the room's casing style
 * (narrower next to a corner, so it stays on its wall):
 * down both sides and over the top (round over an arch); an ornate one adds a head cap (a keystone over an arch). A
 * window's also runs under its sill. None for plain reveals.
 * @param plan - The room.
 * @param item - The opening.
 * @param block - Adds a box to the opening's group.
 */
function casing(plan: Plan, item: PlanItem, block: ReturnType<typeof blockAdder>) {
  const width = casingFor(plan, item) / 100
  const depth = BUILDER.scene.trim.casingDepth
  const look = material(plan.finish.trimColor)
  const [w, h, bottom] = [item.width / 100, item.height / 100, item.elevation / 100]
  const arch = archRadius(item) / 100
  const sides = h - arch
  const ornate = plan.finish.details.casing === CASING.Ornate

  if (width <= 0) {
    return
  }

  block(width, sides, depth, -w / 2 - width / 2, bottom + sides / 2, depth / 2, look)
  block(width, sides, depth, w / 2 + width / 2, bottom + sides / 2, depth / 2, look)

  if (arch > 0) {
    const ring = block(1, 1, 1, 0, bottom + sides, depth, look, new THREE.RingGeometry(arch, arch + width, 32, 1, 0, Math.PI))

    ring.scale.set(w / 2 / arch, 1, 1)

    if (ornate) {
      block(0.09, width + 0.04, depth + 0.02, 0, bottom + h + width / 2, (depth + 0.02) / 2, look)
    }
  } else {
    block(w + 2 * width, width, depth, 0, bottom + h + width / 2, depth / 2, look)

    if (ornate) {
      block(w + 2 * width + 0.06, 0.05, depth + 0.03, 0, bottom + h + width + 0.025, (depth + 0.03) / 2, look)
    }
  }

  if (item.shape === ITEM_SHAPE.Window && bottom > 0.05) {
    block(w + width, width * 0.8, depth, 0, bottom - 0.03 - (width * 0.8) / 2, depth / 2, look)
  }
}

/**
 * An outline with a round top (an arch as wide as it is, as tall as its arch), standing on its middle bottom, in metres.
 * @param width - Its width.
 * @param sides - How tall its sides are, under the arch.
 * @param arch - How tall its arch is (0 for square corners).
 */
function archedShape(width: number, sides: number, arch: number) {
  const outline = new THREE.Shape()

  outline.moveTo(-width / 2, 0)
  outline.lineTo(width / 2, 0)
  outline.lineTo(width / 2, sides)

  if (arch > 0) {
    outline.absellipse(0, sides, width / 2, arch, 0, Math.PI, false)
  } else {
    outline.lineTo(-width / 2, sides)
  }

  outline.closePath()

  return outline
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
 * A function that adds a mesh to a group at a point and returns it, for models built of many parts.
 * @param group - The group the meshes go in.
 */
function placer(group: THREE.Group) {
  return (geometry: THREE.BufferGeometry, look: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, look)

    mesh.position.set(x, y, z)
    group.add(mesh)

    return mesh
  }
}

/**
 * A kitchen unit's worktop, around the unit's middle (z towards its front): a slab on top, standing a little out at the
 * front, and the backsplash on the wall behind it: a low upstand or the worktop's material up to the wall cabinets, or
 * tiles or glass in their own color.
 * @param worktop - The worktop.
 * @param w - The unit's width, in metres.
 * @param d - Its depth.
 * @param h - Its height.
 * @param behind - Whether a wall is behind it (none behind a unit standing out, or the leg of an L), and how high a
 *   window there starts: the backsplash stops below it.
 */
function worktopModel(worktop: Worktop, w: number, d: number, h: number, behind: Behind, tiles: TilePattern) {
  const T = BUILDER.scene.worktop
  const group = new THREE.Group()
  const top = new THREE.MeshStandardMaterial({ color: worktop.color, roughness: 0.35 })
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, T.thickness, d + T.overhang), top)
  const own = new THREE.MeshStandardMaterial({
    color: worktop.backsplashColor,
    roughness: worktop.backsplash === BACKSPLASH.Glass ? 0.08 : 0.5,
    metalness: worktop.backsplash === BACKSPLASH.Glass ? 0.2 : 0,
  })
  const height = splashHeight(worktop, h, behind)

  slab.position.set(0, h - T.thickness / 2, T.overhang / 2)
  slab.castShadow = true
  group.add(slab)

  if (height > 0) {
    // Tiles are painted in the room's pattern at their real size.
    const tiled = worktop.backsplash === BACKSPLASH.Tiles
      ? tileMaterial((context, size) => paintWall(context, WALL_FINISH.Tiles, worktop.backsplashColor, size, tiles), w / SPLASH_TILE_METRES, height / SPLASH_TILE_METRES, 4, 0.4)
      : null
    const splash = new THREE.Mesh(new THREE.BoxGeometry(w, height, 0.012), tiled ?? (ownSplashColor(worktop) ? own : top))

    splash.position.set(0, h + height / 2, -d / 2 + 0.006)
    group.add(splash)
  }

  return group
}

/**
 * A window's curtains or blinds, in the window's own place (x along the wall from its middle, y up from the floor, z out
 * into the room): curtains hang from a rod above it, wider than it, to the sill or the floor, a folded panel at each
 * side (sheers across the glass, seen through); a roller or Roman blind covers the glass's top half; venetian blinds
 * are horizontal slats, tilted open, and vertical blinds slats turned open.
 * @param covering - The covering.
 * @param w - The window's width, in metres.
 * @param h - Its height.
 * @param bottom - Its bottom's height above the floor.
 */
function windowCovering(covering: WindowCovering, w: number, h: number, bottom: number, room: { left: number; right: number }) {
  const C = BUILDER.scene.coverings
  const group = new THREE.Group()
  const fabric = new THREE.MeshStandardMaterial({ color: covering.color, roughness: 0.95, side: THREE.DoubleSide })
  const sheerColor = covering.kind === COVERING_KIND.Sheers ? covering.color : C.sheer
  const sheer = new THREE.MeshStandardMaterial({ color: sheerColor, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: C.sheerOpacity })
  const top = bottom + h
  // A blind sits inside the frame and comes down part of the way.
  const inner = w - 0.04
  const drop = h * C.blindShare
  const put = placer(group)
  // A curtain panel with soft folds across it.
  const panel = (width: number, height: number) => {
    const geometry = new THREE.PlaneGeometry(width, height, C.folds * 4, 1)
    const at = geometry.attributes.position

    for (let i = 0; i < at.count; i++) {
      at.setZ(i, Math.sin((at.getX(i) / width + 0.5) * C.folds * Math.PI * 2) * C.foldDepth)
    }

    geometry.computeVertexNormals()

    return geometry
  }

  if (isCurtains(covering.kind)) {
    const rod = top + C.rodAbove
    const end = covering.length === CURTAIN_LENGTH.Floor ? 0.02 : Math.max(0.02, bottom - C.belowSill)
    const [left, right] = [-w / 2 - Math.min(C.rodPast, Math.max(0, room.left - C.rodGap)), w / 2 + Math.min(C.rodPast, Math.max(0, room.right - C.rodGap))]
    const [span, middle] = [right - left, (left + right) / 2]
    const side = Math.max(C.minPanel, w * C.panelShare)

    put(new THREE.CylinderGeometry(C.rodRadius, C.rodRadius, span), material(BUILDER.scene.metal), middle, rod, C.out).rotation.z = Math.PI / 2

    if (covering.kind !== COVERING_KIND.Curtains) {
      put(panel(span, rod - end), sheer, middle, (rod + end) / 2, C.out - 0.03)
    }

    if (covering.kind !== COVERING_KIND.Sheers) {
      put(panel(side, rod - end), fabric, left + side / 2, (rod + end) / 2, C.out)
      put(panel(side, rod - end), fabric, right - side / 2, (rod + end) / 2, C.out)
    }

    return group
  }

  switch (covering.kind) {
    case COVERING_KIND.RollerBlind:
      put(new THREE.BoxGeometry(inner, drop, 0.008), fabric, 0, top - drop / 2, C.out * 0.6)
      put(new THREE.CylinderGeometry(0.03, 0.03, inner), fabric, 0, top, C.out * 0.6).rotation.z = Math.PI / 2
      break
    case COVERING_KIND.RomanBlind:
      // Three soft folds stacked at the top, each standing a little further out.
      for (let fold = 0; fold < 3; fold++) {
        put(new THREE.BoxGeometry(inner, drop / 3, 0.02), fabric, 0, top - (drop / 3) * (fold + 0.5), C.out * 0.6 + fold * 0.012)
      }

      break
    case COVERING_KIND.VenetianBlind:
      for (let y = bottom + C.slat / 2; y < top; y += C.slat) {
        put(new THREE.BoxGeometry(inner, 0.004, 0.045), fabric, 0, y, C.out * 0.6).rotation.x = 0.5
      }

      break
    default:
      for (let x = -inner / 2 + C.verticalSlat / 2; x < inner / 2; x += C.verticalSlat) {
        put(new THREE.BoxGeometry(C.verticalSlat * 0.95, h, 0.004), fabric, x, bottom + h / 2, C.out * 0.6).rotation.y = 1.2
      }

      break
  }

  return group
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

  casing(plan, item, block)

  if (item.shape === ITEM_SHAPE.Archway) {
    // The dim space beyond, inside a plastered reveal in the archway's color.
    const arch = archRadius(item) / 100
    const sides = h - arch
    const beyond = new THREE.Mesh(new THREE.ShapeGeometry(archedShape(w, sides, arch), 32), material(BUILDER.scene.trim.beyond))
    const reveal = 0.04

    beyond.position.set(0, 0, 0.002)
    group.add(beyond)
    block(reveal, sides, 0.01, -w / 2 + reveal / 2, sides / 2, 0.005)
    block(reveal, sides, 0.01, w / 2 - reveal / 2, sides / 2, 0.005)

    if (arch > 0) {
      block(1, 1, 1, 0, sides, 0.006, paint, new THREE.RingGeometry(arch - reveal, arch, 32, 1, 0, Math.PI)).scale.set(w / 2 / arch, 1, 1)
    } else {
      block(w, reveal, 0.01, 0, h - reveal / 2, 0.005)
    }
  } else if (item.shape === ITEM_SHAPE.Window) {
    const pane = new THREE.MeshStandardMaterial({ color: BUILDER.scene.glass, emissive: BUILDER.scene.glass, emissiveIntensity: 0.55, roughness: 0.15 })
    // An arched window's round top is a half circle as wide as the window (kept within its height).
    const arch = item.form === ITEM_FORM.Arched ? Math.min(w / 2, h * 0.6) : 0
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

    if (item.covering) {
      // The rod reaches past the window only as far as the wall goes on each side.
      const room = { left: item.x / 100 - w / 2, right: wallLength(plan, item.wall) / 100 - item.x / 100 - w / 2 }

      group.add(windowCovering(item.covering, w, h, bottom, room))
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
  const paint = material(item.color, sheenRoughness(item.sheen))
  const group = new THREE.Group()
  const block = blockAdder(group, paint)
  const name = item.label.toLowerCase()
  const at = wallPoint(plan, item.wall, item.x)

  if (item.shape === ITEM_SHAPE.Niche) {
    niche(item, group, block, paint)
  } else if (item.shape === ITEM_SHAPE.Picture) {
    const frame = Math.min(0.05, w / 8, h / 8)
    const face = name.includes(BUILDER.mirrorWord)
      ? new THREE.MeshStandardMaterial({ color: BUILDER.scene.glass, emissive: BUILDER.scene.glass, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.6 })
      : name.split(/\W+/).includes(BUILDER.screenWord)
        ? new THREE.MeshStandardMaterial({ color: "#1E1E1E", roughness: 0.25 })
        : material(BUILDER.scene.art)
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * frame, h - 2 * frame), face)

    // What the photo fills in (art, a screen, a mirror): not the plan's color, which is the frame's.
    panel.userData.content = true
    block(w, h, d, 0, bottom + h / 2, d / 2)
    panel.position.set(0, bottom + h / 2, d + 0.002)
    group.add(panel)
  } else if (name.includes(BUILDER.hoodWord)) {
    const canopy = Math.min(h, 0.25)
    const top = Math.max(bottom + canopy, plan.height - 0.01)

    block(w, canopy, d, 0, bottom + canopy / 2, d / 2)
    block(w * 0.35, top - bottom - canopy, d * 0.5, 0, (top + bottom + canopy) / 2, d * 0.25)
  } else if (isCabinet(item) && h > 0.2) {
    // Fitted cabinets: their doors in the room's fronts, handles near their bottom.
    block(w, h, d, 0, bottom + h / 2, d / 2)
    cabinetFront(block, { width: w, bottom, top: bottom + h, front: d }, item.color, plan.finish.fittings, "upper")
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
 * A niche: a recess in the wall, drawn on it as its darker inside with a deeper shadow under its top and down its left
 * side (the light from above), a thin edge in its color around it, and the front edges of its shelves if it has them.
 * @param item - The niche.
 * @param group - Its group, at the wall.
 * @param block - Adds a box to the group.
 * @param paint - Its color.
 */
function niche(item: PlanItem, group: THREE.Group, block: ReturnType<typeof blockAdder>, paint: THREE.Material) {
  const [w, h, bottom] = [item.width / 100, item.height / 100, item.elevation / 100]
  const arch = archRadius(item) / 100
  const sides = h - arch
  const recess = BUILDER.scene.trim.recessShade
  const inside = new THREE.Mesh(new THREE.ShapeGeometry(archedShape(w, sides, arch), 32), material(shade(item.color, recess)))
  const shadow = material(shade(item.color, recess * 0.8))
  const edge = 0.025
  const shelves = /shel/i.test(item.label) ? Math.max(1, Math.floor(h / 0.4)) : 0

  inside.position.set(0, bottom, 0.002)
  group.add(inside)
  block(0.04, sides, 0.002, -w / 2 + 0.02, bottom + sides / 2, 0.004, shadow)

  if (arch === 0) {
    block(w, 0.06, 0.002, 0, bottom + h - 0.03, 0.004, shadow)
    block(w + 2 * edge, edge, 0.01, 0, bottom + h + edge / 2, 0.005)
  } else {
    block(1, 1, 1, 0, bottom + sides, 0.005, paint, new THREE.RingGeometry(arch, arch + edge, 32, 1, 0, Math.PI)).scale.set(w / 2 / arch, 1, 1)
  }

  block(edge, sides, 0.01, -w / 2 - edge / 2, bottom + sides / 2, 0.005)
  block(edge, sides, 0.01, w / 2 + edge / 2, bottom + sides / 2, 0.005)
  block(w + 2 * edge, edge, 0.01, 0, bottom - edge / 2, 0.005)

  for (let n = 1; n <= shelves; n++) {
    block(w, 0.025, 0.02, 0, bottom + (sides * n) / (shelves + 1), 0.01)
  }
}

/**
 * One object on the floor as a simple model, placed and turned as on the plan. An L-shaped one is two pieces: the run
 * along its back (with no arm where it meets the leg) and the leg at its right end (a chaise for a sofa); a P-shaped one
 * adds a wider chaise at the leg's front end.
 * @param item - The object.
 */
function model(item: PlanItem, behind: Behind, fittings: RoomFittings) {
  let group: THREE.Group

  if (hasParts(item)) {
    // Each part as its own piece, sized from the object's parts: the back run, the leg below it and a P's chaise.
    const { runDepth, legWidth, chaiseWidth, chaiseDepth } = partsOf(item)!
    const front = item.form === ITEM_FORM.PShaped ? chaiseDepth : 0
    const run = piece({ ...item, depth: runDepth }, { openRight: true, behind, fittings })
    const legLength = item.depth - runDepth - front

    group = new THREE.Group()
    run.position.z = -(item.depth - runDepth) / 200
    group.add(run)

    if (legLength > 0) {
      const side = piece({ ...item, width: legWidth, depth: legLength }, { chaise: true, fittings })

      side.position.set((item.width - legWidth) / 200, 0, (runDepth - front) / 200)
      group.add(side)
    }

    if (front > 0) {
      const end = piece({ ...item, width: chaiseWidth, depth: front }, { chaise: true })

      end.position.set((item.width - chaiseWidth) / 200, 0, (item.depth - front) / 200)
      group.add(end)
    }

    // A leg on the left: the whole model mirrored across its middle (three.js turns the faces round for it).
    group.scale.x = legSide(item)
  } else {
    group = piece(item, { behind, fittings })
  }

  group.position.set(item.x / 100, 0, item.y / 100)
  group.rotation.y = -THREE.MathUtils.degToRad(item.rotation)

  return group
}

/**
 * An object's model of its shape around its middle, with real proportions: seats at sitting height, a mattress on a
 * bed frame, table tops on legs (a round top on a pedestal for a round table).
 * @param item - The object, or one piece of an L-shaped one.
 * @param options - For pieces of an L: `openRight` leaves out a sofa's right arm, `chaise` makes it a seat with one arm and no back;
 * `behind` is what a worktop's backsplash meets; `fittings`, how the room is fitted (a cabinet's fronts and handles, a sink, a basin).
 */
function piece(
  item: Pick<PlanItem, "label" | "shape" | "width" | "depth" | "height" | "color" | "form" | "worktop" | "sheen">,
  options: { openRight?: boolean; chaise?: boolean; behind?: Behind; fittings?: RoomFittings }
) {
  const [w, d, h] = [item.width / 100, item.depth / 100, Math.max(item.height, 1) / 100]
  const paint = material(item.color, sheenRoughness(item.sheen))
  const darker = material(shade(item.color, 0.78))
  const group = new THREE.Group()

  // A kitchen unit's worktop lies on it; a leg of an L has no wall behind it, so only the run has a backsplash.
  if (item.worktop) {
    group.add(worktopModel(item.worktop, w, d, h, options.behind ?? OPEN_BEHIND, options.fittings?.tiles ?? TILE_PATTERN.Grid))
  }

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

  if (item.form === ITEM_FORM.GlassScreen || item.form === ITEM_FORM.GlassCubicle) {
    // A shower's glass: a low tray, clear panes on its front (part of it for a screen) and its right, a thin post at the front pane's end.
    const tray = 0.05
    const glass = new THREE.MeshStandardMaterial({ color: BUILDER.scene.glass, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1, depthWrite: false })
    const metal = new THREE.MeshStandardMaterial({ color: BUILDER.scene.metal, roughness: 0.35, metalness: 0.8 })
    const screen = item.form === ITEM_FORM.GlassScreen
    const front = screen ? w * 0.6 : w
    const thin = 0.01

    block(w, tray, d, 0, tray / 2, 0)
    block(front, h - tray, thin, -w / 2 + front / 2, tray + (h - tray) / 2, d / 2 - thin / 2, glass).castShadow = false
    block(0.02, h - tray, 0.02, -w / 2 + front - 0.01, tray + (h - tray) / 2, d / 2 - 0.01, metal)

    if (!screen) {
      block(thin, h - tray, d, w / 2 - thin / 2, tray + (h - tray) / 2, 0, glass).castShadow = false
    }

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
      if (item.form === ITEM_FORM.Swivel) {
        // An office chair: five spokes on wheels, a gas column, a padded seat, a tall back leaning slightly back, and
        // two armrests on posts, so the photo shows an office chair rather than a dining chair.
        const seat = Math.min(0.5, h * 0.42)
        const metal = new THREE.MeshStandardMaterial({ color: BUILDER.scene.metal, roughness: 0.35, metalness: 0.8 })
        const reach = Math.min(w, d) / 2
        const pad = Math.min(0.08, (h - seat) * 0.2)
        const backHeight = h - seat - pad

        for (let i = 0; i < 5; i++) {
          const turn = (i * 2 * Math.PI) / 5
          const spoke = block(reach, 0.03, 0.04, (Math.sin(turn) * reach) / 2, 0.07, (Math.cos(turn) * reach) / 2, darker)
          const wheel = block(1, 1, 1, Math.sin(turn) * reach * 0.95, 0.03, Math.cos(turn) * reach * 0.95, darker, new THREE.SphereGeometry(0.5, 12, 8))

          spoke.rotation.y = turn - Math.PI / 2
          wheel.scale.set(0.05, 0.05, 0.05)
        }

        const column = block(1, 1, 1, 0, (0.08 + seat - pad) / 2, 0, metal, new THREE.CylinderGeometry(0.5, 0.5, 1, 16))

        column.scale.set(0.05, seat - pad - 0.08, 0.05)
        soft(w * 0.9, pad, d * 0.85, 0, seat - pad / 2, d * 0.05)
        const back = soft(w * 0.85, backHeight, 0.06, 0, seat + backHeight / 2, -d / 2 + 0.06)

        back.rotation.x = -0.1

        for (const side of [-1, 1]) {
          block(0.03, 0.2, 0.03, side * (w / 2 - 0.04), seat + 0.1, 0, darker)
          block(0.06, 0.03, d * 0.45, side * (w / 2 - 0.04), seat + 0.21, 0, darker)
        }

        break
      }

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
      // Under a worktop the unit stops at its underside, so the two never share a face (they would flicker).
      const body = item.worktop ? h - BUILDER.scene.worktop.thickness : h

      block(w, body, d, 0, body / 2, 0)

      // Fitted cabinetry gets its fronts and handles, a sink unit its sink and tap, a vanity its basin.
      if (options.fittings && isCabinet(item)) {
        const tall = !item.worktop && h > 1.2

        cabinetFront(block, { width: w, bottom: Math.min(0.1, body * 0.15), top: body - 0.01, front: d / 2 }, item.color, options.fittings, tall ? "tall" : "base")
      }

      if (options.fittings && item.worktop && BUILDER.sinkWords.test(item.label)) {
        sinkModel(block, { width: w, depth: d, top: h }, options.fittings)
      }

      if (options.fittings && BUILDER.vanityWords.test(item.label)) {
        basinModel(block, { width: w, depth: d, top: h }, options.fittings)
      }
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
  return tileMaterial((context, size) => paintFloor(context, plan.floorType, plan.floorColor, size, plan.finish.fittings.tiles), 1 / FLOOR_TILE_METRES, 1 / FLOOR_TILE_METRES, anisotropy, 0.7)
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
 * A plain material of a color, matte unless a roughness is given (see `sheenRoughness`).
 * @param color - The color, "#RRGGBB" or rgb().
 * @param roughness - How rough (unshiny) it is.
 */
function material(color: string, roughness: number = BUILDER.scene.sheen.plain) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness: 0 })
}

/**
 * How rough (unshiny) an object's surface is for its sheen: matte rough, gloss smooth; an object without one is plain.
 * @param sheen - Its sheen, if any.
 */
function sheenRoughness(sheen: Sheen | null | undefined) {
  return sheen ? BUILDER.scene.sheen[sheen] : BUILDER.scene.sheen.plain
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
