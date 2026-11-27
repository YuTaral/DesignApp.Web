/**
 * The web app's fixed values: API paths, routes, cache and storage keys, limits, timings, the API's
 * enums and the messages it shows. Add new values here first, then use them; never inline them in components.
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
  roomObjects: (id: string) => `/api/rooms/${id}/objects`,
  roomRemovals: (id: string) => `/api/rooms/${id}/removals`,
  roomMerges: (id: string) => `/api/rooms/${id}/merges`,
  roomAnalysis: (id: string) => `/api/rooms/${id}/analysis`,
  roomParts: (id: string) => `/api/rooms/${id}/parts`,
  roomPhoto: (id: string) => `/api/rooms/${id}/photo`,
  roomPhotoVersion: (id: string, version: number) => `/api/rooms/${id}/photo/${version}`,
  roomCurrentLabels: (id: string) => `/api/rooms/${id}/labels/current`,
  roomLabelMap: (id: string, revision: number) => `/api/rooms/${id}/labels/${revision}`,
  roomTakes: (id: string) => `/api/rooms/${id}/takes`,
  roomTakeChange: (id: string, takeId: string) => `/api/rooms/${id}/takes/${takeId}/change`,
  roomTakeChoice: (id: string, takeId: string) => `/api/rooms/${id}/takes/${takeId}/choose`,
  roomPlanDesign: (id: string) => `/api/rooms/${id}/plan-design`,
  /** Reads an uploaded room's photo into a new room plan. */
  roomPlan: (id: string) => `/api/rooms/${id}/plan`,
  palettes: "/api/palettes",
  builderCatalog: (roomType: string) => `/api/builder/catalog/${roomType}`,
  plans: "/api/plans",
  plan: (id: string) => `/api/plans/${id}`,
  planDescribe: (id: string) => `/api/plans/${id}/describe`,
  planGenerate: (id: string) => `/api/plans/${id}/generate`,
  /** A plan's 360° photo, made as a new room. */
  planPanorama: (id: string) => `/api/plans/${id}/panorama`,
  /** A view of a room's 360° photo, saved as one of its photos. */
  roomPanoramaViews: (id: string) => `/api/rooms/${id}/panorama/views`,
  library: "/api/library",
  libraryLayoutCopy: (designId: string, roomId: string, layoutId: string) => `/api/library/${designId}/${roomId}/${layoutId}/copy`,
  libraryDesignCopy: (designId: string) => `/api/library/${designId}/copy`,
} as const

/** The SignalR hub that reports room changes. Mirrors the API's Constants.Hub. */
export const HUB = {
  path: "/api/hubs/rooms",
  events: { roomChanged: "RoomChanged" },
  methods: { watch: "Watch" },
} as const

/** The upload form's field names. */
export const UPLOAD_FIELDS = { photo: "photo", scope: "scope", ai: "ai", analyze: "analyze" } as const

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

/** The query parameter that names a room's photo set in its photo and outline addresses (API Constants.Routes.PhotoSetQuery). */
export const PHOTO_SET_QUERY = "set"

/** The app's pages. */
export const ROUTES = {
  home: "/",
  room: "/rooms/$roomId",
  photos: "/rooms/$roomId/photos",
  designs: "/designs",
  design: "/designs/$designId",
  library: "/library",
  build: "/build",
  plan: "/build/$planId",
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
  rooms: ["rooms"] as const,
  roomTakes: (id: string) => ["rooms", id, "takes"] as const,
  library: ["library"] as const,
  palettes: ["palettes"] as const,
  plan: (id: string) => ["plans", id] as const,
  plans: ["plans"] as const,
  catalog: (roomType: string) => ["catalog", roomType] as const,
} as const

/** Browser storage keys. The theme key is also read by the pre-paint script in index.html. */
export const STORAGE_KEYS = {
  theme: "designapp-theme",
  ai: "designapp.ai",
  scope: "designapp.scope",
  /** The room builder's catalog sections the user collapsed, by name. */
  builderCollapsed: "designapp.builder.collapsed",
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
  /** The smallest box, in CSS px either way; anything smaller is a tap and fills nothing. */
  minAreaPx: 2,
  /** A hand-marked object: Application Constants.Marks. */
  mark: { maxStrokes: 100, nameLength: 60 },
  /** The longest instructions for the AI when it recognizes parts (Application Constants.Parts). */
  partInstructions: 500,
  /**
   * Removing objects together: Application Constants.Removals. An object rests on another when that one is directly
   * below (within restingGap label-map pixels) at least restingShare of its bottom edge.
   */
  removal: { maxObjects: 20, restingGap: 3, restingShare: 0.5 },
  /** Brush diameters on screen, in CSS px: zooming in makes the same brush finer on the photo. */
  brushSizes: { min: 2, max: 120, default: 24 },
  /** How far a view zooms: from the whole picture to 8 times, 1.5 times per button press, and per pixel of a wheel turn. */
  zoom: { min: 1, max: 8, step: 1.5, wheel: 0.0015 },
  /** A view zoomed in on an object (the Parts dialog) shows its box this many times its size, for some margin. */
  focusMargin: 1.3,
  /** A press that moves less than this (CSS px) is a tap, not a drag. */
  tapSlop: 5,
  /** Failed room and built-room loads tried again (a 404 never is). */
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

// Enums. Each mirrors the API enum of the same name (Domain or Application Constants) and is sent
// as its name in JSON; the type is derived from the values, so the two never drift apart.

/** Where a room is in the AI analysis, from upload to ready. */
export const ROOM_STATUS = {
  Waiting: "Waiting",
  Uploaded: "Uploaded",
  Analyzing: "Analyzing",
  Segmenting: "Segmenting",
  Ready: "Ready",
  Failed: "Failed",
} as const

export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS]

/** The kind of a detected object. */
export const OBJECT_CATEGORY = {
  Wall: "Wall",
  Floor: "Floor",
  Ceiling: "Ceiling",
  Furniture: "Furniture",
  Textile: "Textile",
  Decor: "Decor",
  Lighting: "Lighting",
  Fixture: "Fixture",
  Other: "Other",
  Opening: "Opening",
} as const

export type ObjectCategory = (typeof OBJECT_CATEGORY)[keyof typeof OBJECT_CATEGORY]

/**
 * The kinds of objects offered for removal along with what they rest on (cushions, a vase, a lamp). Furniture, fixtures,
 * doors and windows stand on their own: one seen behind a table looks like it rests on it, but isn't on it.
 */
export const RESTING_CATEGORIES: readonly ObjectCategory[] = [OBJECT_CATEGORY.Textile, OBJECT_CATEGORY.Decor, OBJECT_CATEGORY.Lighting, OBJECT_CATEGORY.Other]

/** The surfaces: they can be recolored but not removed from the photo (Domain ObjectCategories.IsSurface). */
export const SURFACE_CATEGORIES: readonly ObjectCategory[] = [OBJECT_CATEGORY.Wall, OBJECT_CATEGORY.Floor, OBJECT_CATEGORY.Ceiling]

/** The categories the paint list covers: walls and ceilings, which are painted (floors and furniture are not). */
export const PAINTABLE_CATEGORIES: readonly ObjectCategory[] = [OBJECT_CATEGORY.Wall, OBJECT_CATEGORY.Ceiling]

