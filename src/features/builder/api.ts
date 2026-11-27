import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Room } from "@/features/rooms/types"
import { getJson, retryUnlessMissing, sendForm, sendJson } from "@/lib/api"
import {
  API,
  QUERY_KEYS,
  type Backsplash,
  type Casing,
  type CeilingStyle,
  type CoveringKind,
  type CurtainLength,
  type FloorType,
  type ItemForm,
  type ItemShape,
  type LightTone,
  type Moulding,
  type PhotoStyle,
  type PlanSide,
  type RoomType,
  type TimeOfDay,
  type ViewCorner,
  type Wainscot,
  type WallFinish,
  type WorktopSpot,
} from "@/lib/constants"

/**
 * One object placed in a built room (mirrors the API's PlanItemRequest). Sizes and positions are in centimetres. A
 * window or door is on a `wall` instead of the floor: `x` is its middle along that wall, from the wall's left end as
 * seen from inside the room facing it, `y` is 0, and `elevation` is how high its bottom is above the floor.
 */
export type PlanItem = {
  /** What it is, such as "sofa". */
  label: string
  /** How it is drawn in 3D. */
  shape: ItemShape
  /** Its middle across the room, from the back-left corner seen from above. */
  x: number
  /** Its middle along the room (towards the viewer). */
  y: number
  /** Its width (across, before turning). */
  width: number
  /** Its depth (along, before turning). */
  depth: number
  /** Its height. */
  height: number
  /** Its turn, clockwise from above: 0, 90, 180 or 270 degrees. */
  rotation: number
  /** Its color, "#RRGGBB". */
  color: string
  /** The number of the wall a window or door is on; null (or missing) for objects on the floor. */
  wall?: number | null
  /** A window's height above the floor; 0 for everything else. */
  elevation: number
  /** Its outline from above: a rectangle, an L (sofas, tables, cabinets), a P (corner sofas) or an ellipse (tables, rugs). */
  form: ItemForm
  /** An L- or P-shaped object's parts, each sized on its own; null (or missing) for other outlines. */
  parts?: ItemParts | null
  /** The small things on it, such as "cushions", which the photo shows on it; missing or empty for none. */
  decorations?: string[]
  /** What it is made of or covered in, such as "velvet"; missing or empty when only its color says. */
  material?: string
  /** A window's curtains or blinds; missing or null for none, and for other objects. */
  covering?: WindowCovering | null
  /** A kitchen unit's worktop and backsplash; missing or null for none, and for other objects. */
  worktop?: Worktop | null
  /** Whether a lamp or light is switched on; missing or null to follow the time of day (on in the evening). */
  lit?: boolean | null
}

/** A kitchen unit's worktop and the backsplash behind it (mirrors WorktopRequest). */
export type Worktop = {
  material: string
  color: string
  backsplash: Backsplash
  /** The tiles' or glass's color (an upstand or the worktop up the wall is the worktop's). */
  backsplashColor: string
}

/** What a window is dressed with (mirrors WindowCoveringRequest). */
export type WindowCovering = {
  kind: CoveringKind
  color: string
  /** What it is made of, such as "linen"; empty for none named. */
  fabric: string
  /** How far curtains hang (blinds cover the window). */
  length: CurtainLength
}

/** A wall of a built room in its own finish and color, instead of the room's (mirrors WallLookRequest). */
export type WallLook = {
  /** The wall's number. */
  wall: number
  finish: WallFinish
  color: string
}

/**
 * A built room's architecture, for the whole room (mirrors RoomDetailsRequest): its ceiling's shape and beams' color,
 * the mouldings along its walls (each once, in order), the panelling on their lower part and the casings around its
 * doors, windows and archways, all in the trim color.
 */
export type RoomDetails = {
  ceiling: CeilingStyle
  beamColor: string
  mouldings: Moulding[]
  wainscot: Wainscot
  casing: Casing
}

/**
 * How a built room's walls and ceiling are finished and lit, and when its photo is taken (mirrors RoomFinishRequest):
 * the walls' finish (in the room's wall color), the walls in their own finish and color, the ceiling's and the trim's
 * colors, and its architecture.
 */
export type RoomFinish = {
  walls: WallFinish
  /** The walls in their own finish and color, each at most once. */
  ownWalls: WallLook[]
  ceilingColor: string
  /** The trim's color: skirting, mouldings, wainscoting and casings (windows and doors keep their own colors). */
  trimColor: string
  timeOfDay: TimeOfDay
  /** The color of the lamps' and ceiling lights' light. */
  tone: LightTone
  /** The side of the plan that faces north, which decides where the sun comes in from. */
  north: PlanSide
  /** Its ceiling's shape, mouldings, wainscoting and casings. */
  details: RoomDetails
}

