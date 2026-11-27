import * as THREE from "three"

import { BASIN, BUILDER, CABINET_FRONTS, HANDLE_STYLE, HARDWARE, HARDWARE_NAMES, KITCHEN_SINK, KITCHEN_TAP } from "@/lib/constants"
import type { RoomFittings } from "./api"
import { shade } from "./floor-texture"

/** Adds a box (or another shape in its place) to a model: its width, height and depth, its middle, and its look. */
export type Block = (bw: number, bh: number, bd: number, x: number, y: number, z: number, look?: THREE.Material, geometry?: THREE.BufferGeometry) => THREE.Mesh

/** Where a cabinet's doors are: its width, the bottom and top of its doors, and where its front face is (all in metres). */
export type CabinetFace = { width: number; bottom: number; top: number; front: number }

/**
 * The room's metal (handles, taps, fittings) as a material: its color, shiny for chrome and matte for black.
 * @param fittings - How the room is fitted.
 */
export function hardwareMaterial(fittings: RoomFittings) {
  const roughness = fittings.hardware === HARDWARE.Chrome ? 0.15 : fittings.hardware === HARDWARE.MatteBlack ? 0.6 : 0.35

  return new THREE.MeshStandardMaterial({ color: HARDWARE_NAMES[fittings.hardware].color, roughness, metalness: fittings.hardware === HARDWARE.MatteBlack ? 0.3 : 0.85 })
}

/**
 * A cabinet's front, on its face: a door every 60 cm or so with a seam between, each door in the room's front style (a
 * shaker frame, fluted reeds, or plain), glass in a frame for glass upper cabinets, and its handle in the room's metal:
 * a bar (across the top of a base unit's door, down the side of an upper or tall one), a knob in its corner, a cup pull
 * at its top, an edge pull along its top, or a groove for handleless doors.
 * @param block - Adds a box to the cabinet's model.
 * @param face - Where the doors are.
 * @param color - The cabinet's color.
 * @param fittings - How the room is fitted.
 * @param kind - A base unit (handles at the top), an upper cabinet (handles at the bottom) or a tall one (handles at hand height).
 */
export function cabinetFront(block: Block, face: CabinetFace, color: string, fittings: RoomFittings, kind: "base" | "upper" | "tall") {
  const sizes = BUILDER.scene.fittings
  const doors = Math.max(1, Math.round(face.width / sizes.door))
  const each = face.width / doors
  const tall = face.top - face.bottom
  const middle = (face.bottom + face.top) / 2
  const z = face.front
  const seam = new THREE.MeshStandardMaterial({ color: shade(color, 0.6), roughness: 0.8 })
  const frameLook = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  const reedLook = new THREE.MeshStandardMaterial({ color: shade(color, 0.9), roughness: 0.7 })
  const metal = hardwareMaterial(fittings)
  const glass = kind === "upper" && fittings.glassUppers
  const frame = Math.min(sizes.frame, each / 5, tall / 5)

  for (let n = 0; n < doors; n++) {
    const x = -face.width / 2 + each * (n + 0.5)
    // A pair of doors opens from the middle; a single door from its right side.
    const side = doors === 1 ? 1 : n % 2 === 0 ? 1 : -1

    if (n > 0) {
      block(0.005, tall, 0.004, x - each / 2, middle, z + 0.002, seam)
    }

    if (glass) {
      const pane = new THREE.MeshStandardMaterial({ color: sizes.glass, emissive: sizes.glass, emissiveIntensity: 0.25, roughness: 0.05, metalness: 0.3 })

      block(each - 2 * frame, tall - 2 * frame, 0.004, x, middle, z + 0.002, pane)
    }

    if (glass || fittings.fronts === CABINET_FRONTS.Shaker) {
      block(each - 0.01, frame, 0.012, x, face.top - frame / 2, z + 0.006, frameLook)
      block(each - 0.01, frame, 0.012, x, face.bottom + frame / 2, z + 0.006, frameLook)
      block(frame, tall - 2 * frame, 0.012, x - each / 2 + frame / 2 + 0.005, middle, z + 0.006, frameLook)
      block(frame, tall - 2 * frame, 0.012, x + each / 2 - frame / 2 - 0.005, middle, z + 0.006, frameLook)
    } else if (fittings.fronts === CABINET_FRONTS.Fluted) {
      for (let r = -each / 2 + sizes.reed; r < each / 2 - 0.005; r += sizes.reed) {
        block(0.006, tall * 0.96, 0.006, x + r, middle, z + 0.003, reedLook)
      }
    }

    handle(block, metal, fittings, { x, side, each, bottom: face.bottom, top: face.top, z, kind })
  }
}

