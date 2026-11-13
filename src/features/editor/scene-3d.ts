import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Spherical,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

import type { DepthMap } from "./depth-map"
import type { LabelMap } from "./label-map"
import { LIMITS } from "@/lib/constants"

/** How deep the farthest point of the room is in the scene's units (the depth map is relative). */
const sceneDepth = 10

/** How far one arrow key turns the view, in degrees. */
const keyStep = 3

/** The backdrop's reach: each cell takes the farthest depth this many cells around (fills what objects hide). */
const backdropReach = 10

/** How much farther the backdrop sits than what it stands for, so the two layers never fight where they meet. */
const backdropPush = 1.01

/**
 * The room with its furniture erased, for what the photo hides: its depth map and its recolored photo. The view shows
 * it behind the furniture, so turning reveals the real wall and floor instead of a stretched fill.
 */
export type Backdrop = {
  depth: DepthMap
  texture: HTMLCanvasElement
  /** The objects that are walls, floors and ceilings: the backdrop's depth is scaled to match the photo's on them. */
  surfaces: ReadonlySet<number>
}

/** A running 3D view, for the component that owns it. */
export type Scene3D = {
  /** Uploads the texture canvas again, after it was redrawn (new colors or a new photo version). */
  refresh: () => void
  /** Goes back to the photo's own angle. */
  reset: () => void
  /** Stops drawing and frees the GPU. */
  dispose: () => void
}

/**
 * Shows a room photo as a 3D surface: a grid that follows the depth map, unprojected through the camera's field of
 * view, textured with the editor's recolored photo. The view can turn a little and move in toward the room's middle.
 * The surface is cut at depth jumps and along the objects' outlines instead of being stretched; behind it, a backdrop
 * colored from what lies beside each object fills the gaps.
 * @param container - Where the view goes; it fills it.
 * @param depth - The room's depth map.
 * @param labels - The room's outlines (which object each pixel belongs to), to cut the surface where objects meet.
 * @param fovX - The camera's horizontal field of view, in degrees.
 * @param fovY - The camera's vertical field of view, in degrees.
 * @param texture - The recolored photo.
 * @param reducedMotion - Whether to skip the view's easing.
 * @param emptyRoom - The room with its furniture erased, when there is one; otherwise the gaps are filled from beside
 * each object.
 */