/**
 * The parts of an L- or P-shaped object in cm, before turning (mirrors ItemPartsRequest): the run along its whole back,
 * the corner leg at its right end (or its left end, mirrored), and a P's chaise at the leg's front end (0 for an L).
 */
export type ItemParts = {
  /** How deep the back run is (front to back). */
  runDepth: number
  /** How wide the corner leg is (left to right). */
  legWidth: number
  /** How wide a P's chaise is, from the leg's side of the object. */
  chaiseWidth: number
  /** How deep a P's chaise is, from the object's front. */
  chaiseDepth: number
  /** Whether the leg (and a P's chaise) is at the back run's left end: the whole outline mirrored. Right when missing. */
  legLeft?: boolean
}

/** A corner of a built room's outline, in cm (mirrors OutlinePointRequest): across from the left, down from the top. */
export type OutlinePoint = {
  x: number
  y: number
}

/**
 * Where one object is in the 3D view sent for a photo (mirrors ItemBoxRequest): its position in `plan.items`, and its
 * box as shares of the picture (0 at the left and top).
 */
export type ItemBox = {
  item: number
  left: number
  top: number
  right: number
  bottom: number
}

/** A room the user builds (mirrors the API's PlanResponse). Its sizes are in metres. */
export type Plan = {
  id: string
  name: string
  roomType: RoomType
  width: number
  length: number
  height: number
  wallColor: string
  floorColor: string
  /** What the floor is made of. */
  floorType: FloorType
  /** The number of the wall the 3D view and the photo look at; the camera stands across the room from it. */
  view: number
  /** Where the camera stands to look at the wall in view: across from its middle, or in a near corner. */
  corner: ViewCorner
  /** The plan's own design, which its photos' rooms go into; null until there is one. */
  designId?: string | null
  /** The walls' corners, clockwise from the top-left one at 0, 0, in cm; `width` and `length` are their extent. */
  outline: OutlinePoint[]
  aiMode: string
  items: PlanItem[]
  updatedAt: string
  /** How its walls and ceiling are finished and lit, and when its photo is taken. */
  finish: RoomFinish
  /** The uploaded room whose photo it was read from; null (or missing) for a room built from scratch. */
  fromRoomId?: string | null
  /** Where that photo was taken, in cm, for the `Spot` camera; null (or missing) when there is none. */
  cameraSpot?: OutlinePoint | null
}

/** A plan read from an uploaded room's photo, and what was left out (mirrors the API's PhotoPlanResponse). */
export type PhotoPlan = {
  plan: Plan
  /** The names of the objects seen in the photo that fit nowhere. */
  leftOut: string[]
}

/** One view of a built room to make a photo from: the wall it looks at and where the camera stands (mirrors the API's PlanShot). */
export type PlanShot = Pick<Plan, "view" | "corner">

/** A photo of a Generate run: where it goes, what it is, the run's seed, and the view of the run's first photo, its reference. */
export type RunPhoto = {
  /** The room of the run's earlier photos; missing for its first, which makes the room. */
  roomId?: string
  /** What the photo is: its view's name. */
  note: string
  /** The run's seed, the same for all its photos. */
  seed: number
  /** The view of the run's first photo, from which the others copy the objects; missing for the first. */
  reference?: PlanShot
}

/** An object the user can add, with its usual size and color (mirrors the API's CatalogObjectResponse). */
export type CatalogObject = {
  key: string
  label: string
  shape: ItemShape
  width: number
  depth: number
  height: number
  color: string
  /** How high its bottom usually is above the floor (a window's sill; else 0). */
  elevation: number
  /** Its outline from above. */
  form: ItemForm
  /** Its variations (shapes and sizes), the first being the object itself; empty for an object the AI described. */
  variants: CatalogVariant[]
  /** Its five most popular decorations, offered when it is added; may be empty. */
  decorations: string[]
  /** What it is usually made of, to choose from; empty for an object the AI described. */
  materials: string[]
  /** The material it starts in; empty when it has none. */
  material: string
  /** Where a kitchen unit's worktop is (along a wall or on an island); missing or null for other objects. */
  worktop?: WorktopSpot | null
}

