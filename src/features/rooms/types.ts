import { API } from "@/lib/constants"

// Mirrors RoomResponse in DesignApp.Api (src/DesignApp.Api/Rooms/RoomResponse.cs).
// The full contract is in the API docs at /scalar.

/** Where a room is in the AI analysis, from upload to ready. */
export type RoomStatus = "Uploaded" | "Analyzing" | "Segmenting" | "Ready" | "Failed"

/**
 * Whether the analysis is over, successfully or not.
 * @param status - The room's status.
 */
export function isAnalysisFinished(status: RoomStatus) {
  return status === "Ready" || status === "Failed"
}

/** The kind of a detected object. */
export type ObjectCategory =
  | "Wall"
  | "Floor"
  | "Ceiling"
  | "Furniture"
  | "Textile"
  | "Decor"
  | "Lighting"
  | "Fixture"
  | "Other"
  | "Opening"

/** How each category is shown to the user. */
export const categoryNames: Record<ObjectCategory, string> = {
  Wall: "Wall",
  Floor: "Floor",
  Ceiling: "Ceiling",
  Furniture: "Furniture",
  Textile: "Textile",
  Decor: "Decor",
  Lighting: "Lighting",
  Fixture: "Fixture",
  Other: "Other",
  Opening: "Door/window",
}

/** What the AI looks for, chosen at upload. */
export type AnalysisScope = "WholeRoom" | "NoDoorsOrWindows" | "ObjectsOnly"

/** Which AI analyzes a photo: the free built-in fakes or Claude and SAM 3. */
export type AiMode = "Fake" | "Real"

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
