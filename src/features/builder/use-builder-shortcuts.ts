import { useEffect } from "react"

import { useBuilderStore } from "./builder-store"

/**
 * Keyboard shortcuts for the room builder: Ctrl/Cmd+C copies the selected object, Ctrl/Cmd+V pastes a copy, Ctrl/Cmd+D
 * duplicates it, Delete or Backspace removes it and Escape deselects. Ignored while typing in a field, while a photo is
 * being made, and Ctrl+C while text on the page is selected (so it still copies that text).
 * @param paused - Whether the shortcuts are off (while a photo is being made).
 */
export function useBuilderShortcuts(paused: boolean) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null

      if (paused || target?.closest("input, textarea, select, [contenteditable=true]")) {
        return
      }

      const { selected, copy, paste, remove, select } = useBuilderStore.getState()
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const textSelected = !(window.getSelection()?.isCollapsed ?? true)

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