/**
 * One door's handle in the room's metal (see `cabinetFront`).
 * @param block - Adds a box to the cabinet's model.
 * @param metal - The room's metal.
 * @param fittings - How the room is fitted.
 * @param door - The door: its middle, the side away from its hinge (1 right, -1 left), its width, bottom, top and front, and the cabinet's kind.
 */
function handle(
  block: Block,
  metal: THREE.Material,
  fittings: RoomFittings,
  door: { x: number; side: number; each: number; bottom: number; top: number; z: number; kind: "base" | "upper" | "tall" }
) {
  const sizes = BUILDER.scene.fittings
  const out = door.z + sizes.handleOut
  const edge = door.x + door.side * (door.each / 2 - 0.05)
  // Where a hand reaches it: the top of a base unit, the bottom of an upper one, about 1 m up a tall one.
  const reach = door.kind === "base" ? door.top - 0.06 : door.kind === "upper" ? door.bottom + 0.08 : Math.min(door.top - 0.1, 1.05)

  switch (fittings.handles) {
    case HANDLE_STYLE.Knob:
      block(1, 1, 1, edge, reach, out, metal, new THREE.SphereGeometry(sizes.knob, 16, 12))
      break
    case HANDLE_STYLE.CupPull:
      block(0.09, 0.025, 0.02, door.x, door.kind === "upper" ? door.bottom + 0.05 : door.top - 0.05, door.z + 0.01, metal)
      break
    case HANDLE_STYLE.EdgePull:
      block(door.each * 0.6, 0.012, 0.025, door.x, door.kind === "upper" ? door.bottom + 0.006 : door.top - 0.006, door.z + 0.012, metal)
      break
    case HANDLE_STYLE.Handleless:
      block(door.each, 0.02, 0.004, door.x, door.kind === "upper" ? door.bottom + 0.01 : door.top - 0.01, door.z + 0.001, new THREE.MeshStandardMaterial({ color: "#1E1E1E", roughness: 0.9 }))
      break
    default:
      if (door.kind === "base") {
        block(Math.min(sizes.bar, door.each * 0.6), 0.012, 0.012, door.x, reach, out, metal)
      } else {
        block(0.012, sizes.bar, 0.012, edge, reach + (door.kind === "upper" ? sizes.bar / 2 : 0), out, metal)
      }
  }
}

/**
 * A kitchen sink in a worktop of a unit and its tap behind it, in the room's style and metal: an undermount or inset
 * sink in steel (an inset one with its rim on top), or a white farmhouse sink with its apron down the unit's front; a
 * tall gooseneck, a bridge tap with two handles, or a pull-down tap.
 * @param block - Adds a box to the unit's model.
 * @param size - The unit's width and depth, and the worktop's top (metres).
 * @param fittings - How the room is fitted.
 */
export function sinkModel(block: Block, size: { width: number; depth: number; top: number }, fittings: RoomFittings) {
  const sizes = BUILDER.scene.fittings
  const metal = hardwareMaterial(fittings)
  const width = Math.min(sizes.sink.width, size.width - 0.1)
  const depth = Math.min(sizes.sink.depth, size.depth - 0.16)
  const farmhouse = fittings.sink === KITCHEN_SINK.Farmhouse
  const bowl = farmhouse
    ? new THREE.MeshStandardMaterial({ color: sizes.bowl, roughness: 0.25 })
    : new THREE.MeshStandardMaterial({ color: BUILDER.scene.metal, roughness: 0.3, metalness: 0.7 })
  const inside = new THREE.MeshStandardMaterial({ color: farmhouse ? shade(sizes.bowl, 0.85) : shade(BUILDER.scene.metal, 0.6), roughness: 0.4 })
  const z = 0.02

  if (width <= 0.1 || depth <= 0.1) {
    return
  }

  block(width - 0.04, 0.003, depth - 0.04, 0, size.top + 0.0015, z, inside)

  if (fittings.sink === KITCHEN_SINK.Inset) {
    block(width, 0.006, 0.02, 0, size.top + 0.003, z - depth / 2 + 0.01, bowl)
    block(width, 0.006, 0.02, 0, size.top + 0.003, z + depth / 2 - 0.01, bowl)
    block(0.02, 0.006, depth, -width / 2 + 0.01, size.top + 0.003, z, bowl)
    block(0.02, 0.006, depth, width / 2 - 0.01, size.top + 0.003, z, bowl)
  }

  if (farmhouse) {
    block(width, sizes.sink.apron, 0.03, 0, size.top - sizes.sink.apron / 2, size.depth / 2 + 0.015, bowl)
  }

  tap(block, metal, fittings, { x: 0, z: z - depth / 2 - 0.05, top: size.top, reach: depth / 2 })
}

