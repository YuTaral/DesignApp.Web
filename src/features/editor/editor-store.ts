import { create } from "zustand"

import type { StrokePoint } from "./brush"
import { DEFAULT_STRENGTH, LIMITS, OUTLINE_BRUSH_MODE, STROKE_SHAPE, type OutlineBrushMode, type StrokeShape } from "@/lib/constants"

/** One tone of an object split by color (the bricks or the mortar of a wall), recolored on its own. */
export type ToneEdit = {
  /** The tone's original color, "#RRGGBB"; the object's pixels nearest it belong to it. */
  center: string
  /** How much of the object it covers, 0..1. */
  share: number
  /** Its new color, "#RRGGBB"; missing to keep it as in the photo. */
  color?: string
  /** How strongly the new color replaces the original, 0..1. */
  strength: number
  /** The real paint the color is; missing for a color picked freely or none. */
  paint?: string
}

/** One object's recolor. */
export type ObjectEdit = {
  /** The new color, "#RRGGBB". For an object split by color, its first recolored tone's (for summaries). */
  color: string
  /** How strongly it replaces the original, 0..1. */
  strength: number
  /** The real paint the color is, such as "ral-classic/9010"; missing for a color picked freely. */
  paint?: string
  /** The tones of an object split by color (2 to 4); missing for one color. */
  tones?: readonly ToneEdit[]
}

/** All recolors of a room, by object index. */
export type Edits = Readonly<Record<number, ObjectEdit>>

/** The size of a wall, floor or ceiling, in metres: a wall's width × height, a floor's width × length. */
export type SurfaceSize = { width: number; height: number }

/** The sizes the user gave a room's surfaces, by object index. */
export type SurfaceSizes = Readonly<Record<number, SurfaceSize>>

/** One stroke of an object being marked by hand: Paint marks, Erase unmarks. */
export type MarkStroke = {
  mode: OutlineBrushMode
  /** Brush along the path, or a box's or lasso's area. */
  shape: StrokeShape
  /** The brush radius, in label map pixels. */
  radius: number
  /** The path (a box's two corners, or a lasso), each point 0..1 of the photo's width and height. */
  points: StrokePoint[]
}

/** One undo step: the recolors and which label map version (outlines) was shown. */
type Snapshot = {
  edits: Edits
  /** The label map version; null until the room's is known. */
  revision: number | null
}

