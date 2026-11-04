import { create } from "zustand"

/** One object's recolor. */
export type ObjectEdit = {
  /** The new color, "#RRGGBB". */
  color: string
  /** How strongly it replaces the original, 0..1. */
  strength: number
}

/** All recolors of a room, by object index. */
export type Edits = Readonly<Record<number, ObjectEdit>>

/** Strength a newly recolored object starts with. */
export const DEFAULT_STRENGTH = 0.8

type EditorState = {
  /** The room these edits belong to; switching rooms starts fresh. */
  roomId: string | null
  /** The recolors shown now. Equal to history[position], except while a slider is being dragged. */
  edits: Edits
  /** Every committed state, oldest first; undo and redo move through it. */
  history: Edits[]
  /** Which history entry is current. */
  position: number
  /** The selected object, or 0. */
  selected: number
  /** The object under the pointer, or 0. */
  hovered: number
  /** Whether the before/after split is shown. */
  comparing: boolean

  /** Starts editing a room, keeping its edits if it's the room already open. */
  open: (roomId: string) => void
  /** Selects an object (0 to deselect). */
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
  history: [{}],
  position: 0,
  selected: 0,
  hovered: 0,
  comparing: false,
})

/**
 * The editor's state for the open room. Kept in memory: a reload starts over until saved
 * designs arrive (milestone 5).
 */
export const useEditorStore = create<EditorState>((set, get) => {
  /**
   * Makes `edits` the newest history entry, dropping anything that was undone.
   * @param edits - The new state.
   */
  const commit = (edits: Edits) => {
    const { history, position } = get()
    set({ edits, history: [...history.slice(0, position + 1), edits], position: position + 1 })
  }

  /** Records a change that was shown but never committed (a slider move that ended without a commit). */
  const flush = () => {
    const { edits, history, position } = get()
    if (edits !== history[position]) commit(edits)
  }

  return {
    ...initial(null),

    open: (roomId) => {
      if (get().roomId !== roomId) set(initial(roomId))
    },
    select: (index) => set({ selected: index }),
    hover: (index) => {
      if (get().hovered !== index) set({ hovered: index })
    },
    setColor: (index, color) => {
      const { edits } = get()
      commit({ ...edits, [index]: { color, strength: edits[index]?.strength ?? DEFAULT_STRENGTH } })
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
      commit(rest)
    },
    resetAll: () => {
      if (Object.keys(get().edits).length > 0) commit({})
    },
    undo: () => {
      flush()
      const { history, position } = get()
      if (position > 0) set({ edits: history[position - 1], position: position - 1 })
    },
    redo: () => {
      flush()
      const { history, position } = get()
      if (position < history.length - 1) set({ edits: history[position + 1], position: position + 1 })
    },
    toggleCompare: () => set({ comparing: !get().comparing }),
  }
})