/** How each category is shown to the user. */
export const CATEGORY_NAMES: Record<ObjectCategory, string> = {
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
export const ANALYSIS_SCOPE = {
  WholeRoom: "WholeRoom",
  NoDoorsOrWindows: "NoDoorsOrWindows",
  ObjectsOnly: "ObjectsOnly",
} as const

export type AnalysisScope = (typeof ANALYSIS_SCOPE)[keyof typeof ANALYSIS_SCOPE]

/** Which AI analyzes a photo: the free built-in fakes or Claude and SAM 3. */
export const AI_MODE = { Fake: "Fake", Real: "Real" } as const

export type AiMode = (typeof AI_MODE)[keyof typeof AI_MODE]

/** How the area being marked as a new object is tinted while marking: the accent color over a mid gray. */
export const MARK_PREVIEW = { color: "#F97316", source: "#808080", strength: 0.75 } as const

/** Whether a brush stroke adds pixels to the object or takes them away. */
export const OUTLINE_BRUSH_MODE = { Paint: "Paint", Erase: "Erase" } as const

export type OutlineBrushMode = (typeof OUTLINE_BRUSH_MODE)[keyof typeof OUTLINE_BRUSH_MODE]

/**
 * What a stroke covers (Application Constants.StrokeShape): a round brush along the path, the rectangle between a
 * box's two corners, or the inside of a lasso drawn around an area.
 */
export const STROKE_SHAPE = { Brush: "Brush", Box: "Box", Lasso: "Lasso" } as const

export type StrokeShape = (typeof STROKE_SHAPE)[keyof typeof STROKE_SHAPE]

/** The kinds of room the builder makes (Domain Constants.RoomType), each with its own common objects. */
export const ROOM_TYPE = {
  LivingRoom: "LivingRoom", Bedroom: "Bedroom", Kitchen: "Kitchen", Bathroom: "Bathroom",
  DiningRoom: "DiningRoom", HomeOffice: "HomeOffice", KidsRoom: "KidsRoom",
} as const

export type RoomType = (typeof ROOM_TYPE)[keyof typeof ROOM_TYPE]

/** How each room type is shown to the user. */
export const ROOM_TYPE_NAMES: Record<RoomType, string> = {
  LivingRoom: "Living room", Bedroom: "Bedroom", Kitchen: "Kitchen", Bathroom: "Bathroom",
  DiningRoom: "Dining room", HomeOffice: "Home office", KidsRoom: "Kids' room",
}

/**
 * How a built room's object is drawn in 3D (Domain Constants.ItemShape). Windows and doors are in a wall; a Picture
 * (paintings, mirrors, a wall TV) and a WallBox (upper cabinets, shelves, a hood) hang on one. A FloorZone and a
 * WallZone are areas of the floor or a wall in their own material and color: surfaces, not furniture. The ceiling
 * lights (a pendant, spotlights, a chandelier, a flush ceiling lamp, a track) hang from the ceiling over the plan, their
 * height being how far down they reach.
 */
export const ITEM_SHAPE = {
  Box: "Box", Rounded: "Rounded", Cylinder: "Cylinder", Sofa: "Sofa", Bed: "Bed",
  Table: "Table", Chair: "Chair", Rug: "Rug", Plant: "Plant", Lamp: "Lamp",
  Window: "Window", Door: "Door", Picture: "Picture", WallBox: "WallBox",
  FloorZone: "FloorZone", WallZone: "WallZone",
  PendantLight: "PendantLight", Spotlight: "Spotlight", Chandelier: "Chandelier", CeilingLamp: "CeilingLamp", TrackLight: "TrackLight",
  Archway: "Archway", Niche: "Niche",
} as const

/** The ceiling lights the Ceiling tab adds, each its catalog object and its name there, in that order. */
export const CEILING_LIGHTS = [
  { shape: ITEM_SHAPE.PendantLight, key: "pendant-light", name: "Pendant" },
  { shape: ITEM_SHAPE.Spotlight, key: "spotlights", name: "Spotlights" },
  { shape: ITEM_SHAPE.Chandelier, key: "chandelier", name: "Chandelier" },
  { shape: ITEM_SHAPE.CeilingLamp, key: "ceiling-lamp", name: "Flush lamp" },
  { shape: ITEM_SHAPE.TrackLight, key: "track-light", name: "Track" },
] as const

/**
 * Areas of the floor or a wall in their own material and color. A new one starts in a material other than the room's,
 * so it shows at once.
 */
/** A floor or wall texture tile's side, in cm (`FLOOR_TILE_METRES`), for patterns drawn in plan centimetres. */
export const FLOOR_TILE_CM = 200

export const ZONE = {
  /** A new floor area's width and depth, in cm. */
  floorSize: 100,
  /** A new wall area's width, in cm (it starts as tall as the wall). */
  wallWidth: 100,
  /** How thin an area is, in cm (API: any side of an object is at least 1 cm). */
  thickness: 1,
  /** How far an area lies in front of its floor or wall in 3D, in metres: under rugs, windows, frames and skirting. */
  lift: 0.002,
  /** The names a new area gets. */
  labels: { floor: "floor area", wall: "wall area" },
  /** What a new floor area is made of: tiles, or wood on a tiled floor. */
  floor: { material: "Tiles", color: "#E8E4DC", otherMaterial: "Wood", otherColor: "#B8864B" },
  /** What a new wall area is made of: brick, or wood panelling on brick walls. */
  wall: { material: "Brick", color: "#B5543C", otherMaterial: "WoodPanelling", otherColor: "#B8864B" },
} as const

export type ItemShape = (typeof ITEM_SHAPE)[keyof typeof ITEM_SHAPE]

/**
 * A built room's object's outline seen from above (Domain Constants.ItemForm): a rectangle; an L, with a run along its
 * whole back and a leg running forward at its right end (before turning), both `BUILDER.legShare` of its smaller side
 * deep; a P, an L whose leg widens at its front end into a chaise `BUILDER.chaiseShare` times as wide as the runs are
 * deep (corner sofas); or an ellipse (round when its width and depth are equal). A window may be arched (a round top),
 * and a box may be a shower's glass: a screen along part of its front, or a cubicle with glass on its front and right. A
 * chair may be a swivel office chair: a five-star base on wheels, a gas column, a tall back and armrests.
 */
/**
 * The steps of Build a room after its two ways to start, in the address (`/build?step=walls`) so the browser's Back
 * goes back a step: the walls, the floor, or a photo to read. None is the start, choosing a way.
 */
export const BUILD_STEP = { Walls: "walls", Floor: "floor", Photo: "photo" } as const

export type BuildStep = (typeof BUILD_STEP)[keyof typeof BUILD_STEP]

/** Which end of an L- or P-shaped object's back run its corner leg is at (ItemPartsRequest.LegLeft). */
export const LEG_SIDE = { Left: "Left", Right: "Right" } as const

export type LegSide = (typeof LEG_SIDE)[keyof typeof LEG_SIDE]

export const ITEM_FORM = {
  Standard: "Standard",
  LShaped: "LShaped",
  PShaped: "PShaped",
  Round: "Round",
  Arched: "Arched",
  GlassScreen: "GlassScreen",
  GlassCubicle: "GlassCubicle",
  Swivel: "Swivel",
} as const

export type ItemForm = (typeof ITEM_FORM)[keyof typeof ITEM_FORM]

/**
 * The sides of a built room's floor plan seen from above (Domain Constants.PlanWall): Back at the top, Front at the
 * bottom. Walls are numbered (see `features/builder/room-outline.ts`); each faces from one side, and a rectangle's walls
 * 0 to 3 are its back, right, front and left walls.
 */
export const PLAN_SIDE = { Back: "Back", Right: "Right", Front: "Front", Left: "Left" } as const

export type PlanSide = (typeof PLAN_SIDE)[keyof typeof PLAN_SIDE]

/** The sides' wall names as the user reads them. */
export const PLAN_SIDE_NAMES: Record<PlanSide, string> = { Back: "Back wall", Right: "Right wall", Front: "Front wall", Left: "Left wall" }

/**
 * Where the 3D view's camera stands to look at the wall in view (Domain Constants.ViewCorner): straight across from its
 * middle, in the near left or right corner, turned to look diagonally across the room, or at the plan's camera spot
 * (where the photo it was read from was taken), turned towards the wall's middle.
 */
export const VIEW_CORNER = { None: "None", Left: "Left", Right: "Right", Spot: "Spot" } as const

export type ViewCorner = (typeof VIEW_CORNER)[keyof typeof VIEW_CORNER]

/** Where the camera stands, as the user reads it. */
export const VIEW_CORNER_NAMES: Record<ViewCorner, string> = { None: "Middle", Left: "Left corner", Right: "Right corner", Spot: "Photo's spot" }

/** The interior style a built room's photo is made in (Domain Constants.PhotoStyle): materials and finishes, not layout. */
export const PHOTO_STYLE = {
  AsBuilt: "AsBuilt", Modern: "Modern", Scandinavian: "Scandinavian", Boho: "Boho", Industrial: "Industrial", Japandi: "Japandi",
  MidCentury: "MidCentury", Farmhouse: "Farmhouse", Coastal: "Coastal", Minimalist: "Minimalist", Traditional: "Traditional", ArtDeco: "ArtDeco",
} as const

export type PhotoStyle = (typeof PHOTO_STYLE)[keyof typeof PHOTO_STYLE]

/** The photo styles' names and what each looks like, as the user reads them. */
export const PHOTO_STYLE_NAMES: Record<PhotoStyle, { name: string; looks: string }> = {
  AsBuilt: { name: "As planned", looks: "The materials your objects' names and colors suggest" },
  Modern: { name: "Modern", looks: "Handleless fronts, sleek lacquer, thin metal legs" },
  Scandinavian: { name: "Scandinavian", looks: "Rounded edges, wooden legs and knobs, wool, linen" },
  Boho: { name: "Boho", looks: "Rattan and cane panels, woven textures, fringes" },
  Industrial: { name: "Industrial", looks: "Steel frames, rivets, leather, reclaimed wood" },
  Japandi: { name: "Japandi", looks: "Low profiles, wooden slats, paper and linen" },
  MidCentury: { name: "Mid-century", looks: "Tapered splayed legs, rounded corners, finger pulls" },
  Farmhouse: { name: "Farmhouse", looks: "Shaker fronts, cup pulls, wrought iron, turned legs" },
  Coastal: { name: "Coastal", looks: "Rope and rattan, louvred fronts, weathered wood" },
  Minimalist: { name: "Minimalist", looks: "Flat handleless fronts, hidden legs, nothing extra" },
  Traditional: { name: "Traditional", looks: "Raised panels, carved trims, turned legs, tufting" },
  ArtDeco: { name: "Art deco", looks: "Fluted panels, geometric inlays, metal trims, velvet" },
}

/** What a built room's floor is made of (Domain Constants.FloorType). */
export const FLOOR_TYPE = {
  Wood: "Wood", Parquet: "Parquet", Tiles: "Tiles", Stone: "Stone", Concrete: "Concrete", Carpet: "Carpet", Vinyl: "Vinyl",
} as const

export type FloorType = (typeof FLOOR_TYPE)[keyof typeof FLOOR_TYPE]

/** The floor types' names as the user reads them. */
export const FLOOR_TYPE_NAMES: Record<FloorType, string> = {
  Wood: "Wooden planks", Parquet: "Parquet", Tiles: "Tiles", Stone: "Stone", Concrete: "Concrete", Carpet: "Carpet", Vinyl: "Vinyl",
}

/** What covers the wall behind a kitchen worktop (Domain Constants.BacksplashKind). */
export const BACKSPLASH = { None: "None", Upstand: "Upstand", WorktopUp: "WorktopUp", Tiles: "Tiles", Glass: "Glass" } as const

export type Backsplash = (typeof BACKSPLASH)[keyof typeof BACKSPLASH]

/** The backsplashes' names as the user reads them. */
export const BACKSPLASH_NAMES: Record<Backsplash, string> = {
  None: "None", Upstand: "Upstand", WorktopUp: "Worktop up the wall", Tiles: "Tiles", Glass: "Glass",
}

/** Where a catalog object's worktop is (Domain Constants.WorktopSpot): along a wall, or on an island. */
export const WORKTOP_SPOT = { Wall: "Wall", Island: "Island" } as const

export type WorktopSpot = (typeof WORKTOP_SPOT)[keyof typeof WORKTOP_SPOT]

/**
 * A kitchen unit's worktop: what it is made of, the colors offered for it and for a tiled or glass backsplash, and what a
 * new one starts as (the API's StarterLayout: white quartz with an upstand).
 */
export const WORKTOP = {
  materials: ["quartz", "marble", "granite", "oak", "walnut", "laminate", "concrete", "stainless steel"],
  colors: [
    "#FFFFFF", "#F2F0EB", "#E8DCC8", "#D8C3A5", "#C8C8C8", "#8A8580", "#3A3A3A", "#1E1E1E",
    "#B8864B", "#8B5A2B", "#5C3A21", "#A8A29A", "#9C9A96", "#B0B4B8", "#4A6274", "#2E4057",
  ],
  backsplashColors: [
    "#FFFFFF", "#F4F1EA", "#E8DCC8", "#C8C8C8", "#8A8580", "#3A3A3A", "#A8B89A", "#4F6B3A",
    "#9DB4C0", "#4A6274", "#2E4057", "#B5543C", "#C0603A", "#E3B23C", "#E9CFC7", "#1E1E1E",
  ],
  start: { material: "quartz", color: "#F2F0EB", backsplash: BACKSPLASH.Upstand, backsplashColor: "#F2F0EB" },
  /** The color tiles or glass start in when they would match the worktop (and look like it). */
  ownStart: "#C8C8C8",
} as const

/** What a window is dressed with (Domain Constants.CoveringKind). */
export const COVERING_KIND = {
  Sheers: "Sheers", Curtains: "Curtains", SheersAndCurtains: "SheersAndCurtains", RollerBlind: "RollerBlind", RomanBlind: "RomanBlind",
  VenetianBlind: "VenetianBlind", VerticalBlinds: "VerticalBlinds",
} as const

export type CoveringKind = (typeof COVERING_KIND)[keyof typeof COVERING_KIND]

/** The coverings' names as the user reads them. */
export const COVERING_KIND_NAMES: Record<CoveringKind, string> = {
  Sheers: "Sheers", Curtains: "Curtains", SheersAndCurtains: "Sheers + curtains", RollerBlind: "Roller blind", RomanBlind: "Roman blind",
  VenetianBlind: "Venetian blind", VerticalBlinds: "Vertical blinds",
}

/** How far a window's curtains hang (Domain Constants.CurtainLength). */
export const CURTAIN_LENGTH = { Sill: "Sill", Floor: "Floor" } as const

export type CurtainLength = (typeof CURTAIN_LENGTH)[keyof typeof CURTAIN_LENGTH]

/** The curtain lengths' names as the user reads them. */
export const CURTAIN_LENGTH_NAMES: Record<CurtainLength, string> = { Sill: "To the sill", Floor: "To the floor" }

/**
 * A window's curtains and blinds: what each kind is made of (the first is a new one's), the colors offered, and what a
 * new one starts as.
 */
export const COVERING = {
  curtainFabrics: ["linen", "cotton", "velvet", "wool", "voile"],
  blindFabrics: ["fabric", "linen", "wood", "bamboo", "aluminium"],
  colors: [
    "#FFFFFF", "#F4F1EA", "#E8DCC8", "#D8C3A5", "#C8C8C8", "#8A8580", "#3A3A3A", "#1E1E1E",
    "#A8B89A", "#7D8B6A", "#9DB4C0", "#4A6274", "#2E4057", "#E9CFC7", "#B5543C", "#C9A44C",
  ],
  start: { color: "#F4F1EA", length: CURTAIN_LENGTH.Floor },
} as const

/** What a built room's walls are finished in (Domain Constants.WallFinish). */
export const WALL_FINISH = {
  Paint: "Paint", Wallpaper: "Wallpaper", Plaster: "Plaster", Brick: "Brick", WoodPanelling: "WoodPanelling", Tiles: "Tiles", Concrete: "Concrete",
} as const

export type WallFinish = (typeof WALL_FINISH)[keyof typeof WALL_FINISH]

/** The wall finishes' names as the user reads them. */
export const WALL_FINISH_NAMES: Record<WallFinish, string> = {
  Paint: "Paint", Wallpaper: "Wallpaper", Plaster: "Limewash", Brick: "Brick", WoodPanelling: "Wood panels", Tiles: "Tiles", Concrete: "Concrete",
}

/** The color of a built room's lamps' and ceiling lights' light (Domain Constants.LightTone). */
export const LIGHT_TONE = { Warm: "Warm", Neutral: "Neutral", Cool: "Cool" } as const

export type LightTone = (typeof LIGHT_TONE)[keyof typeof LIGHT_TONE]

/** The light colors' names and what each looks like, as the user reads them. */
export const LIGHT_TONE_NAMES: Record<LightTone, { name: string; looks: string }> = {
  Warm: { name: "Warm", looks: "Warm white, cosy (2700 K)" },
  Neutral: { name: "Neutral", looks: "Neutral white (4000 K)" },
  Cool: { name: "Cool", looks: "Cool, daylight white (5500 K)" },
}

/** How a built room's ceiling is shaped (Domain Constants.CeilingStyle). */
export const CEILING_STYLE = { Flat: "Flat", Beams: "Beams", Coffered: "Coffered", Tray: "Tray" } as const

export type CeilingStyle = (typeof CEILING_STYLE)[keyof typeof CEILING_STYLE]

/** The ceiling styles' names and what each looks like, as the user reads them. */
export const CEILING_STYLE_NAMES: Record<CeilingStyle, { name: string; looks: string }> = {
  Flat: { name: "Flat", looks: "A plain, flat ceiling" },
  Beams: { name: "Beams", looks: "Exposed wooden beams across the room" },
  Coffered: { name: "Coffered", looks: "A grid of recessed square panels" },
  Tray: { name: "Tray", looks: "A raised middle with a lower border around the walls" },
}

/** The mouldings run along a built room's walls, in the trim color (Domain Constants.Moulding), in their order. */
export const MOULDING = { Crown: "Crown", PictureRail: "PictureRail", DadoRail: "DadoRail" } as const

export type Moulding = (typeof MOULDING)[keyof typeof MOULDING]

/** The mouldings' names and where each runs. */
export const MOULDING_NAMES: Record<Moulding, { name: string; looks: string }> = {
  Crown: { name: "Crown", looks: "Crown moulding where the walls meet the ceiling" },
  PictureRail: { name: "Picture rail", looks: "A rail a little below the ceiling" },
  DadoRail: { name: "Dado rail", looks: "A rail at hip height" },
}

/** The panelling on the lower part of a built room's walls (Domain Constants.Wainscot). */
export const WAINSCOT = { None: "None", RaisedPanels: "RaisedPanels", Beadboard: "Beadboard", ShakerPanels: "ShakerPanels" } as const

export type Wainscot = (typeof WAINSCOT)[keyof typeof WAINSCOT]

/** The wainscoting's names and what each looks like. */
export const WAINSCOT_NAMES: Record<Wainscot, { name: string; looks: string }> = {
  None: { name: "None", looks: "No panelling" },
  RaisedPanels: { name: "Raised panels", looks: "Classic raised panels" },
  Beadboard: { name: "Beadboard", looks: "Narrow vertical boards" },
  ShakerPanels: { name: "Shaker", looks: "Flat panels in plain square frames" },
}

/** A built room's cabinet door style (Domain Constants.CabinetFronts). */
export const CABINET_FRONTS = { Slab: "Slab", Shaker: "Shaker", Fluted: "Fluted" } as const

export type CabinetFronts = (typeof CABINET_FRONTS)[keyof typeof CABINET_FRONTS]

/** The cabinet fronts' names and what each looks like. */
export const CABINET_FRONTS_NAMES: Record<CabinetFronts, { name: string; looks: string }> = {
  Slab: { name: "Slab", looks: "Flat, plain doors" },
  Shaker: { name: "Shaker", looks: "A recessed middle in a square frame" },
  Fluted: { name: "Fluted", looks: "Fine vertical reeds" },
}

/** The handles on a built room's cabinets (Domain Constants.HandleStyle). */
export const HANDLE_STYLE = { Bar: "Bar", Knob: "Knob", CupPull: "CupPull", EdgePull: "EdgePull", Handleless: "Handleless" } as const

export type HandleStyle = (typeof HANDLE_STYLE)[keyof typeof HANDLE_STYLE]

/** The handles' names and what each looks like. */
export const HANDLE_STYLE_NAMES: Record<HandleStyle, { name: string; looks: string }> = {
  Bar: { name: "Bar", looks: "Slim bar handles" },
  Knob: { name: "Knob", looks: "Round knobs" },
  CupPull: { name: "Cup pull", looks: "Cup pulls" },
  EdgePull: { name: "Edge pull", looks: "A thin pull along the top edge" },
  Handleless: { name: "Handleless", looks: "Push-to-open doors with a groove" },
}

/** The metal finish of a built room's handles, taps and fittings (Domain Constants.Hardware). */
export const HARDWARE = { BrushedBrass: "BrushedBrass", MatteBlack: "MatteBlack", Chrome: "Chrome", BrushedSteel: "BrushedSteel" } as const

export type Hardware = (typeof HARDWARE)[keyof typeof HARDWARE]

/** The hardware finishes' names and their color in the 3D view and the Wall tab. */
export const HARDWARE_NAMES: Record<Hardware, { name: string; color: string }> = {
  BrushedBrass: { name: "Brass", color: "#B08D57" },
  MatteBlack: { name: "Black", color: "#2A2A2A" },
  Chrome: { name: "Chrome", color: "#C9CCD1" },
  BrushedSteel: { name: "Steel", color: "#A3A6A8" },
}

/** A built kitchen's sink (Domain Constants.KitchenSink). */
export const KITCHEN_SINK = { Undermount: "Undermount", Farmhouse: "Farmhouse", Inset: "Inset" } as const

export type KitchenSink = (typeof KITCHEN_SINK)[keyof typeof KITCHEN_SINK]

/** The sinks' names and what each looks like. */
export const KITCHEN_SINK_NAMES: Record<KitchenSink, { name: string; looks: string }> = {
  Undermount: { name: "Undermount", looks: "Mounted under the worktop" },
  Farmhouse: { name: "Farmhouse", looks: "A deep sink with an apron front" },
  Inset: { name: "Inset", looks: "Dropped in, its rim on the worktop" },
}

/** A built kitchen's tap (Domain Constants.KitchenTap). */
export const KITCHEN_TAP = { Gooseneck: "Gooseneck", Bridge: "Bridge", PullDown: "PullDown" } as const

export type KitchenTap = (typeof KITCHEN_TAP)[keyof typeof KITCHEN_TAP]

/** The taps' names and what each looks like. */
export const KITCHEN_TAP_NAMES: Record<KitchenTap, { name: string; looks: string }> = {
  Gooseneck: { name: "Gooseneck", looks: "A tall arched spout" },
  Bridge: { name: "Bridge", looks: "A traditional tap with two handles" },
  PullDown: { name: "Pull-down", looks: "A pull-down spray head" },
}

/** A built bathroom vanity's basin (Domain Constants.Basin). */
export const BASIN = { Integrated: "Integrated", Undermount: "Undermount", Vessel: "Vessel" } as const

export type Basin = (typeof BASIN)[keyof typeof BASIN]

/** The basins' names and what each looks like. */
export const BASIN_NAMES: Record<Basin, { name: string; looks: string }> = {
  Integrated: { name: "Integrated", looks: "Moulded into the vanity top" },
  Undermount: { name: "Undermount", looks: "Mounted under the vanity top" },
  Vessel: { name: "Vessel", looks: "A bowl sitting on the vanity top" },
}

/** How a built room's tiles are laid (Domain Constants.TilePattern). */
export const TILE_PATTERN = { Grid: "Grid", Subway: "Subway", Herringbone: "Herringbone", VerticalStack: "VerticalStack", LargeFormat: "LargeFormat" } as const

export type TilePattern = (typeof TILE_PATTERN)[keyof typeof TILE_PATTERN]

/** The tile patterns' names and what each looks like. */
export const TILE_PATTERN_NAMES: Record<TilePattern, { name: string; looks: string }> = {
  Grid: { name: "Grid", looks: "Square tiles in a straight grid" },
  Subway: { name: "Subway", looks: "Subway tiles in a brick bond" },
  Herringbone: { name: "Herringbone", looks: "Herringbone" },
  VerticalStack: { name: "Vertical", looks: "Long tiles stacked vertically" },
  LargeFormat: { name: "Large", looks: "Large-format tiles, about 60 × 120 cm" },
}

/** The trim around a built room's doors, windows and archways (Domain Constants.Casing). */
export const CASING = { Plain: "Plain", Simple: "Simple", Wide: "Wide", Ornate: "Ornate" } as const

export type Casing = (typeof CASING)[keyof typeof CASING]

/** The casings' names and what each looks like. */
export const CASING_NAMES: Record<Casing, { name: string; looks: string }> = {
  Plain: { name: "Plain", looks: "No casing: a plain plastered reveal" },
  Simple: { name: "Simple", looks: "A slim, simple casing" },
  Wide: { name: "Wide", looks: "A wide, flat casing" },
  Ornate: { name: "Ornate", looks: "A classic stepped casing with a head cap" },
}

/** The sides of the plan, as where north is: the plan's top, right, bottom or left (the Domain's PlanWall). */
export const NORTH_NAMES: Record<PlanSide, string> = { Back: "Top", Right: "Right", Front: "Bottom", Left: "Left" }

/** When a built room's photo is taken, which sets its light and mood (Domain Constants.TimeOfDay). */
export const TIME_OF_DAY = { Morning: "Morning", Midday: "Midday", GoldenHour: "GoldenHour", Evening: "Evening" } as const

export type TimeOfDay = (typeof TIME_OF_DAY)[keyof typeof TIME_OF_DAY]

/** The times of day's names and what each looks like, as the user reads them. */
export const TIME_OF_DAY_NAMES: Record<TimeOfDay, { name: string; looks: string }> = {
  Morning: { name: "Morning", looks: "Soft, cool daylight" },
  Midday: { name: "Midday", looks: "Bright, even daylight" },
  GoldenHour: { name: "Golden hour", looks: "Warm, low sun and long shadows" },
  Evening: { name: "Evening", looks: "Dark outside: the lights that are on light the room" },
}

/**
 * The room builder (Domain Constants.Plans and Application Constants.Builder). Walls in metres, objects in
 * centimetres; positions snap to the grid; the 3D view sent for a photo is `guide` pixels (the photo's 4:3, and
 * under the one megapixel the image model charges for).
 */
/**
 * A room's 360° photo: one equirectangular picture from one spot, drawn from the 3D room as six cube faces, made into a
 * photo by the image model, and looked around in the viewer, whose views can be saved as the room's photos.
 */
export const PANORAMA = {
  /** The 360° view sent to the image model, twice as wide as it is tall (API Constants.Panoramas.Width / Height). */
  width: 4096,
  height: 2048,
  /** Each cube face's width and height when drawing it, in pixels (more than the panorama's 11 px per degree). */
  faceSize: 1536,
  /** The fewest pixels an object must show in the 360° view to get a box. */
  minBoxPixels: 200,
  /** How far the camera keeps from the walls, in cm. */
  wallGap: 70,
  /** How far from furniture is clear enough, in cm. */
  enoughClear: 100,
  /** The grid the camera's spot is picked on, in cm. */
  spotStep: 10,
  /** How strongly the spot is drawn to the room's middle among equally clear points (cm of clearance per cm off-centre). */
  middlePull: 0.15,
  /** The furthest the view may start from the panorama's middle, in degrees (Domain Constants.Rooms.MaxPanoramaStartYaw). */
  maxStartYaw: 120,
  /** The steps the start is chosen in, in degrees. */
  startStep: 5,
  /** How far off the start an object still counts towards it, in degrees. */
  startReach: 60,
  /** The viewer's lens across its height, at the start and its limits, in degrees (API Constants.Panoramas.MinFov / MaxFov). */
  startFov: 75,
  minFov: 35,
  maxFov: 90,
  /** The viewer's tilt at the start, and its limit, in degrees (a wide lens tilts less: `maxTilt`). */
  startPitch: -6,
  maxPitch: 80,
  /** Straight up (and down), in degrees of tilt: where every point of the 360° photo's seam meets. */
  straightUp: 90,
  /** A saved view's width over its height, which the viewer has too (API Constants.Panoramas.ViewWidth / ViewHeight). */
  viewAspect: 1024 / 768,
  /** How many degrees the view's edge keeps from the seam behind, where the 360° photo's ends meet. */
  seamMargin: 4,
  /** How many degrees an arrow key turns or tilts the view. */
  keyStep: 5,
  /** How many degrees of lens a wheel step changes, per pixel of scrolling. */
  wheelZoom: 0.03,
} as const

export const BUILDER = {
  wall: { min: 1, max: 30 },
  /** A room's outline: its most corners, and its shortest wall in centimetres (Domain Constants.Plans.MaxCorners, MinWallSegmentCentimetres). */
  maxCorners: 20,
  minWallCm: 20,
  /** How long a section of wall the "+" pushes out, in centimetres (less on a short wall). */
  sectionCm: 100,
  /** How thick the walls are drawn on the floor plan, in centimetres. */
  planWallCm: 14,
  /**
   * Measuring a generated photo against its plan (`features/builder/photo-accuracy.ts`): the smallest share of the
   * picture an outline must cover to count; the overlap of a clear one-to-one pair; the share of a plan object a photo
   * object must cover to take it in (several plan objects seen as one); the least overlap of any pair; the share of an
   * unmatched photo object that must lie on a plan object for it to be a decoration rather than an extra; and the words
   * that make a photo object the room's trim.
   */
  accuracy: {
    minShare: 0.001,
    clearOverlap: 0.3,
    coveredShare: 0.5,
    minOverlap: 0.1,
    decorationShare: 0.5,
    trimWords: ["skirting", "baseboard", "molding", "moulding", "cornice", "trim"],
  },
  ceiling: { min: 2, max: 6 },
  item: { min: 1, max: 3000 },
  maxItems: 60,
  /** How far a pasted object lands from the one copied, in centimetres (a window or door: a third of it past it). */
  pasteOffset: 30,
  labelLength: 60,
  /** The most decorations on one object, and the longest name of one (Domain Constants.Plans). */
  maxDecorations: 8,
  decorationLength: 60,
  descriptionLength: 300,
  /** How many objects a catalog list shows at first, and how many more each "Show more" adds. */
  catalogPage: 10,
  /** The longest extra instructions for the photo (Application Constants.Builder.MaxInstructionsLength). */
  instructionsLength: 500,
  gridCm: 10,
  /** The drag-and-drop type of an object dragged from the catalog onto the plan. */
  dragType: "application/x-designapp-object",
  rotationStep: 90,
  /** How deep an L-shaped object's runs are, as a share of its smaller side (Domain Constants.Plans.LegShare). */
  legShare: 0.5,
  /** How wide a P-shaped object's chaise is, as a multiple of its runs' depth, at most its width (Domain Constants.Plans.ChaiseShare). */
  chaiseShare: 1.7,
  /** How deep a P-shaped object's runs are, as a share of its smaller side (Domain Constants.Plans.PLegShare). */
  pLegShare: 0.4,
  /** The smallest part of an L- or P-shaped object (its run, leg or chaise), in cm (Domain Constants.Plans.MinPartCentimetres). */
  minPart: 20,
  autosaveMs: 800,
  /** How long a section takes to open or close (its height and fade), in ms; the Collapse classes' duration-200 matches it. */
  foldMs: 200,
  /** How long a failed save waits before it is tried again, in ms. */
  saveRetryMs: 4000,
  guide: { width: 1024, height: 768 },
  /** How long the 3D view waits after the room last changed before checking whether something blocks its view, in ms. */
  blockedCheckMs: 400,
  /** The width of each view's small picture on the Generate photo screen, in pixels. */
  viewPictureWidth: 240,
  /** How many photos are made at the same time when several views are picked. */
  photosAtOnce: 3,
  /** About what the 360° view costs with the real AI, in cents (a 4K photo: $0.036). */
  panoramaCents: 4,
  /** The largest seed of a Generate run (all its photos share one, picked at random): the API's int. */
  maxRunSeed: 2_147_483_647,
  /**
   * The word in a round object's name that makes it a stool in 3D: a round seat on legs, rather than the solid cylinder
   * of a side table or bin (the image model turned solid cylinders into tree-stump stools).
   */
  stoolWord: "stool",
  /**
   * Words in a hung object's name that change its 3D model: a picture with "mirror" gets a mirror's glass, one with
   * "tv" a screen; a wall box with "hood" gets a cooker hood's canopy and chimney.
   */
  mirrorWord: "mirror",
  screenWord: "tv",
  hoodWord: "hood",
  /** The most a hung object may stick out from its wall, in centimetres (Domain Constants.Plans.MaxMountedDepth). */
  maxMountedDepth: 70,
  /** A window's usual height above the floor, in centimetres (Domain Constants.Plans.WindowSill). */
  windowSill: 90,
  /**
   * The 3D view: its fixed colors; the camera's eye height in metres (a photographer's, a little under eye level, with
   * the camera held level so walls stay upright); and the narrowest and widest horizontal view, in degrees, chosen so
   * the far wall fits (an interior photographer's wide lens); and how much of the picture's height is moved below the
   * horizon, as a shift lens does (more floor, less ceiling, walls still upright). The camera's values must match
   * the API's Constants.Builder.Camera, whose photo prompt describes only what this camera sees.
   */
  scene: {
    background: "#FFFFFF", sky: "#FFFFFF", ground: "#9A8F80", pot: "#8C6A4A", glass: "#CFE3EE", metal: "#B9B9B9",
    linen: "#F2EFE8",
    /** The skirting boards along every wall's foot, in metres. */
    skirting: { height: 0.1, depth: 0.015 },
    /**
     * The room's architecture, in metres: the crown's and the rails' height and depth, the wainscoting's panels (their
     * frame's width, how far a panel sits in, and beadboard's board width), each casing's width (none for plain), the
     * beams' size and spacing, the coffers' size, the tray border's width and drop, and how much darker a recess's
     * inside and the space beyond an archway are than their color.
     */
    trim: {
      crown: { height: 0.09, depth: 0.06 },
      rail: { height: 0.045, depth: 0.02 },
      panel: { frame: 0.09, inset: 0.012, board: 0.09, depth: 0.012 },
      casing: { Plain: 0, Simple: 0.07, Wide: 0.12, Ornate: 0.16 } satisfies Record<Casing, number>,
      casingDepth: 0.02,
      beam: { width: 0.15, height: 0.2, every: 0.9 },
      coffer: { size: 1.2, rib: 0.12, depth: 0.1 },
      tray: { border: 0.5, drop: 0.15 },
      recessShade: 0.55,
      beyond: "#3B3632",
    },
    /**
     * Cabinets' fittings, in metres: about how wide a door is; a shaker frame's width and a fluted door's reed spacing;
     * a bar handle's length and a knob's radius (all handles stand out by `handleOut`); a sink's and a vessel basin's
     * size and how deep a farmhouse sink's apron is; and the glass of glass doors.
     */
    fittings: {
      door: 0.6,
      frame: 0.06,
      reed: 0.025,
      bar: 0.16,
      knob: 0.018,
      handleOut: 0.025,
      sink: { width: 0.6, depth: 0.42, apron: 0.22 },
      basin: { width: 0.45, depth: 0.35, vessel: 0.14 },
      glass: "#BFD3DC",
      bowl: "#F7F7F5",
    },
    /**
     * The 3D view's light at each time of day, so the photo's guide already has its mood: the sun's color and strength,
     * and the sky's and the room's soft light. Midday is the view as it always was.
     */
    moods: {
      Morning: { sun: "#EAF2FF", sunPower: 1.2, sky: 1.8, ambient: 0.5 },
      Midday: { sun: "#FFFFFF", sunPower: 1.3, sky: 1.9, ambient: 0.5 },
      GoldenHour: { sun: "#FFC48A", sunPower: 1.6, sky: 1.5, ambient: 0.45 },
      Evening: { sun: "#9DB4D6", sunPower: 0.15, sky: 0.45, ambient: 0.22 },
    } satisfies Record<TimeOfDay, { sun: string; sunPower: number; sky: number; ambient: number }>,
    /**
     * A painting's stand-in face: one plain mid tone, so the painting stands out from the wall without giving the image
     * model a picture to copy (it copied a patterned face almost exactly).
     */
    art: "#8E9296",
    /**
     * The ceiling light's stand-in, at the room's middle, in metres: a pendant's cord and shade, a chandelier's ring of
     * candle lights, a flush light's disc, spotlights set into the ceiling a spacing apart, or a rail of track lights.
     * `clear` is the room it needs around its middle, in cm.
     */
    /**
     * A window's curtains and blinds in 3D, in metres: curtains hang from a rod above the window (reaching past its
     * sides, but no closer than `rodGap` to a corner) to the sill or the floor, each side's panel a share of the window's width with folds; sheers are seen
     * through; blinds cover the window's top half, venetian and vertical ones in slats.
     */
    coverings: {
      rodAbove: 0.12, rodPast: 0.22, rodGap: 0.02, rodRadius: 0.012, out: 0.1, panelShare: 0.3, minPanel: 0.3, folds: 7, foldDepth: 0.03,
      belowSill: 0.1, sheer: "#F7F5F0", sheerOpacity: 0.55, blindShare: 0.5, slat: 0.05, verticalSlat: 0.09,
    },
    /**
     * A kitchen worktop in 3D, in metres: its slab and its overhang at the front, how high an upstand and a full backsplash
     * reach, the gap a backsplash keeps below a window's sill, how far behind a unit a window counts as over it, and how
     * near a wall a unit's back must be to have a backsplash.
     */
    worktop: { thickness: 0.04, overhang: 0.02, upstand: 0.1, splash: 0.6, belowSill: 0.02, behind: 0.25, against: 0.1 },
    /** How far the Ceiling tab tilts the 3D view up from the photo's, in degrees, so the ceiling and its light show. */
    ceilingTilt: 32,
    /**
     * Lights in 3D, in metres. A ceiling light's model is sized by the object: a pendant's shade is its width across and
     * at most `shadeShare` of its drop; a chandelier's ring a share of its width; a track's rail and heads, and a recessed
     * spotlight's disc, are fixed. A light that is on glows in the room's light color (`tones`) and lights the room: one
     * point light each, up to `cap` (more only glow), as strong as `ceiling`, `lamp` or `strip` (cabinets lit beneath)
     * and reaching as far; one with many spotlights or heads is stronger, at most `most` times. Off, its bulb or shade
     * glows just `off`.
     * `clear` keeps a light added in a room's middle that far (cm) inside its walls.
     */
    lights: {
      shade: "#F4F1EA", metal: "#3A3A3A", clear: 60,
      /** How far apart, in cm, the Ceiling tab puts a new light from the room's others (the nearest free spot to the middle). */
      apart: 60,
      pendant: { cord: 0.006, shadeShare: 0.45 },
      chandelier: { ringShare: 0.4, arms: 6, candle: 0.04 },
      spot: { radius: 0.045 },
      track: { rail: 0.03, can: 0.05 },
      tones: { Warm: "#FFD6A8", Neutral: "#FFF0DE", Cool: "#EDF3FF" },
      cap: 12,
      glow: 0.9, off: 0.12,
      ceiling: { intensity: 1.6, distance: 7, most: 2.5 },
      lamp: { intensity: 1.2, distance: 5 },
      strip: { intensity: 0.6, distance: 2 },
      /** How far above a piece of furniture its table lamp's glow sits, how big it is, and its light against a floor lamp's. */
      tableLamp: { above: 0.3, radius: 0.06, share: 0.45 },
    },
    /**
     * The sun: how far out it stands beyond the room (shares of the room's size) and how high, low in the morning and at
     * golden hour, high at midday; in the evening only a faint, cool light from outside.
     */
    sun: { out: 2.5, low: 0.9, high: 3.2, night: "#9DB4D6" },
    eyeHeight: 1.45, inset: 0.05, minFov: 80, maxFov: 100, fitDepthShare: 0.5, lensShift: 0.28,
    /**
     * A corner camera's fixed horizontal view and how far it is turned from looking straight at the wall in view, in
     * degrees (the API's Camera.CornerFov and CornerTurn): together they reach from the side wall it stands by to the
     * near wall.
     */
    cornerFov: 90, cornerTurn: 45,
    /** The least distance to the wall in view used to fit the lens or turn towards it, in cm (the API's Camera.MinFitDistance). */
    minFitDistance: 50,
    /**
     * The share of the picture one object may fill before the 3D view warns that it blocks the view (something standing
     * where the camera is, such as a cabinet in its corner); and how much smaller than the guide the check draws. In
     * twelve test rooms a blocked corner filled 55–67% and an open view at most 24%.
     */
    blockedShare: 0.4, blockedScale: 8,
  },
  start: { roomType: "LivingRoom" as RoomType, width: 4, length: 5, height: 2.6, wall: "#E8E2D6", floor: "#B89B7A", floorType: "Wood" as FloorType },
  wallColors: [
    "#FFFFFF", "#F4F1EA", "#EFE6CF", "#E8E2D6", "#E8DCC8", "#D8C3A5", "#E9CFC7", "#F2D46B",
    "#C8C8C8", "#A8B89A", "#7D8B6A", "#9DB4C0", "#4A6274", "#2E4057", "#B5543C", "#3A3A3A",
  ],
  /** Colors offered for each floor type: the usual ones for what it is made of (any other can be picked too). */
  floorColors: {
    Wood: [
      "#E8DCC8", "#D8C3A5", "#C9A27E", "#B89B7A", "#B8864B", "#8C6A4A", "#6B4A2E", "#4A3424",
      "#F4F1EA", "#D9C7A8", "#C8C8C8", "#A9A9A9", "#8A8580", "#5A5A5A", "#2F2C2A", "#A0522D",
    ],
    Parquet: [
      "#E8DCC8", "#D9B88F", "#C9A27E", "#B89B7A", "#B8864B", "#A0703F", "#8C6A4A", "#6B4A2E",
      "#4A3424", "#F4F1EA", "#D8C3A5", "#C8B8A0", "#8A8580", "#5A5A5A", "#2F2C2A", "#7A3E2A",
    ],
    Tiles: [
      "#FFFFFF", "#F4F1EA", "#E8E2D6", "#D8D2C6", "#C8C8C8", "#A9A9A9", "#8A8580", "#5A5A5A",
      "#2F2C2A", "#1E1E1E", "#C8704A", "#B5543C", "#9DB4C0", "#4A6274", "#A8B89A", "#2E4057",
    ],
    Stone: [
      "#F4F1EA", "#E8E2D6", "#D8CFC0", "#C9BBA5", "#B8A88E", "#A89A86", "#C8C8C8", "#9A9A9A",
      "#7A7A78", "#5A5A5A", "#3E3E3E", "#2A2A2A", "#8C7B6B", "#6B5B4B", "#A8B0B8", "#556270",
    ],
    Concrete: [
      "#E0DED8", "#D0CEC8", "#C0BEB8", "#B0AEA8", "#A09E98", "#8F8D88", "#7E7C78", "#6E6C68",
      "#5E5C58", "#4E4C48", "#3E3C38", "#2E2C2A", "#C8C0B0", "#B8B0A0", "#A8B0B0", "#98A0A0",
    ],
    Carpet: [
      "#F4F1EA", "#E8DCC8", "#D8C3A5", "#C8B8A0", "#A89A86", "#8A8580", "#5A5A5A", "#2F2C2A",
      "#9DB4C0", "#4A6274", "#2E4057", "#A8B89A", "#4F6B3A", "#B5543C", "#7A2E3A", "#C9A27E",
    ],
    Vinyl: [
      "#E8DCC8", "#D8C3A5", "#C9A27E", "#B89B7A", "#B8864B", "#8C6A4A", "#6B4A2E", "#4A3424",
      "#F4F1EA", "#D8D2C6", "#C8C8C8", "#A9A9A9", "#8A8580", "#5A5A5A", "#2F2C2A", "#9DB4C0",
    ],
  },
  /** How high wainscoting and the dado rail reach, and how far below the ceiling a picture rail runs, in cm (Domain Constants.Plans). */
  wainscotHeight: 90,
  pictureRailDrop: 30,
  /** Colors offered for exposed beams: woods, from pale to dark, then painted. */
  beamColors: [
    "#D8C3A5", "#C9A27E", "#B8864B", "#8B6A4A", "#6B4A2E", "#4A3424", "#2F2C2A", "#F4F1EA",
  ],
  /** Colors offered for the ceiling. */
  ceilingColors: [
    "#FFFFFF", "#FAFAF7", "#F4F1EA", "#EFE6CF", "#E8DCC8", "#E8E2D6", "#D8C3A5", "#C8C8C8",
    "#A8B89A", "#9DB4C0", "#4A6274", "#2E4057", "#8A8580", "#5A5A5A", "#3A3A3A", "#1E1E1E",
  ],
  /**
   * Lights (Domain Constants.Plans): what names something that gives light (a wall sconce, a table lamp, under-cabinet
   * lights), and how far apart spotlights in a row or grid and a track's spot heads are, in cm.
   */
  lightWords: /\b(lamps?|lights?|sconces?|chandeliers?|lanterns?)\b/i,
  /** What names fitted cabinetry (not a mirror cabinet), a kitchen sink unit and a vanity in an object's name (Domain Constants.Plans). */
  cabinetWords: /^(?!.*\bmirror).*\b(cabinets?|units?|vanity|vanities|island|dishwasher|oven tower|drawers)\b/i,
  sinkWords: /\bsink\b/i,
  vanityWords: /\b(vanity|vanities)\b/i,
  spotSpacing: 120,
  trackHeadSpacing: 50,
  /** A ceiling light's mark on the plan, in cm: its bulbs' and spots' size, and its colors (a warm yellow). */
  lightMark: { bulb: 7, spot: 5, dot: 1.6, fill: "#FFE6A3", stroke: "#B7791F" },
  /** How many steps the room builder can undo. */
  /** How many built rooms My designs lists before Show all. */
  plansShown: 8,
  undoSteps: 100,
  /**
   * Changes closer together than this, in ms, are one step to undo: a drag, or typing a name, comes back whole. A pause
   * starts the next step.
   */
  undoMergeMs: 500,
  /** The one choice the "None" chip of a material stands for. */
  none: "none",
  /** The choice the "All" chip of the walls' finish stands for: a change for every wall. */
  allWalls: "all",
  /** Colors offered for windows and doors: frames and door leaves. */
  frameColors: [
    "#FFFFFF", "#F4F1EA", "#E8DCC8", "#C8C8C8", "#8A8580", "#3A3A3A", "#1E1E1E", "#B8864B",
    "#8C6A4A", "#6B4A2E", "#A8B89A", "#4F6B3A", "#9DB4C0", "#4A6274", "#2E4057", "#8C3B2E",
  ],
} as const

/** The user's theme choice; system follows the OS setting. */
export const THEME = { light: "light", dark: "dark", system: "system" } as const

export type Theme = (typeof THEME)[keyof typeof THEME]

/**
 * Whether a stored value is one of an enum's values.
 * @param values - The enum object, such as AI_MODE.
 * @param value - The value to check.
 */
export function isEnumValue<T extends Record<string, string>>(values: T, value: unknown): value is T[keyof T] {
  return typeof value === "string" && (Object.values(values) as string[]).includes(value)
}

/** Paint-like colors offered for every object: warm neutrals, earthy tones and a few deep accents. */
export const SWATCHES = [
  "#F4F1EA", "#E8DCC8", "#D8C3A5", "#C9A27E", "#B5543C", "#8C3B2E",
  "#D9C27A", "#A8B89A", "#7D8B6A", "#4F6B3A", "#9DB4C0", "#4A6274",
  "#2E4057", "#6E5A7E", "#8A8580", "#2F2C2A",
] as const

/** Strength a newly recolored object starts with. */
export const DEFAULT_STRENGTH = 0.8

/**
 * Splitting an object by color into tones (bricks and mortar), each recolored on its own (Domain Constants.Tones).
 * The tones come from k-means in OKLab over up to `sample` of the object's pixels; tones closer than `mergeDistance`
 * are one. On the photo a pixel belongs to the tones by its distance to their centers, blended over `softness`.
 */
export const TONES = { min: 2, max: 4, sample: 60000, iterations: 12, mergeDistance: 0.04, softness: 0.05 } as const

/**
 * Paint amounts. Litres = area × coats × (1 + spare) ÷ coverage; tins are the common sizes. A wall's height starts
 * at a usual ceiling height. Sizes mirror the API's Domain Constants.Surfaces.
 */
export const PAINT = {
  coats: 2,
  maxCoats: 4,
  /** Square metres one litre covers, for one coat. */
  coverage: 10,
  minCoverage: 4,
  maxCoverage: 20,
  /** Extra paint for touch-ups and losses. */
  spare: 0.1,
  /** Tin sizes in litres, all multiples of half a litre. */
  tins: [1, 2.5, 5, 10],
  wallHeight: 2.5,
  minMetres: 0.1,
  maxMetres: 50,
  /** Separates a paint reference's palette from the paint (mirrors Domain Constants.Colors.PaintSeparator). */
  separator: "/",
} as const

/** The names of the RAL Classic families, by the first digit of the code. */
export const RAL_FAMILIES: Record<string, string> = {
  "1": "Yellows and beiges",
  "2": "Oranges",
  "3": "Reds",
  "4": "Violets",
  "5": "Blues",
  "6": "Greens",
  "7": "Greys",
  "8": "Browns",
  "9": "Whites and blacks",
}

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
  photoChanged: "The changed photo is ready.",
  photosFailed: (count: number, why: string) => `${count === 1 ? "One photo" : `${count} photos`} couldn't be made: ${why}`,
  savedToPlanDesign: "Saved to the room's design.",
  /** A view of a room's 360° photo saved as one of its photos. */
  panoramaViewSaved: "Saved as one of the room's photos.",
  /** A room's 360° photo that can't be shown. */
  panoramaLoadFailed: "Couldn't show the 360° photo. Reload the page to try again.",
  photoPlanLeftOut: (names: string[]) => `Left out, as they didn't fit the room: ${names.join(", ")}. Add them from the left if you want them.`,
  replaceAnalysis: "Analyze this photo instead? The outlines and colors made for the other photo are replaced.",
  colorsSaved: "Colors saved",
  tonesFailed: "Couldn't read this object's colors. Try again.",
  oneMainColor: (label: string) => `The ${label} has one main color, so there is nothing to split.`,
  planLoadFailed: "Couldn't open this room. It may have been deleted.",
  planSaveFailed: "Couldn't save the room. It is tried again every few seconds; leave the page open until it says Saved.",
  planGone: "This room was deleted, in another tab or on another device, so changes to it can't be saved.",
  catalogLoadFailed: "Couldn't load the common objects. Reload the page.",
  /** A builder list the search leaves empty. */
  searchNoMatch: (noun: string, query: string) => `No ${noun} match “${query}”.`,
  /** A builder list that is empty with nothing searched. */
  listNoMatch: "None here; try Other below.",
  guideFailed: "Couldn't draw the 3D view of the room.",
  objectDescribed: (label: string) => `Added the ${label}. Drag it where it belongs.`,
  wallItemAdded: (label: string, wall: string) => `Added the ${label} to the ${wall.toLowerCase()}. Drag it into place.`,
  partsFound: (count: number, label: string) => `Found ${count === 1 ? "1 part" : `${count} parts`} of the ${label}.`,
  partMerged: (label: string, parent: string) => `Merged the ${label} into the ${parent}. Undo brings it back.`,
  objectRemoved: (label: string, more: number) =>
    `Removed the ${label}${more === 0 ? "" : more === 1 ? " and 1 more object" : ` and ${more} more objects`}. Undo brings it back.`,
  designUpdated: "Design updated",
  designDeleted: "Design deleted",
  roomRemoved: "Room removed",
  designOpenFailed: "We couldn't open that design. It may have been deleted.",
  lastRoom: "A design needs at least one room. Delete the design instead.",
  removeRoomTitle: (label: string) => `Remove ${label.toLowerCase()}?`,
  removeRoomText: "The room, its photo and its colors are deleted. The rest of the design stays.",
  deleteDesignTitle: (name: string) => `Delete “${name}”?`,
  deleteDesignText: (rooms: string) => `Its ${rooms}, their photos and colors are deleted for good.`,
  deletePlanText: (photos: number) =>
    photos === 0
      ? "Its plan, walls and furniture are deleted for good."
      : `Its plan, walls and furniture are deleted for good. Its ${photos === 1 ? "photo stays" : `${photos} photos stay`} in your designs, without the 3D view.`,
  planDeleted: "Room deleted",
  plansLoadFailed: "We couldn't load the rooms you're building",
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
  libraryLoadFailed: "We couldn't load the sample houses",
  libraryHouseSaved: (name: string) => `${name} saved to your designs`,
  librarySignIn: "Sign in to save the whole house",
  palettesLoadFailed: "The paint colors couldn't be loaded.",
  paintListCopied: "Paint list copied",
  paintListCopyFailed: "The list couldn't be copied. Select the text and copy it instead.",
  paintApproximate: "Screen colors are approximate. Check a physical sample before you buy.",
} as const
