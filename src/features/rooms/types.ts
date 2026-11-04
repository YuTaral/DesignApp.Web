// Mirrors RoomResponse in DesignApp.Api (src/DesignApp.Api/Rooms/RoomResponse.cs).
// The full contract is in the API docs at /scalar.

/** Where a room is in the AI analysis, from upload to ready. */
export type RoomStatus = "Uploaded" | "Analyzing" | "Segmenting" | "Ready" | "Failed"

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
}