export function createScene(
  container: HTMLElement,
  depth: DepthMap,
  labels: LabelMap,
  fovX: number,
  fovY: number,
  texture: HTMLCanvasElement,
  reducedMotion: boolean,
  emptyRoom?: Backdrop
): Scene3D {
  const tanX = Math.tan((fovX * Math.PI) / 360)
  const tanY = Math.tan((fovY * Math.PI) / 360)
  const { width, height } = depth

  // One vertex per depth cell, at the cell's middle, unprojected through the field of view.
  const surface = (cells: Float32Array, scale: number) => {
    const positions = new Float32Array(width * height * 3)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const z = cells[i] * sceneDepth * scale
        positions.set([(2 * ((x + 0.5) / width) - 1) * tanX * z, -(2 * ((y + 0.5) / height) - 1) * tanY * z, -z], i * 3)
      }
    }
    return positions
  }
  const uvs = new Float32Array(width * height * 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) uvs.set([(x + 0.5) / width, 1 - (y + 0.5) / height], (y * width + x) * 2)
  }
  const positions = surface(depth.depth, 1)
  // Which object each vertex shows, from the outlines.
  const objectAt = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lx = Math.min(labels.width - 1, Math.floor(((x + 0.5) / width) * labels.width))
      const ly = Math.min(labels.height - 1, Math.floor(((y + 0.5) / height) * labels.height))
      objectAt[y * width + x] = labels.labels[ly * labels.width + lx]
    }
  }
  // Two triangles per cell, unless they'd span a depth jump (an object's edge against what's behind it). Where two
  // objects' outlines meet, a much smaller jump is enough: a chair leg comes away cleanly from the floor behind it,
  // while a wall and the floor still meet in their corner.
  const indexes: number[] = []
  const jump = 1 + LIMITS.view3d.edgeJump
  const outlineJump = 1 + LIMITS.view3d.outlineJump
  // With an empty room behind, every piece of furniture is cut out along its outline (what opens up shows the real
  // room behind it); only the walls, floor and ceiling stay joined to each other.
  const isSurface = (i: number) => emptyRoom?.surfaces.has(objectAt[i]) ?? false
  const smooth = (a: number, b: number, c: number) => {
    const da = depth.depth[a], db = depth.depth[b], dc = depth.depth[c]
    const ratio = Math.max(da, db, dc) / Math.max(1e-6, Math.min(da, db, dc))
    const oneObject = objectAt[a] === objectAt[b] && objectAt[b] === objectAt[c]
    if (emptyRoom && !oneObject) return isSurface(a) && isSurface(b) && isSurface(c) && ratio <= jump
    return ratio <= (oneObject ? jump : outlineJump)
  }
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x, b = a + 1, c = a + width, d = c + 1
      if (smooth(a, c, b)) indexes.push(a, c, b)
      if (smooth(b, c, d)) indexes.push(b, c, d)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(positions, 3))
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2))
  geometry.setIndex(indexes)

  // Behind it, a backdrop with no cuts, at the depth of what lies behind each object, and colored from it (the wall
  // or floor beside the object, not the object itself): through a gap at an object's edge you see the room behind
  // instead of black or a ghost of the object.
  // With an empty-room photo, the backdrop is that room: its own depth (scaled to the photo's on the walls and floor,
  // and never in front of the photo), textured with it.
  const backdrop = new BufferGeometry()
  if (emptyRoom) {
    backdrop.setAttribute("position", new BufferAttribute(surface(emptyRoomDepth(depth, objectAt, emptyRoom), backdropPush), 3))
    backdrop.setAttribute("uv", new BufferAttribute(uvs, 2))
  } else {
    const behind = farthestAround(depth, backdropReach)
    const backdropUvs = new Float32Array(width * height * 2)
    for (let i = 0; i < width * height; i++) backdropUvs.set([uvs[behind.from[i] * 2], uvs[behind.from[i] * 2 + 1]], i * 2)
    backdrop.setAttribute("position", new BufferAttribute(surface(behind.depth, backdropPush), 3))
    backdrop.setAttribute("uv", new BufferAttribute(backdropUvs, 2))
  }
  const all: number[] = []
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x, b = a + 1, c = a + width, d = c + 1
      all.push(a, c, b, b, c, d)
    }
  }
  backdrop.setIndex(all)

  const map = new CanvasTexture(texture)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 4
  const material = new MeshBasicMaterial({ map })
  const backdropMap = emptyRoom ? new CanvasTexture(emptyRoom.texture) : map
  backdropMap.colorSpace = SRGBColorSpace
  backdropMap.anisotropy = 4
  const backdropMaterial = emptyRoom ? new MeshBasicMaterial({ map: backdropMap }) : material
  const scene = new Scene()
  scene.add(new Mesh(backdrop, backdropMaterial))
  scene.add(new Mesh(geometry, material))

  // preserveDrawingBuffer lets a test read the pixels back; the view redraws every frame anyway.
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.domElement.style.display = "block"
  renderer.domElement.style.width = "100%"
  renderer.domElement.style.height = "100%"
  container.append(renderer.domElement)

  // The camera starts where the photo was taken; it turns around a point in the middle of the room.
  const camera = new PerspectiveCamera(fovY, 1, 0.01, sceneDepth * 4)
  const middle = middleDepth(depth) * sceneDepth
  const target = new Vector3(0, 0, -middle)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(target)
  controls.enablePan = false
  controls.enableDamping = !reducedMotion
  controls.rotateSpeed = 0.45
  controls.minAzimuthAngle = (-LIMITS.view3d.yaw * Math.PI) / 180
  controls.maxAzimuthAngle = (LIMITS.view3d.yaw * Math.PI) / 180
  controls.minPolarAngle = Math.PI / 2 - (LIMITS.view3d.pitch * Math.PI) / 180
  controls.maxPolarAngle = Math.PI / 2 + (LIMITS.view3d.pitch * Math.PI) / 180
  controls.minDistance = middle * LIMITS.view3d.closest
  controls.maxDistance = middle
  controls.update()
  controls.saveState()

  // Fit the photo in the container whatever its shape: keep the photo's own width or height in view.
  const resize = () => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const photoAspect = tanX / tanY
    camera.fov = camera.aspect >= photoAspect ? fovY : (2 * Math.atan(tanX / camera.aspect) * 180) / Math.PI
    camera.updateProjectionMatrix()
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(container)

  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
  })

  const reset = () => controls.reset()
  renderer.domElement.addEventListener("dblclick", reset)

  // Arrow keys turn the view as a drag would; the controls keep it within its limits.
  const onKey = (event: KeyboardEvent) => {
    const turn = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!turn) return
    event.preventDefault()
    const offset = camera.position.clone().sub(controls.target)
    const spherical = new Spherical().setFromVector3(offset)
    spherical.theta += (turn[0] * keyStep * Math.PI) / 180
    spherical.phi += (turn[1] * keyStep * Math.PI) / 180
    camera.position.copy(controls.target).add(new Vector3().setFromSpherical(spherical))
  }
  container.addEventListener("keydown", onKey)

  return {
    refresh: () => {
      map.needsUpdate = true
      backdropMap.needsUpdate = true
    },
    reset,
    dispose: () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      container.removeEventListener("keydown", onKey)
      renderer.domElement.removeEventListener("dblclick", reset)
      controls.dispose()
      geometry.dispose()
      backdrop.dispose()
      material.dispose()
      map.dispose()
      if (emptyRoom) {
        backdropMaterial.dispose()
        backdropMap.dispose()
      }
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/**
 * The empty room's depth on the photo's grid: sampled to the photo's grid, scaled so that it matches the photo on the
 * walls, floor and ceiling (the two were measured separately), and never in front of what the photo shows.
 * @param depth - The photo's depth map.
 * @param objectAt - Which object each of the photo's cells shows.
 * @param emptyRoom - The empty room.
 */
function emptyRoomDepth(depth: DepthMap, objectAt: Uint8Array, emptyRoom: Backdrop): Float32Array {
  const { width, height } = depth
  const empty = emptyRoom.depth
  const sampled = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const ey = Math.min(empty.height - 1, Math.floor(((y + 0.5) / height) * empty.height))
    for (let x = 0; x < width; x++) {
      const ex = Math.min(empty.width - 1, Math.floor(((x + 0.5) / width) * empty.width))
      sampled[y * width + x] = empty.depth[ey * empty.width + ex]
    }
  }
  const ratios: number[] = []
  for (let i = 0; i < sampled.length; i++) {
    if (emptyRoom.surfaces.has(objectAt[i]) && sampled[i] > 0) ratios.push(depth.depth[i] / sampled[i])
  }
  ratios.sort((a, b) => a - b)
  const scale = ratios[Math.floor(ratios.length / 2)] || 1
  for (let i = 0; i < sampled.length; i++) sampled[i] = Math.max(sampled[i] * scale, depth.depth[i])
  return sampled
}

