import { useEffect } from "react"

import { useEditorStore } from "./editor-store"

/**
 * Keyboard shortcuts for the editor: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Escape
 * deselects. Ignored while typing in a field.
 */
export function useEditorShortcuts() {
  const { undo, redo, select } = useEditorStore()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable=true]")) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === "z" && !event.shiftKey) undo()
      else if (mod && ((key === "z" && event.shiftKey) || key === "y")) redo()
      else if (key === "escape") select(0)
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo, select])
}