/**
 * A vanity's basin and its tap, in the room's style and metal: a white bowl sitting on the top (vessel), or a white
 * oval in it (undermount or integrated, the integrated one without a rim line).
 * @param block - Adds a box to the vanity's model.
 * @param size - The vanity's width and depth, and its top (metres).
 * @param fittings - How the room is fitted.
 */
export function basinModel(block: Block, size: { width: number; depth: number; top: number }, fittings: RoomFittings) {
  const sizes = BUILDER.scene.fittings
  const metal = hardwareMaterial(fittings)
  const white = new THREE.MeshStandardMaterial({ color: sizes.bowl, roughness: 0.2 })
  const shadow = new THREE.MeshStandardMaterial({ color: shade(sizes.bowl, 0.8), roughness: 0.3 })
  // A double vanity gets two basins.
  const count = size.width >= 1.1 ? 2 : 1
  const width = Math.min(sizes.basin.width, size.width / count - 0.1)
  const depth = Math.min(sizes.basin.depth, size.depth - 0.12)

  if (width <= 0.15 || depth <= 0.15) {
    return
  }

  for (let n = 0; n < count; n++) {
    const x = -size.width / 2 + (size.width / count) * (n + 0.5)

    if (fittings.basin === BASIN.Vessel) {
      block(1, 1, 1, x, size.top + sizes.basin.vessel / 2, 0.02, white, new THREE.CylinderGeometry(width / 2, width / 2.6, sizes.basin.vessel, 32)).scale.set(1, 1, depth / width)
      block(1, 1, 1, x, size.top + sizes.basin.vessel - 0.002, 0.02, shadow, new THREE.CylinderGeometry(width / 2 - 0.015, width / 2 - 0.015, 0.002, 32)).scale.set(1, 1, depth / width)
    } else {
      block(1, 1, 1, x, size.top + 0.0015, 0.02, shadow, new THREE.CylinderGeometry(width / 2, width / 2, 0.003, 32)).scale.set(1, 1, depth / width)

      if (fittings.basin === BASIN.Undermount) {
        block(1, 1, 1, x, size.top + 0.001, 0.02, white, new THREE.CylinderGeometry(width / 2 + 0.012, width / 2 + 0.012, 0.002, 32)).scale.set(1, 1, depth / width)
      }
    }

    tap(block, metal, { ...fittings, tap: KITCHEN_TAP.Gooseneck }, { x, z: 0.02 - depth / 2 - 0.04, top: size.top, reach: depth / 3 })
  }
}

/**
 * A tap standing on a top, its spout reaching forward over the bowl: a tall arched gooseneck, a bridge tap (two
 * handles joined by a bar, the spout from its middle), or a pull-down tap (a shorter arch with a thicker head).
 * @param block - Adds a box to the model.
 * @param metal - The room's metal.
 * @param fittings - How the room is fitted.
 * @param at - Where it stands (x, z), the top it stands on, and how far forward its spout reaches (metres).
 */
function tap(block: Block, metal: THREE.Material, fittings: RoomFittings, at: { x: number; z: number; top: number; reach: number }) {
  const pipe = 0.012
  const cylinder = (height: number) => new THREE.CylinderGeometry(pipe, pipe, height, 12)

  if (fittings.tap === KITCHEN_TAP.Bridge) {
    block(1, 1, 1, at.x - 0.08, at.top + 0.06, at.z, metal, cylinder(0.12))
    block(1, 1, 1, at.x + 0.08, at.top + 0.06, at.z, metal, cylinder(0.12))
    block(0.16, pipe * 1.6, pipe * 1.6, at.x, at.top + 0.12, at.z, metal)
    block(pipe * 1.6, pipe * 1.6, at.reach, at.x, at.top + 0.14, at.z + at.reach / 2, metal)
    block(0.05, 0.012, 0.012, at.x - 0.08, at.top + 0.13, at.z, metal)
    block(0.05, 0.012, 0.012, at.x + 0.08, at.top + 0.13, at.z, metal)

    return
  }

  const rise = fittings.tap === KITCHEN_TAP.PullDown ? 0.3 : 0.38
  const arch = Math.max(0.05, at.reach / 2)

  block(1, 1, 1, at.x, at.top + rise / 2, at.z, metal, cylinder(rise))
  block(1, 1, 1, at.x, at.top + rise, at.z + arch, metal, new THREE.TorusGeometry(arch, pipe, 8, 24, Math.PI)).rotation.y = -Math.PI / 2
  block(1, 1, 1, at.x, at.top + rise - 0.04, at.z + 2 * arch, metal, fittings.tap === KITCHEN_TAP.PullDown ? new THREE.CylinderGeometry(0.02, 0.02, 0.08, 12) : cylinder(0.08))
}
