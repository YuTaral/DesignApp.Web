import { create } from "zustand"

import { DEFAULT_STRENGTH, LIMITS, type OutlineBrushMode } from "@/lib/constants"

/** One object's recolor. */
export type ObjectEdit = {
  /** The new color, "#RRGGBB". */
  color: string
  /** How strongly it replaces the original, 0..1. */
  strength: number
}

/** All recolors of a room, by object index. */
export type Edits = Readonly<Record<number, ObjectEdit>>

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
  /** The object under the pointer, or 0. */
  hovered: number
  /** Whether the before/after split is shown. */
  comparing: boolean
  /** The active outline brush: dragging on the photo then paints or erases the selected object instead of panning. */
  outlineTool: OutlineBrushMode | null
  /** The brush diameter on screen, in CSS px. */
  brushSize: number
  /** The saved design being edited, or null for recolors not saved yet. */
  designId: string | null
  /** The recolors as last saved or opened, to tell whether there are unsaved changes; null before the first save. */
  savedEdits: Edits | null

  /** Starts editing a room, keeping its edits if it's the room already open. */
  open: (roomId: string) => void
  /**
   * Opens a saved design: its recolors become the starting point (one history entry). Does
   * nothing when that design is already open, so its unsaved changes stay.
   */
  loadDesign: (roomId: string, designId: string, edits: Edits) => void
  /** Records that the recolors shown were saved as a design. */
  markSaved: (designId: string, edits: Edits) => void
  /** Sets the label map version the room had when the editor opened (only the first time). */
  setBaseRevision: (revision: number) => void
  /** Selects an object (0 to deselect, which also ends the outline tool). */
  select: (index: number) => void
  /** Records the object under the pointer (0 for none). */
  hover: (index: number) => void
  /** Recolors an object, as one undo step. Keeps its strength, or starts at the default. */
  setColor: (index: number, color: string) => void
  /** Changes an object's strength live (while dragging); `commitStrength` makes it one undo step. */
  previewStrength: (index: number, strength: number) => void
  /** Ends a strength drag as one undo step. */
  commitStrength: () => void
  /** Removes an object's recolor, as one undo step. */
  resetObject: (index: number) => void
  /** Removes all recolors, as one undo step. */
  resetAll: () => void
  /** Turns an outline brush on, or off with null. */
  setOutlineTool: (tool: OutlineBrushMode | null) => void
  /** Sets the brush diameter (clamped to LIMITS.brushSizes). */
  setBrushSize: (size: number) => void
  /** Shows a fixed label map version, as one undo step. */
  applyOutlineFix: (revision: number) => void
  /** Goes one step back. */
  undo: () => void
  /** Goes one step forward again. */
  redo: () => void
  /** Turns the before/after split on or off. */
  toggleCompare: () => void
}

/** The fresh state for a room. */
const initial = (roomId: string | null) => ({
  roomId,
  edits: {},
  revision: null,
  history: [{ edits: {}, revision: null }],
  position: 0,
  selected: 0,
  hovered: 0,
  comparing: false,
  outlineTool: null,
  designId: null,
  savedEdits: null,
})

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
   * Shows a history entry.
   * @param position - Its index.
   */
  const go = (position: number) => {
    const snapshot = get().history[position]
    set({ edits: snapshot.edits, revision: snapshot.revision, position })
  }

  return {
    ...initial(null),
    brushSize: LIMITS.brushSizes.default,

    open: (roomId) => {
      if (get().roomId !== roomId) set(initial(roomId))
    },
    loadDesign: (roomId, designId, edits) => {
      const state = get()
      if (state.roomId === roomId && state.designId === designId) return
      // The outlines shown don't depend on the design; keep them when the room stays the same.
      const revision = state.roomId === roomId ? state.revision : null
      set({ ...initial(roomId), edits, revision, history: [{ edits, revision }], designId, savedEdits: edits })
    },
    markSaved: (designId, edits) => set({ designId, savedEdits: edits }),
    setBaseRevision: (revision) => {
      const state = get()
      if (state.revision !== null) return
      set({ revision, history: state.history.map((s) => (s.revision === null ? { ...s, revision } : s)) })
    },
    select: (index) => set(index === 0 ? { selected: 0, outlineTool: null } : { selected: index }),
    hover: (index) => {
      if (get().hovered !== index) set({ hovered: index })
    },
    setColor: (index, color) => {
      const { edits } = get()
      commitEdits({ ...edits, [index]: { color, strength: edits[index]?.strength ?? DEFAULT_STRENGTH } })
    },
    previewStrength: (index, strength) => {
      const { edits } = get()
      const edit = edits[index]
      if (edit) set({ edits: { ...edits, [index]: { ...edit, strength } } })
    },
    commitStrength: flush,
    resetObject: (index) => {
      const { edits } = get()
      if (!edits[index]) return
      const rest = { ...edits }
      delete rest[index]
      commitEdits(rest)
    },
    resetAll: () => {
      if (Object.keys(get().edits).length > 0) commitEdits({})
    },
    setOutlineTool: (tool) => set({ outlineTool: get().selected ? tool : null, comparing: false }),
    setBrushSize: (size) => set({ brushSize: Math.round(Math.min(LIMITS.brushSizes.max, Math.max(LIMITS.brushSizes.min, size))) }),
    applyOutlineFix: (revision) => {
      flush()
      commit({ edits: get().edits, revision })
    },
    undo: () => {
      flush()
      const { position } = get()
      if (position > 0) go(position - 1)
    },
    redo: () => {
      flush()
      const { history, position } = get()
      if (position < history.length - 1) go(position + 1)
    },
    toggleCompare: () => set({ comparing: !get().comparing, outlineTool: null }),
  }
})

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
      return y !== undefined && x.color.toUpperCase() === y.color.toUpperCase() && x.strength === y.strength
    })
  )
}
