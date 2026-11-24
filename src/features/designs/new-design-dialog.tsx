import { useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DesignFields } from "./design-fields"

/**
 * Asks for a new design's name and description, for a room about to be built (the design is made with the room's
 * first photo, as a design always holds a room).
 * @param props.open - Whether it is shown.
 * @param props.onOpenChange - Shows or hides it.
 * @param props.initial - The name and description to start from (when changing one typed before).
 * @param props.onSave - Takes the name and description.
 */
export function NewDesignDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: { name: string; description: string }
  onSave: (design: { name: string; description: string }) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-new-design-dialog>
        {open && <NewDesignForm initial={initial} onSave={onSave} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The fields and buttons of {@link NewDesignDialog}.
 * @param props.initial - The name and description to start from.
 * @param props.onSave - Takes the name and description.
 * @param props.onCancel - Closes the dialog.
 */
function NewDesignForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { name: string; description: string }
  onSave: (design: { name: string; description: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const id = useId()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave({ name: name.trim(), description: description.trim() })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New design</DialogTitle>
        <DialogDescription>The room you build goes into it. It is saved with the room's first photo.</DialogDescription>
      </DialogHeader>
      <DesignFields
        id={id}
        name={name}
        description={description}
        onName={setName}
        onDescription={setDescription}
        rows={3}
        placeholders={{ name: "Sea view flat", description: "Blues and sand for the whole flat" }}
        counted
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={name.trim().length === 0} data-new-design-save>
          Use this design
        </Button>
      </DialogFooter>
    </form>
  )
}