type EditorState = {
  /** The room these edits belong to; switching rooms starts fresh. */
  roomId: string | null
  /** The recolors shown now. Equal to history[position].edits, except while a slider is being dragged. */
  edits: Edits
  /** The label map version shown now; null until the room is ready. */
  revision: number | null
  /** Every committed state, oldest first; undo and redo move through it. */
  history: Snapshot[]
  /** Which history entry is current. */
  position: number
  /** The selected object, or 0. */
  selected: number
  /** For a selected object split by color, the tone its color controls change; null for the whole object. */
  selectedTone: number | null
  /** The tone highlighted on the photo (its chip is hovered or focused), or null. */
  highlightedTone: { index: number; tone: number } | null
  /** The object under the pointer, or 0. */
  hovered: number
  /** Whether the before/after split is shown. */
  comparing: boolean
  /** The active outline brush: dragging on the photo then paints or erases the selected object instead of panning. */
  outlineTool: OutlineBrushMode | null
  /** The brush diameter on screen, in CSS px. */
  brushSize: number
  /** What a drag covers, for fixing outlines and marking alike: the round brush, a box, or a lasso's inside. */
  brushShape: StrokeShape
  /** Whether the user is marking a new object by hand (strokes then build its mask instead of being saved). */
  marking: boolean
  /** The marking brush: Paint marks pixels, Erase unmarks them. */
  markTool: OutlineBrushMode
  /** The strokes of the object being marked, in order. */
  markStrokes: MarkStroke[]
  /** How many pixels the object being marked has. */
  markPixels: number
  /**
   * The objects that have pixels in a loaded label map version (an undone new object has none), and what each rests
   * on there (a vase on a table), or null until one is loaded. Only meaningful while `revision` is that version.
   */
  presentObjects: { revision: number; indexes: ReadonlySet<number>; restsOn: ReadonlyMap<number, number> } | null
  /**
   * The objects being removed from the photo, while the AI works (empty otherwise): the photo shows it, and undo,
   * redo and the brushes wait, so the version the removal builds on stays the one shown.
   */
  removing: readonly string[]
  /** The saved design being edited, or null for recolors not saved yet. */
  designId: string | null
  /** The recolors as last saved or opened, to tell whether there are unsaved changes; null before the first save. */
  savedEdits: Edits | null
  /** The sizes of the room's surfaces, for paint amounts. Saved with the colors, but not part of undo. */
  sizes: SurfaceSizes
  /** The sizes as last saved or opened; null before the first save. */
  savedSizes: SurfaceSizes | null
  /** The object whose Parts dialog is open, or null (the editor's photo pauses drawing while it is). */
  partsObject: number | null

  /** Starts editing a room, keeping its edits if it's the room already open. */
  open: (roomId: string) => void
  /**
   * Opens a saved design: its recolors become the starting point (one history entry). Does
   * nothing when that design is already open, so its unsaved changes stay.
   */
  loadDesign: (roomId: string, designId: string, edits: Edits, sizes: SurfaceSizes) => void
  /** Records that the recolors and sizes shown were saved as a design. */
  markSaved: (designId: string, edits: Edits, sizes: SurfaceSizes) => void
  /** Sets the label map version the room had when the editor opened (only the first time). */
  setBaseRevision: (revision: number) => void
  /** Selects an object (0 to deselect, which also ends the outline tool). */
  select: (index: number) => void
  /** Records the object under the pointer (0 for none). */
  hover: (index: number) => void
  /**
   * Recolors an object, as one undo step. Keeps its strength, or starts at the default. A color without a paint
   * (a quick swatch or any color) drops the paint the object had.
   */
  setColor: (index: number, color: string, paint?: string) => void
  /** Sets a surface's size, or clears it with null. */
  setSize: (index: number, size: SurfaceSize | null) => void
  /** Changes an object's strength live (while dragging); `commitStrength` makes it one undo step. */
  previewStrength: (index: number, strength: number) => void
  /** Ends a strength drag as one undo step. */
  commitStrength: () => void
  /** Removes an object's recolor, as one undo step. */
  resetObject: (index: number) => void
  /** Removes all recolors, as one undo step. */
  resetAll: () => void
  /**
   * Splits an object by color into tones, as one undo step. A color the object had stays on every tone, so it looks
   * the same until a tone is recolored. Selects the first tone.
   */
  splitObject: (index: number, tones: readonly { center: string; share: number }[]) => void
  /** Makes a split object one color again (its first recolored tone's, if any), as one undo step. */
  joinObject: (index: number) => void
  /** Picks the tone the color controls change (null for the whole object). */
  selectTone: (tone: number | null) => void
  /** Highlights a tone on the photo, or none. */
  highlightTone: (tone: { index: number; tone: number } | null) => void
  /** Turns an outline brush on, or off with null. */
  setOutlineTool: (tool: OutlineBrushMode | null) => void
  /** Sets the brush diameter (clamped to LIMITS.brushSizes). */
  setBrushSize: (size: number) => void
  /** Picks the brush, the box or the lasso. */
  setBrushShape: (shape: StrokeShape) => void
  /** Shows a fixed label map version, as one undo step, and optionally selects an object (a new one). */
  applyOutlineFix: (revision: number, selectIndex?: number) => void
  /** Starts marking a new object: deselects, and turns the outline brush and the before/after split off. */
  startMarking: () => void
  /** Ends marking, dropping the strokes. */
  stopMarking: () => void
  /** Picks the marking brush. */
  setMarkTool: (tool: OutlineBrushMode) => void
  /** Records a finished marking stroke and the mask's new pixel count. */
  addMarkStroke: (stroke: MarkStroke, pixels: number) => void
  /** Records the objects being removed by name (empty when the removal is over). */
  setRemoving: (labels: readonly string[]) => void
  /** Records which objects have pixels in a loaded label map version, and what each rests on. */
  setPresentObjects: (revision: number, indexes: ReadonlySet<number>, restsOn: ReadonlyMap<number, number>) => void
  /** Opens the Parts dialog of an object (the object or one of its parts stays selected), or closes it with null. */
  openParts: (index: number | null) => void
  /** Goes one step back. */
  undo: () => void
  /** Goes one step forward again. */
  redo: () => void
  /** Turns the before/after split on or off. */
  toggleCompare: () => void
}

