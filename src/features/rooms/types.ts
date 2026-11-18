import { type AiMode, type AnalysisScope, API, type ObjectCategory, ROOM_STATUS, type RoomStatus, PHOTO_SET_QUERY } from "@/lib/constants"

// Mirrors RoomResponse in DesignApp.Api (src/DesignApp.Api/Rooms/RoomResponse.cs).
// The full contract is in the API docs at /scalar.

/**
 * Whether no analysis is running: it is over (successfully or not), or it waits for the user to start it.
 * @param status - The room's status.
 */
export function isAnalysisFinished(status: RoomStatus) {
  return status === ROOM_STATUS.Ready || status === ROOM_STATUS.Failed || status === ROOM_STATUS.Waiting
}

/** Normalized to 0..1 of the photo's width and height. */
export type BoundingBox = { x: number; y: number; width: number; height: number }

/** One object the AI found in the photo. */
export type DetectedObject = {
  /** The object's value in the label map; unique within the room. */
  index: number
  /** What the object is, such as "sofa". */
  label: string
  /** The kind of object. */
  category: ObjectCategory
  /** Where the object is in the photo. */
  box: BoundingBox
  /** "#RRGGBB" */
  dominantColor: string
  /** For a part of another object (a chair's seat), that object's index; null or missing for a whole object. */
  parentIndex?: number | null
}

/** An uploaded room photo and what the AI found in it. */
export type Room = {
  /** The room's id. */
  id: string
  /** Where the room is in the analysis. */
  status: RoomStatus
  /** Photo width in pixels. */
  width: number
  /** Photo height in pixels. */
  height: number
  /** Relative to the API base URL; pass it through apiUrl(). */
  photoUrl: string
  /** Upload time, ISO 8601. */
  createdAt: string
  /** Why the analysis failed; null unless status is Failed. */
  failureReason: string | null
  /** The detected objects; empty until the room is ready. */
  objects: DetectedObject[]
  /**
   * The current label map version (relative, like photoUrl): a grayscale PNG whose pixel values
   * are object indexes, 0 for none. It is the analysis size (at most 2048 px), so scale it to the
   * photo. Null until the room is ready.
   */
  labelMapUrl: string | null
  /** The current label map version: 0 from the analysis, higher after outline fixes. */
  labelMapRevision: number
  /** What the analysis looked for. */
  scope: AnalysisScope
  /** Which AI analyzed the photo. */
  aiMode: AiMode
  /**
   * For each label map version (by its number), which photo version goes with it: 0 is the uploaded photo,
   * higher ones were made by removing objects.
   */
  photoVersions: number[]
  /** The built-in library layout it was copied from, such as "minimalist/kitchen/2"; null for an uploaded photo. */
  libraryRoom: string | null
  /** The room plan whose photos it holds; null for an upload or a library room. */
  planId: string | null
  /** Which of its photos to choose from is its photo; null when it has none. */
  chosenTakeId: string | null
  /** Named in its photo and outline addresses, new each time a photo is chosen; null when it has none. */
  photoSetId: string | null
}

/** One of a room's photos to choose from (API PhotoTakeResponse): a Generate photo, or an AI change of one. */
export type PhotoTake = {
  id: string
  photoUrl: string
  width: number
  height: number
  /** Its view's name, or the change asked for. */
  note: string
  /** The photo it was changed from, if any. */
  changedFrom: string | null
  createdAt: string
}

/**
 * A room file's address with the room's photo set in it: choosing a photo gives the room a new photo and new outlines
 * under the same paths, which the browser keeps for good (API Constants.Routes.RoomPhotoUrl).
 * @param room - The room.
 * @param path - The file's path.
 */
function withSet(room: Pick<Room, "photoSetId">, path: string) {
  return room.photoSetId ? `${path}?${PHOTO_SET_QUERY}=${room.photoSetId}` : path
}

/**
 * Where a stored label map version is (relative, like photoUrl). Every version stays the same
 * forever, so the browser can cache each one.
 * @param room - The room (its id, and its photo set when it has photos to choose from).
 * @param revision - The version.
 */
export function labelMapUrl(room: Pick<Room, "id" | "photoSetId">, revision: number) {
  return withSet(room, API.roomLabelMap(room.id, revision))
}

/**
 * Where the photo of a label map version is (relative, like photoUrl): the uploaded photo, or the one made by
 * removing objects. Every photo version stays the same forever, so the browser can cache each one.
 * @param room - The room.
 * @param revision - The label map version.
 */
export function photoUrlFor(room: Room, revision: number) {
  const version = room.photoVersions?.[revision] ?? 0

  return withSet(room, version === 0 ? API.roomPhoto(room.id) : API.roomPhotoVersion(room.id, version))
}