/**
 * Each cell's farthest depth within `reach` cells (a square around it), and which cell it comes from, for the
 * backdrop: its position takes that depth and its color that cell's pixel.
 * @param depth - The depth map.
 * @param reach - How many cells around to look.
 */
function farthestAround(depth: DepthMap, reach: number): { depth: Float32Array; from: Uint32Array } {
  const { width, height } = depth
  // Separable: across each row first, then down each column, carrying the cell each value came from.
  const acrossFrom = new Uint32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = y * width + x
      for (let dx = Math.max(0, x - reach); dx <= Math.min(width - 1, x + reach); dx++) {
        if (depth.depth[y * width + dx] > depth.depth[best]) best = y * width + dx
      }
      acrossFrom[y * width + x] = best
    }
  }
  const from = new Uint32Array(width * height)
  const result = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = acrossFrom[y * width + x]
      for (let dy = Math.max(0, y - reach); dy <= Math.min(height - 1, y + reach); dy++) {
        const candidate = acrossFrom[dy * width + x]
        if (depth.depth[candidate] > depth.depth[best]) best = candidate
      }
      from[y * width + x] = best
      result[y * width + x] = depth.depth[best]
    }
  }
  return { depth: result, from }
}

/**
 * The depth of the room's middle: the median of the middle third of the map, where the view turns around.
 * @param depth - The depth map.
 */
function middleDepth(depth: DepthMap): number {
  const values: number[] = []
  for (let y = Math.floor(depth.height / 3); y < Math.ceil((depth.height * 2) / 3); y++) {
    for (let x = Math.floor(depth.width / 3); x < Math.ceil((depth.width * 2) / 3); x++) values.push(depth.depth[y * depth.width + x])
  }
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)] || 0.5
}