/** The fresh state for a room. */
const initial = (roomId: string | null) => {
  // One object for both, so flush() sees nothing pending before the first change.
  const edits: Edits = {}
  return {
    roomId,
    edits,
    revision: null,
    history: [{ edits, revision: null }],
    position: 0,
    selected: 0,
    selectedTone: null,
    highlightedTone: null,
    hovered: 0,
    comparing: false,
    outlineTool: null,
    marking: false,
    markTool: OUTLINE_BRUSH_MODE.Paint,
    markStrokes: [],
    markPixels: 0,
    presentObjects: null,
    removing: [],
    designId: null,
    savedEdits: null,
    sizes: {},
    savedSizes: null,
    partsObject: null,
  }
}

/**
 * The editor's state for the open room. Recolors live in memory until they're saved as a design
 * (a reload of an unsaved room starts over); outline fixes are stored by the API, and undo
 * switches versions.
 */
export const useEditorStore = create<EditorState>((set, get) => {
  /**
   * Makes a snapshot the newest history entry, dropping anything that was undone.
   * @param snapshot - The new state.
   */
  const commit = (snapshot: Snapshot) => {
    const { history, position } = get()
    set({ ...snapshot, history: [...history.slice(0, position + 1), snapshot], position: position + 1 })
  }

  /**
   * Commits new recolors with the current outlines.
   * @param edits - The new recolors.
   */
  const commitEdits = (edits: Edits) => commit({ edits, revision: get().revision })

  /** Records a change that was shown but never committed (a slider move that ended without a commit). */
  const flush = () => {
    const { edits, history, position } = get()
    if (edits !== history[position].edits) commitEdits(edits)
  }

  /**
   * The tone of an object the color controls change now, or null when they change the whole object.
   * @param index - The object.
   */
  const toneFor = (index: number) => {
    const { edits, selected, selectedTone } = get()
    const tones = edits[index]?.tones
    return tones && selected === index && selectedTone !== null && selectedTone < tones.length ? selectedTone : null
  }

  /**
   * Shows a history entry.
   * @param position - Its index.
   */
  const go = (position: number) => {
    const snapshot = get().history[position]
    set({ edits: snapshot.edits, revision: snapshot.revision, position })
  }

  /** After undo or redo, points the tone controls at a tone the selected object has (or the whole object). */
  const keepToneInRange = () => {
    const { edits, selected, selectedTone } = get()
    const tones = edits[selected]?.tones
    const tone = tones ? Math.min(selectedTone ?? 0, tones.length - 1) : null
    if (tone !== selectedTone) set({ selectedTone: tone })
  }

  return {
    ...initial(null),
    brushSize: LIMITS.brushSizes.default,
    brushShape: STROKE_SHAPE.Brush,

    open: (roomId) => {
      if (get().roomId !== roomId) set(initial(roomId))
    },
    loadDesign: (roomId, designId, edits, sizes) => {
      const state = get()
      if (state.roomId === roomId && state.designId === designId) return
      // The outlines shown don't depend on the design; keep them when the room stays the same.
      const revision = state.roomId === roomId ? state.revision : null
      set({ ...initial(roomId), edits, revision, history: [{ edits, revision }], designId, savedEdits: edits, sizes, savedSizes: sizes })
    },
    markSaved: (designId, edits, sizes) => set({ designId, savedEdits: edits, savedSizes: sizes }),
    setBaseRevision: (revision) => {
      const state = get()
      if (state.revision !== null) return
      set({ revision, history: state.history.map((s) => (s.revision === null ? { ...s, revision } : s)) })
    },
    select: (index) => {
      if (get().marking) return
      const selectedTone = get().edits[index]?.tones ? 0 : null
      set(index === 0 ? { selected: 0, selectedTone: null, outlineTool: null } : { selected: index, selectedTone })
    },
    hover: (index) => {
      if (get().hovered !== index) set({ hovered: index })
    },
    setColor: (index, color, paint) => {
      // A strength still being changed becomes its own step first, so undo can come back to it.
      flush()
      const { edits } = get()
      const tone = toneFor(index)
      const edit = edits[index]
      if (tone !== null && edit?.tones) {
        const tones = edit.tones.map((t, i) => (i === tone ? { center: t.center, share: t.share, color, strength: t.color ? t.strength : DEFAULT_STRENGTH, paint } : t))
        commitEdits({ ...edits, [index]: summarize(tones) })
        return
      }
      const strength = edit?.strength ?? DEFAULT_STRENGTH
      commitEdits({ ...edits, [index]: paint ? { color, strength, paint } : { color, strength } })
    },
    setSize: (index, size) => {
      const rest = { ...get().sizes }
      delete rest[index]
      set({ sizes: size ? { ...rest, [index]: size } : rest })
    },
    previewStrength: (index, strength) => {
      const { edits } = get()
      const edit = edits[index]
      const tone = toneFor(index)
      if (edit?.tones && tone !== null) {
        if (edit.tones[tone].color) set({ edits: { ...edits, [index]: summarize(edit.tones.map((t, i) => (i === tone ? { ...t, strength } : t))) } })
      } else if (edit) {
        set({ edits: { ...edits, [index]: { ...edit, strength } } })
      }
    },
    commitStrength: flush,
    resetObject: (index) => {
      flush()
      const { edits } = get()
      const edit = edits[index]
      if (!edit) return
      const tone = toneFor(index)
      // A tone resets alone; the object stays split.
      if (edit.tones && tone !== null) {
        if (!edit.tones[tone].color) return
        commitEdits({ ...edits, [index]: summarize(edit.tones.map((t, i) => (i === tone ? { center: t.center, share: t.share, strength: t.strength } : t))) })
        return
      }
      const rest = { ...edits }
      delete rest[index]
      commitEdits(rest)
    },
    splitObject: (index, found) => {
      flush()
      const { edits } = get()
      const edit = edits[index]
      const keep = edit && !edit.tones ? { color: edit.color, strength: edit.strength, paint: edit.paint } : {}
      const tones = found.map((t) => ({ center: t.center, share: t.share, strength: DEFAULT_STRENGTH, ...keep }))
      commitEdits({ ...edits, [index]: summarize(tones) })
      set({ selectedTone: 0 })
    },
    joinObject: (index) => {
      flush()
      const { edits } = get()
      const edit = edits[index]
      if (!edit?.tones) return
      const first = edit.tones.find((t) => t.color)
      const rest = { ...edits }
      delete rest[index]
      commitEdits(first?.color ? { ...rest, [index]: first.paint ? { color: first.color, strength: first.strength, paint: first.paint } : { color: first.color, strength: first.strength } } : rest)
      set({ selectedTone: null })
    },
    selectTone: (tone) => set({ selectedTone: tone }),
    highlightTone: (tone) => {
      const current = get().highlightedTone
      if (current?.index !== tone?.index || current?.tone !== tone?.tone) set({ highlightedTone: tone })
    },
    resetAll: () => {
      flush()
      if (Object.keys(get().edits).length > 0) commitEdits({})
    },
    setOutlineTool: (tool) => set({ outlineTool: get().selected ? tool : null, comparing: false }),
    setBrushSize: (size) => set({ brushSize: Math.round(Math.min(LIMITS.brushSizes.max, Math.max(LIMITS.brushSizes.min, size))) }),
    setBrushShape: (shape) => set({ brushShape: shape }),
    applyOutlineFix: (revision, selectIndex) => {
      flush()
      commit({ edits: get().edits, revision })
      if (selectIndex !== undefined) set({ selected: selectIndex })
    },
    startMarking: () => {
      flush()
      set({ marking: true, markTool: OUTLINE_BRUSH_MODE.Paint, markStrokes: [], markPixels: 0, selected: 0, outlineTool: null, comparing: false })
    },
    stopMarking: () => set({ marking: false, markStrokes: [], markPixels: 0 }),
    setMarkTool: (tool) => set({ markTool: tool }),
    addMarkStroke: (stroke, pixels) => set({ markStrokes: [...get().markStrokes, stroke], markPixels: pixels }),
    setPresentObjects: (revision, indexes, restsOn) => set({ presentObjects: { revision, indexes, restsOn } }),
    openParts: (index) => {
      if (index === null) {
        set({ partsObject: null, highlightedTone: null, outlineTool: null })
        return
      }
      // The object (or one of its parts) stays selected; a split one's color controls start on its first color.
      const { edits, selected } = get()
      set({ partsObject: index, outlineTool: null, comparing: false, selectedTone: edits[selected]?.tones ? 0 : null })
    },
    setRemoving: (labels) => set({ removing: labels, outlineTool: labels.length > 0 ? null : get().outlineTool }),
    undo: () => {
      if (get().marking || get().removing.length > 0) return
      flush()
      const { position } = get()
      if (position > 0) go(position - 1)
      keepToneInRange()
    },
    redo: () => {
      if (get().marking || get().removing.length > 0) return
      flush()
      const { history, position } = get()
      if (position < history.length - 1) go(position + 1)
      keepToneInRange()
    },
    toggleCompare: () => {
      if (!get().marking) set({ comparing: !get().comparing, outlineTool: null })
    },
  }
})

