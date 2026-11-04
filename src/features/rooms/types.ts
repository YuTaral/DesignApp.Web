// Mirrors RoomResponse in DesignApp.Api (src/DesignApp.Api/Rooms/RoomResponse.cs).
// The full contract is in the API docs at /scalar.

export type RoomStatus = "Uploaded" | "Analyzing" | "Segmenting" | "Ready" | "Failed"

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

export type DetectedObject = {
  index: number
  label: string
  category: ObjectCategory
  box: BoundingBox
  /** "#RRGGBB" */
  dominantColor: string
}

export type Room = {
  id: string
  status: RoomStatus
  width: number
  height: number
  /** Relative to the API base URL; pass it through apiUrl(). */
  photoUrl: string
  createdAt: string
  failureReason: string | null
  objects: DetectedObject[]
}