/** One variation of a catalog object, such as the L-shaped corner sofa, in the object's color (mirrors CatalogVariantResponse). */
export type CatalogVariant = {
  key: string
  /** What the choice is called, such as "L-shaped". */
  name: string
  /** The object's name in this variation, such as "L-shaped corner sofa". */
  label: string
  shape: ItemShape
  width: number
  depth: number
  height: number
  /** How high its bottom is above the floor (a window's sill; else 0). */
  elevation: number
  form: ItemForm
  /** Whether it reaches the ceiling (a column): added as tall as the room, whatever its height says. */
  toCeiling: boolean
}

/** What a new plan needs: its type, walls, colors and floor, and whether it starts with a suggested layout. */
export type NewPlan = Pick<Plan, "name" | "roomType" | "width" | "length" | "height" | "wallColor" | "floorColor" | "floorType"> & {
  /** Start with furniture, windows and a door sized for the room (the API's default), or empty. */
  furnish: boolean
  /** The design the room is started from (Add room on its page): its photos go into it. */
  designId?: string
  /** Without a design: the new design its photos go into, made with the first one (mirrors NewDesignRequest). */
  newDesign?: NewDesign
}

/** A new design a room is built for: made, with this name and description, when the room's first photo is made. */
export type NewDesign = { name: string; description: string }

/** Which design a new room's photos go into: one of the user's, or a new one. */
export type DesignChoice = { designId?: string; newDesign?: NewDesign }

/** A built room in the list of the user's rooms (mirrors the API's PlanSummaryResponse). */
export type PlanSummary = {
  id: string
  name: string
  roomType: RoomType
  /** In metres. */
  width: number
  length: number
  /** How many objects are placed in it. */
  items: number
  /** How many rooms hold its photos. */
  photos: number
  designId: string | null
  updatedAt: string
}

/**
 * Loads the rooms the user builds, the most recently saved first.
 * @param enabled - Whether to load them (only for an account).
 */
export function usePlans(enabled: boolean) {
  return useQuery({ queryKey: QUERY_KEYS.plans, queryFn: ({ signal }) => getJson<PlanSummary[]>(API.plans, signal), enabled })
}

/** Deletes a room the user builds; its photos' rooms stay, without its 3D view. */
export function useDeletePlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => sendJson<void>("DELETE", API.plan(id)),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: QUERY_KEYS.plan(id), exact: true })
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.plans, exact: true })
      // Its photos' rooms no longer show its 3D view.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rooms })
    },
  })
}

/**
 * Loads a built room.
 * @param id - The plan's id; nothing is loaded without one.
 */
export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.plan(id ?? ""),
    queryFn: ({ signal }) => getJson<Plan>(API.plan(id ?? ""), signal),
    enabled: id !== undefined,
    // A deleted room won't appear by asking again.
    retry: retryUnlessMissing,
  })
}

/**
 * How the common objects of a room type are loaded: they never change while the app runs.
 * @param roomType - The room type.
 */
export function catalogQuery(roomType: RoomType) {
  return {
    queryKey: QUERY_KEYS.catalog(roomType),
    // Always from the server: a copy the browser kept from an older release would miss newer objects.
    queryFn: ({ signal }: { signal: AbortSignal }) => getJson<CatalogObject[]>(API.builderCatalog(roomType), signal, "no-cache"),
    staleTime: Infinity,
  }
}

/**
 * Loads the common objects of a room type.
 * @param roomType - The room type.
 */
export function useCatalog(roomType: RoomType) {
  return useQuery(catalogQuery(roomType))
}

/**
 * Starts a room to build.
 * @param plan - Its type, walls and colors.
 * @param ai - The AI its descriptions and photos use, when the user chose one.
 * @returns The new plan.
 */
export function createPlan(plan: NewPlan, ai?: string): Promise<Plan> {
  return sendJson<Plan>("POST", ai ? `${API.plans}?ai=${encodeURIComponent(ai)}` : API.plans, plan)
}

/**
 * Reads an uploaded room's photo into a new plan, with the room's AI.
 * @param roomId - The room.
 * @param choice - The design its photos go into, or a new one; none when empty.
 * @returns The plan and what was left out.
 */
export function buildPlanFromRoom(roomId: string, choice: DesignChoice = {}): Promise<PhotoPlan> {
  return sendJson<PhotoPlan>("POST", API.roomPlan(roomId), choice)
}

/**
 * Makes one 360° photo of the built room from one spot, as a new room whose photo is the view straight ahead; more views
 * of it are saved later without AI.
 * @param planId - The plan.
 * @param guide - The room's 360° 3D view as a PNG (`renderPanorama`).
 * @param boxes - Where each object is in it.
 * @param spot - Where the camera stands, in cm on the plan.
 * @param startYaw - Which way its views start, in degrees from its middle (`panoramaStartYaw`).
 * @param style - The photo's interior style.
 * @param instructions - The user's own extra instructions for the AI (may be empty).
 * @param replaces - The room of the plan the new room replaces in its design (Edit in 3D); missing to add a room.
 * @returns The room.
 */
