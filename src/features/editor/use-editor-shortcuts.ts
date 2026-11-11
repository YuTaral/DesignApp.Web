import { useEffect } from "react"

import { useEditorStore } from "./editor-store"

/**
 * Keyboard shortcuts for the editor: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Escape
 * cancels marking a new object, ends the brush, or else deselects. Ignored while typing in a field.
 */
export function useEditorShortcuts() {
  const { undo, redo, select, outlineTool, setOutlineTool, marking, stopMarking } = useEditorStore()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable=true]")) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === "z" && !event.shiftKey) undo()
      else if (mod && ((key === "z" && event.shiftKey) || key === "y")) redo()
      else if (key === "escape") {
        if (marking) stopMarking()
        else if (outlineTool) setOutlineTool(null)
        else select(0)
      }
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo, select, outlineTool, setOutlineTool, marking, stopMarking])
}
