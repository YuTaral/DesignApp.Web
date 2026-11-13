import { type AiMode, type AnalysisScope, API, type ObjectCategory, ROOM_STATUS, type RoomStatus } from "@/lib/constants"

// Mirrors RoomResponse in DesignApp.Api (src/DesignApp.Api/Rooms/RoomResponse.cs).
// The full contract is in the API docs at /scalar.

/**
 * Whether the analysis is over, successfully or not.
 * @param status - The room's status.
 */
export function isAnalysisFinished(status: RoomStatus) {
  return status === ROOM_STATUS.Ready || status === ROOM_STATUS.Failed
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
}

/**
 * Where a stored label map version is (relative, like photoUrl). Every version stays the same
 * forever, so the browser can cache each one.
 * @param roomId - The room's id.
 * @param revision - The version.
 */
export function labelMapUrl(roomId: string, revision: number) {
  return API.roomLabelMap(roomId, revision)
}

/**
 * Where the photo of a label map version is (relative, like photoUrl): the uploaded photo, or the one made by
 * removing objects. Every photo version stays the same forever, so the browser can cache each one.
 * @param room - The room.
 * @param revision - The label map version.
 */
export function photoUrlFor(room: Room, revision: number) {
  const version = room.photoVersions?.[revision] ?? 0
  return version === 0 ? API.roomPhoto(room.id) : API.roomPhotoVersion(room.id, version)
}
