import { useEffect } from "react"

import { useBuilderStore } from "./builder-store"

/**
 * Keyboard shortcuts for the room builder: Ctrl/Cmd+C copies the selected object, Ctrl/Cmd+V pastes a copy, Ctrl/Cmd+D
 * duplicates it, Delete or Backspace removes it and Escape deselects. The letters are the keys where C, V and D are on
 * an English keyboard, whatever the layout (with a Cyrillic one the C key types "с"). Ignored while typing in a field,
 * while a dialog is open (Delete there removed the object selected behind it), while a photo is being made, and Ctrl+C
 * while text on the page is selected (so it still copies that text).
 * @param paused - Whether the shortcuts are off (while a photo is being made).
 */
export function useBuilderShortcuts(paused: boolean) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null

      if (paused || target?.closest?.("input, textarea, select, [contenteditable=true]") || document.querySelector("[role=dialog]")) {
        return
      }

      const { selected, copy, paste, remove, select } = useBuilderStore.getState()
      const mod = event.ctrlKey || event.metaKey
      // A letter key by where it is ("KeyC"), not what it types; other keys by name.
      const key = event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : event.key.toLowerCase()
      // Only text the user can see selected counts (a drag across the plan leaves an empty selection behind).
      const textSelected = (window.getSelection()?.toString().trim().length ?? 0) > 0

      if (mod && key === "c" && selected >= 0 && !textSelected) {
        copy()
      } else if (mod && key === "v") {
        paste()
      } else if (mod && key === "d" && selected >= 0) {
        copy()
        paste()
      } else if ((key === "delete" || key === "backspace") && selected >= 0) {
        remove(selected)
      } else if (key === "escape" && selected >= 0) {
        select(-1)
      } else {
        return
      }

      event.preventDefault()
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [paused])
}
