import type { ItemBox } from "./api"

/** A direction in the 3D scene: x across the room (to the right wall), y up, z down the plan (towards the front). */
export type Vec3 = [number, number, number]

/**
 * The six faces of a cube camera: where each looks and which way is up. Each face is a square 90° view; its right is
 * forward × up, as three.js's `lookAt` makes it.
 */
export const CUBE_FACES: { forward: Vec3; up: Vec3 }[] = [
  { forward: [1, 0, 0], up: [0, 1, 0] },
  { forward: [-1, 0, 0], up: [0, 1, 0] },
  { forward: [0, 0, 1], up: [0, 1, 0] },
  { forward: [0, 0, -1], up: [0, 1, 0] },
  { forward: [0, 1, 0], up: [0, 0, 1] },
  { forward: [0, -1, 0], up: [0, 0, -1] },
]

/**
 * Two vectors' cross product.
 * @param a - The first.
 * @param b - The second.
 */
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/**
 * Two vectors' dot product.
 * @param a - The first.
 * @param b - The second.
 */
function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Where a direction lands on the cube's faces.
 * @param direction - The direction (any length).
 * @param size - Each face's width and height, in pixels.
 * @returns The face's number in `CUBE_FACES`, and the pixel on it (across from its left, down from its top).
 */
export function cubePixel(direction: Vec3, size: number) {
  let face = 0

  for (let f = 1; f < CUBE_FACES.length; f++) {
    if (dot(direction, CUBE_FACES[f].forward) > dot(direction, CUBE_FACES[face].forward)) {
      face = f
    }
  }

  const { forward, up } = CUBE_FACES[face]
  const ahead = dot(direction, forward)
  const x = Math.min(size - 1, Math.max(0, Math.floor(((dot(direction, cross(forward, up)) / ahead + 1) / 2) * size)))
  const y = Math.min(size - 1, Math.max(0, Math.floor(((1 - dot(direction, up) / ahead) / 2) * size)))

  return { face, x, y }
}

/**
 * The direction of a pixel of an equirectangular panorama. Its middle looks at the back wall (towards -z), its right
 * half turns towards the right wall (+x), and its two ends meet behind; its top is straight up.
 * @param x - Across the panorama, in pixels.
 * @param y - Down the panorama, in pixels.
 * @param width - The panorama's width.
 * @param height - The panorama's height.
 */
export function panoramaDirection(x: number, y: number, width: number, height: number): Vec3 {
  const lat = Math.PI / 2 - ((y + 0.5) / height) * Math.PI
  const lon = ((x + 0.5) / width) * 2 * Math.PI - Math.PI

  return [Math.sin(lon) * Math.cos(lat), Math.sin(lat), -Math.cos(lon) * Math.cos(lat)]
}

/**
 * Joins a cube camera's six faces into one equirectangular panorama.
 * @param faces - The faces in `CUBE_FACES` order, each `size` x `size` pixels of `channels` values, row by row from the top.
 * @param size - Each face's width and height.
 * @param width - The panorama's width (twice its height).
 * @param height - The panorama's height.
 * @param channels - The values per pixel (4 for colors, 1 for object ids).
 * @param into - Where the panorama goes: `width` x `height` pixels of `channels` values.
 */
export function joinFaces(faces: ArrayLike<number>[], size: number, width: number, height: number, channels: number, into: { [index: number]: number }) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { face, x: fx, y: fy } = cubePixel(panoramaDirection(x, y, width, height), size)
      const from = (fy * size + fx) * channels
      const to = (y * width + x) * channels

      for (let c = 0; c < channels; c++) {
        into[to + c] = faces[face][from + c]
      }
    }
  }
}

/**
 * Each object's box in a panorama of object ids, for the image model to keep it there. An object cut by the
 * panorama's ends (it would need two boxes) and one barely seen are left out.
 * @param ids - For each pixel, 1 + the object's index, or another value for no object (see `MASK_ID`).
 * @param width - The panorama's width.
 * @param height - The panorama's height.
 * @param items - How many objects the plan has.
 * @param minPixels - The fewest pixels an object must show to get a box.
 * @returns The boxes, as shares of the panorama.
 */
export function panoramaBoxes(ids: ArrayLike<number>, width: number, height: number, items: number, minPixels: number): ItemBox[] {
  const boxes = Array.from({ length: items }, () => ({ left: width, top: height, right: -1, bottom: -1, count: 0, atStart: false, atEnd: false }))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const item = ids[y * width + x] - 1
      const box = boxes[item]

      if (!box) {
        continue
      }

      box.left = Math.min(box.left, x)
      box.right = Math.max(box.right, x)
      box.top = Math.min(box.top, y)
      box.bottom = Math.max(box.bottom, y)
      box.count++
      box.atStart ||= x === 0
      box.atEnd ||= x === width - 1
    }
  }

  return boxes.flatMap((box, item) =>
    box.count >= minPixels && !(box.atStart && box.atEnd)
      ? [{ item, left: box.left / width, top: box.top / height, right: (box.right + 1) / width, bottom: (box.bottom + 1) / height }]
      : []
  )
}