export function generatePanorama(
  planId: string,
  guide: Blob,
  boxes: ItemBox[],
  spot: OutlinePoint,
  startYaw: number,
  style: PhotoStyle,
  instructions: string,
  replaces?: string
): Promise<Room> {
  const form = new FormData()

  form.append("guide", guide, "panorama.png")
  form.append("boxes", JSON.stringify(boxes))
  form.append("spotX", String(Math.round(spot.x)))
  form.append("spotY", String(Math.round(spot.y)))
  form.append("startYaw", String(startYaw))
  form.append("style", style)

  if (instructions.trim()) {
    form.append("instructions", instructions.trim())
  }

  if (replaces) {
    form.append("replaces", replaces)
  }

  return sendForm<Room>(API.planPanorama(planId), form)
}

/**
 * Saves a built room as the user left it.
 * @param plan - The plan.
 * @returns The saved plan.
 */
export function savePlan(plan: Plan): Promise<Plan> {
  const { name, width, length, height, wallColor, floorColor, floorType, view, corner, items, outline, finish, cameraSpot } = plan
  const body = { name, width, length, height, wallColor, floorColor, floorType, view, corner, items, outline, finish, cameraSpot }

  return sendJson<Plan>("PUT", API.plan(plan.id), body)
}

/**
 * Turns a description into an object to place (the AI; Claude Haiku when real).
 * @param planId - The plan it is for.
 * @param description - The user's words.
 * @returns The object with its usual size and color.
 */
export function describeObject(planId: string, description: string): Promise<CatalogObject> {
  return sendJson<CatalogObject>("POST", API.planDescribe(planId), { description })
}

/**
 * Makes a realistic photo of the built room from its 3D view. A Generate run's first photo makes a room; the others
 * go into it (`photos.roomId`), to choose from.
 * @param planId - The plan.
 * @param guide - The room's 3D view as a PNG.
 * @param style - The photo's interior style.
 * @param instructions - The user's own extra instructions for the AI (may be empty).
 * @param seed - Makes the photo repeatable (the same view, prompt and seed give the same photo), to compare changes
 *   fairly; missing for a new random photo.
 * @param boxes - Where each object is in the 3D view (`objectBoxes`), which the image model keeps them in; missing for none.
 * @param shot - The view the guide was drawn from, when it isn't the plan's own (the plan keeps its own); missing for
 *   the plan's own view.
 * @param photos - The room of the run's earlier photos (missing for its first), what this photo is (its view's name),
 *   for the run's first, the room of the plan its new room replaces (missing to add a room), and for the others, where
 *   each object is in the run's first photo, from which the AI copies them (the same objects and decorations in every view).
 * @param masks - Which object or surface each pixel of the 3D view shows (`renderMaskPng`), by which the API brings the
 *   photo's colors back to the room as planned; missing to keep them as the AI made them.
 * @returns The room (waiting for the user to start its analysis).
 */
export function generateRoom(
  planId: string,
  guide: Blob,
  style: PhotoStyle,
  instructions: string,
  seed?: number,
  boxes?: ItemBox[],
  shot?: PlanShot,
  photos?: { roomId?: string; note?: string; replaces?: string; referenceBoxes?: ItemBox[] },
  masks?: Blob
): Promise<Room> {
  const form = new FormData()

  // A run's later photos go into the room its first one made, to choose from.
  if (photos?.roomId) {
    form.append("roomId", photos.roomId)
  }

  if (photos?.note) {
    form.append("note", photos.note)
  }

  if (photos?.replaces) {
    form.append("replaces", photos.replaces)
  }

  if (photos?.referenceBoxes) {
    form.append("referenceBoxes", JSON.stringify(photos.referenceBoxes))
  }

  if (shot) {
    form.append("view", String(shot.view))
    form.append("corner", shot.corner)
  }

  if (seed !== undefined) {
    form.append("seed", String(seed))
  }

  if (boxes) {
    form.append("boxes", JSON.stringify(boxes))
  }

  form.append("guide", guide, "guide.png")
  form.append("style", style)

  if (masks) {
    form.append("masks", masks, "masks.png")
  }

  if (instructions.trim()) {
    form.append("instructions", instructions.trim())
  }

  return sendForm<Room>(API.planGenerate(planId), form)
}