/**
 * A split object's recolor from its tones: its color, strength and paint repeat the first recolored tone (or the
 * first tone's own color at no strength when none is recolored yet), so summaries such as design cards can show it.
 * @param tones - The tones.
 */
export function summarize(tones: readonly ToneEdit[]): ObjectEdit {
  const first = tones.find((t) => t.color)
  if (!first?.color) return { color: tones[0].center, strength: 0, tones }
  return first.paint ? { color: first.color, strength: first.strength, paint: first.paint, tones } : { color: first.color, strength: first.strength, tones }
}

/**
 * Whether two sets of recolors are the same.
 * @param a - One set.
 * @param b - The other.
 */
export function sameEdits(a: Edits, b: Edits) {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => {
      const x = a[Number(key)]
      const y = b[Number(key)]
      return (
        y !== undefined && x.color.toUpperCase() === y.color.toUpperCase() && x.strength === y.strength && x.paint === y.paint &&
        (x.tones?.length ?? 0) === (y.tones?.length ?? 0) &&
        (x.tones ?? []).every((t, i) => {
          const u = y.tones![i]
          return t.center.toUpperCase() === u.center.toUpperCase() && t.share === u.share && t.strength === u.strength && t.paint === u.paint &&
            (t.color ?? "").toUpperCase() === (u.color ?? "").toUpperCase()
        })
      )
    })
  )
}

/**
 * Whether two sets of surface sizes are the same.
 * @param a - One set.
 * @param b - The other.
 */
export function sameSizes(a: SurfaceSizes, b: SurfaceSizes) {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => {
      const y = b[Number(key)]
      return y !== undefined && a[Number(key)].width === y.width && a[Number(key)].height === y.height
    })
  )
}
