/**
 * The web app's fixed values: API paths, routes, cache and storage keys, limits, timings and the
 * messages it shows. Add new values here first, then use them; never inline them in components.
 * Values that mirror the API say which API constant they follow.
 */

/** API paths. The Vite dev server forwards /api to the API. */
export const API = {
  account: "/api/account",
  signUp: "/api/account/sign-up",
  signIn: "/api/account/sign-in",
  signOut: "/api/account/sign-out",
  ai: "/api/ai",
  designs: "/api/designs",
  design: (id: string) => `/api/designs/${id}`,
  designRooms: (designId: string) => `/api/designs/${designId}/rooms`,
  designRoom: (designId: string, roomId: string) => `/api/designs/${designId}/rooms/${roomId}`,
  rooms: "/api/rooms",
  room: (id: string) => `/api/rooms/${id}`,
  roomOutline: (id: string) => `/api/rooms/${id}/outline`,
  roomCurrentLabels: (id: string) => `/api/rooms/${id}/labels/current`,
  roomLabelMap: (id: string, revision: number) => `/api/rooms/${id}/labels/${revision}`,
} as const

/** The SignalR hub that reports room changes. Mirrors the API's Constants.Hub. */
export const HUB = {
  path: "/api/hubs/rooms",
  events: { roomChanged: "RoomChanged" },
  methods: { watch: "Watch" },
} as const

/** The upload form's field names. */
export const UPLOAD_FIELDS = { photo: "photo", scope: "scope", ai: "ai" } as const

/** HTTP statuses the app reacts to. */
export const HTTP_STATUS = {
  network: 0,
  created: 201,
  noContent: 204,
  notFound: 404,
  tooLarge: 413,
  tooManyRequests: 429,
  serverError: 500,
  badGateway: 502,
  unavailable: 503,
  gatewayTimeout: 504,
} as const

/** The app's pages. */
export const ROUTES = {
  home: "/",
  room: "/rooms/$roomId",
  designs: "/designs",
  design: "/designs/$designId",
  signIn: "/sign-in",
  signUp: "/sign-up",
} as const

/** Page addresses with their ids filled in, for redirects back after sign-in. */
export const PATHS = {
  design: (id: string) => `/designs/${id}`,
} as const

/** TanStack Query cache keys. */
export const QUERY_KEYS = {
  account: ["account"] as const,
  ai: ["ai"] as const,
  designs: ["designs"] as const,
  design: (id: string) => ["designs", id] as const,
  room: (id: string) => ["rooms", id] as const,
} as const

/** Browser storage keys. The theme key is also read by the pre-paint script in index.html. */
export const STORAGE_KEYS = {
  theme: "designapp-theme",
  ai: "designapp.ai",
  scope: "designapp.scope",
} as const

/** Limits. The API's own limits are named next to each. */
export const LIMITS = {
  /** Photo uploads: Application Constants.Photos.MaxUploadMegabytes. */
  photoMegabytes: 15,
  photoBytes: 15 * 1024 * 1024,
  /** Domain Constants.Designs. */
  design: { name: 80, description: 300, rooms: 20 },
  /** Api Constants.Accounts.MinPasswordLength. */
  minPasswordLength: 8,
  /** Application Constants.Strokes.MaxPoints. */
  maxStrokePoints: 10_000,
  /** Brush diameters on screen, in CSS px: zooming in makes the same brush finer on the photo. */
  brushSizes: { min: 2, max: 120, default: 24 },
  zoom: { min: 1, max: 8 },
  /** A press that moves less than this (CSS px) is a tap, not a drag. */
  tapSlop: 5,
  /** Failed room loads tried again (a 404 never is). */
  roomRetries: 2,
} as const

/** Timings in milliseconds. */
export const TIMINGS = {
  /** How often a room is polled while it is analyzed, in case the live connection fails. */
  roomPollMs: 5000,
  /** How long the account answer is reused. */
  accountStaleMs: 60_000,
} as const

/** File types. Mirrors what the API reads (Infrastructure Constants.Messages.UnsupportedPhoto). */
export const MIME = {
  json: "application/json",
  photos: ["image/jpeg", "image/png", "image/webp"],
  anyImage: "image/*",
} as const

/** Paint-like colors offered for every object: warm neutrals, earthy tones and a few deep accents. */
export const SWATCHES = [
  "#F4F1EA", "#E8DCC8", "#D8C3A5", "#C9A27E", "#B5543C", "#8C3B2E",
  "#D9C27A", "#A8B89A", "#7D8B6A", "#4F6B3A", "#9DB4C0", "#4A6274",
  "#2E4057", "#6E5A7E", "#8A8580", "#2F2C2A",
] as const

/** Strength a newly recolored object starts with. */
export const DEFAULT_STRENGTH = 0.8

/** Messages shown to people: toasts, errors, empty states and confirm dialogs. */
export const MESSAGES = {
  network: "Can't reach DesignApp right now. Check your connection and try again.",
  notFound: "We couldn't find that.",
  tooLarge: `That photo is too large. Use one under ${LIMITS.photoMegabytes} MB.`,
  tooManyRequests: "That's a lot of tries in a short time. Try again in a little while.",
  serverError: "Something went wrong on our side. Try again in a moment.",
  unknownError: "Something went wrong. Try again.",
  uploadCancelled: "The upload was cancelled.",
  wrongFileType: "Use a JPG, PNG or WebP photo.",
  fileTooLarge: `That photo is over ${LIMITS.photoMegabytes} MB. Try a smaller one.`,
  labelMapFailed: (status: number) => `The label map couldn't be loaded (${status}).`,
  labelMapUnreadable: "This browser can't read the label map.",
  editorFailed: "The editor couldn't start.",
  outlinesFailed: "The outlines couldn't be loaded.",
  analysisFailedHint: "Try uploading it again.",
  signedOut: "Signed out",
  designSaved: "Design saved",
  addedTo: (name: string) => `Added to ${name}`,
  colorsSaved: "Colors saved",
  designUpdated: "Design updated",
  designDeleted: "Design deleted",
  roomRemoved: "Room removed",
  designOpenFailed: "We couldn't open that design. It may have been deleted.",
  lastRoom: "A design needs at least one room. Delete the design instead.",
  removeRoomTitle: (label: string) => `Remove ${label.toLowerCase()}?`,
  removeRoomText: "The room, its photo and its colors are deleted. The rest of the design stays.",
  deleteDesignTitle: (name: string) => `Delete “${name}”?`,
  deleteDesignText: (rooms: string) => `Its ${rooms}, their photos and colors are deleted for good.`,
  designSignIn: "Sign in to see this design",
  designsSignIn: "Sign in to see your designs",
  designsInAccount: "Designs are saved to your account.",
  designsAnyDevice: "Designs are saved to your account, so you can open them on any device.",
  designNotFound: "We couldn't find that design",
  designLoadFailed: "We couldn't load this design",
  designMaybeDeleted: "It may have been deleted.",
  designsLoadFailed: "We couldn't load your designs",
  noDesigns: "No designs yet",
  noDesignsHint: "Upload a room, try some colors, then press Save design.",
  roomNotFound: "We couldn't find that room",
  roomLoadFailed: "We couldn't load this room",
  roomMaybeRemoved: "It may have been removed. Upload a photo to start a new design.",
} as const
