import type { CatalogObject } from "./api"
import { isWallShape } from "./builder-store"
import { startCatalogDrag } from "./catalog-drag"

/**
 * Objects to click (which opens the dialog to choose their type, color and size) or drag onto the plan or a wall (their
 * usual type).
 * @param props.objects - The objects.
 * @param props.disabled - Whether an object can't be added now (the room is full, or it goes on a wall and none is open).
 * @param props.onChoose - Opens the dialog for an object.
 * @param props.note - A line under an object's name, such as the rooms it is usual in; none when missing.
 * @param props.draggable - Whether objects can be dragged onto the plan (not from inside a dialog, which covers it).
 */
export function ObjectList({
  objects,
  disabled,
  onChoose,
  note,
  draggable = true,
}: {
  objects: CatalogObject[]
  disabled: (object: CatalogObject) => boolean
  onChoose: (object: CatalogObject) => void
  note?: (object: CatalogObject) => string
  draggable?: boolean
}) {
  return (
    <ul className="grid grid-cols-1 gap-1">
      {objects.map((object) => (
        <li key={object.key}>
          <button
            type="button"
            draggable={draggable && !disabled(object)}
            disabled={disabled(object)}
            data-catalog={object.key}
            onDragStart={(event) => {
              startCatalogDrag(event, object)
              event.dataTransfer.effectAllowed = "copy"
            }}
            onClick={() => onChoose(object)}
            className="flex w-full cursor-grab items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:opacity-50"
          >
            <span className="size-5 shrink-0 rounded-md border border-foreground/20 shadow-soft" style={{ backgroundColor: object.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate first-letter:uppercase">{object.label}</span>
              {note && <span className="block text-xs text-muted-foreground">{note(object)}</span>}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {object.variants.length > 1 ? `${object.variants.length} types` : `${object.width}×${isWallShape(object.shape) ? object.height : object.depth}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
