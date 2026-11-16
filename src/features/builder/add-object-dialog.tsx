import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BUILDER, ITEM_FORM, MESSAGES, SWATCHES } from "@/lib/constants"
import type { CatalogObject, CatalogVariant, Plan } from "./api"
import { cornerOutline, hasParts, inVariation, isMountedShape, isWallShape, useBuilderStore } from "./builder-store"
import { DecorationChoice } from "./decoration-choice"
import { wallLength, wallName } from "./room-outline"
import { ColorChoice, NumberField } from "./inspector"

/**
 * Asked when the user clicks an object in the catalog: which type of it (its variations, each drawn from above with
 * its size), its color, its size and its decorations (its five most popular, or the user's own), then "Add to room" puts it in the middle of the room (a window, door or hung thing in
 * the middle of the wall shown), selected.
 * @param props.plan - The room being built.
 * @param props.object - The catalog object; the dialog is closed while it is null.
 * @param props.wall - The wall shown in the Wall tab, where a window, door or hung thing goes (the wall the photo looks
 *   at when there is none).
 * @param props.onClose - Closes the dialog.
 */
export function AddObjectDialog({ plan, object, wall, onClose }: { plan: Plan; object: CatalogObject | null; wall: number | null; onClose: () => void }) {
  return (
    <Dialog open={object !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        data-add-object-dialog
        onOpenAutoFocus={(event) => {
          // Focus the chosen type rather than the first button, so only the choice looks picked.
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>("[role=radio][aria-checked=true]")?.focus()
        }}
      >
        {object && <Choices key={object.key} plan={plan} object={object} wall={wall ?? plan.view} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The dialog's choices for one catalog object; they start from its first type and its usual color.
 * @param props.plan - The room being built.
 * @param props.object - The catalog object.
 * @param props.wall - The wall a window, door or hung thing goes on.
 * @param props.onClose - Closes the dialog.
 */
function Choices({ plan, object, wall, onClose }: { plan: Plan; object: CatalogObject; wall: number; onClose: () => void }) {
  const add = useBuilderStore((state) => state.add)
  const variants = object.variants
  const [chosen, setChosen] = useState(0)
  const [color, setColor] = useState(object.color)
  const [decorations, setDecorations] = useState<string[]>([])
  const [size, setSize] = useState({ width: variants[0].width, depth: variants[0].depth, height: variants[0].height })
  const variant = variants[chosen]
  const onWall = isWallShape(object.shape)
  const hung = isMountedShape(object.shape)
  const name = variant.label.charAt(0).toUpperCase() + variant.label.slice(1)

  const choose = (index: number) => {
    setChosen(index)
    setSize({ width: variants[index].width, depth: variants[index].depth, height: variants[index].height })
  }

  const confirm = () => {
    add({ ...inVariation(object, variant), color, ...size }, onWall ? { wall, along: wallLength(plan, wall) / 2 } : undefined, decorations)
    if (onWall) toast.success(MESSAGES.wallItemAdded(variant.label, wallName(plan, wall)))
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add a {variant.label}</DialogTitle>
        <DialogDescription>Choose its type, color, size and decorations. You can change all of them later, and move it on the plan.</DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Type" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {variants.map((v, i) => (
          <button
            key={v.key}
            type="button"
            role="radio"
            aria-checked={i === chosen}
            data-object-type={v.key}
            onClick={() => choose(i)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border p-3 text-center outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              i === chosen && "border-primary bg-accent text-accent-foreground ring-1 ring-primary hover:bg-accent"
            )}
          >
            <ShapePreview variant={v} color={color} />
            <span className="text-sm font-medium">{v.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {v.width} × {isWallShape(v.shape) ? v.height : v.depth} cm
            </span>
          </button>
        ))}
      </div>

      <ColorChoice label="Color" value={color} colors={onWall && !hung ? BUILDER.frameColors : SWATCHES} onPick={setColor} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Size (cm)</legend>
        <div className={cn("grid gap-2", onWall && !hung ? "grid-cols-2" : "grid-cols-3")}>
          <NumberField label="Width" value={size.width} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(width) => setSize({ ...size, width })} />
          {(!onWall || hung) && (
            <NumberField
              label={hung ? "Sticks out" : "Depth"}
              value={size.depth}
              min={BUILDER.item.min}
              max={hung ? BUILDER.maxMountedDepth : BUILDER.item.max}
              onCommit={(depth) => setSize({ ...size, depth })}
            />
          )}
          <NumberField label="Height" value={size.height} min={BUILDER.item.min} max={BUILDER.item.max} onCommit={(height) => setSize({ ...size, height })} />
        </div>
        {hasParts(variant) && <p className="text-xs text-muted-foreground">Its parts (back run, corner leg{variant.form === ITEM_FORM.PShaped ? ", chaise" : ""}) can be resized one by one once it is in the room.</p>}
      </fieldset>

      <DecorationChoice suggestions={object.decorations ?? []} value={decorations} onChange={setDecorations} />

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={confirm} data-add-object>
          <PlusIcon data-icon="inline-start" />
          Add {name}
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * A type of object seen from above, to scale in a 64 px box: its L, P, ellipse or rectangle, in the chosen color.
 * Windows and doors are seen straight on instead (width × height).
 * @param props.variant - The type.
 * @param props.color - The chosen color.
 */
function ShapePreview({ variant, color }: { variant: CatalogVariant; color: string }) {
  const [w, d] = isWallShape(variant.shape) ? [variant.width, variant.height] : [variant.width, variant.depth]
  const box = Math.max(w, d) * 1.1
  const look = { fill: color, className: "stroke-black/40", strokeWidth: box / 60 }
  const corner = hasParts(variant)
    ? cornerOutline({ ...variant, label: variant.label, x: 0, y: 0, rotation: 0, color, wall: null, elevation: 0 }).map((p) => p.join(",")).join(" ")
    : null
  return (
    <svg viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} className="size-16" aria-hidden data-shape-preview={variant.form}>
      {corner ? (
        <polygon points={corner} strokeLinejoin="round" {...look} />
      ) : variant.form === ITEM_FORM.Round ? (
        <ellipse rx={w / 2} ry={d / 2} {...look} />
      ) : (
        <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={box / 40} {...look} />
      )}
    </svg>
  )
}
