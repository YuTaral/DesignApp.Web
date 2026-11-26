import { Redo2Icon, Undo2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useBuilderStore } from "./builder-store"

/**
 * Undo and Redo for the room builder (also Ctrl+Z and Ctrl+Y), each greyed out when there is nothing to undo or redo. A
 * drag or a typed name is one step.
 */
export function UndoButtons() {
  const { undo, redo } = useBuilderStore()
  const canUndo = useBuilderStore((state) => state.past.length > 0)
  const canRedo = useBuilderStore((state) => state.future.length > 0)

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} data-builder-undo>
        <Undo2Icon />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo} data-builder-redo>
        <Redo2Icon />
      </Button>
    </div>
  )
}
