import { useState } from "react"
import { CopyIcon, ListChecksIcon, PrinterIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useEditorStore, type Edits, type SurfaceSize, type SurfaceSizes } from "@/features/editor/editor-store"
import type { DetectedObject, Room } from "@/features/rooms/types"
import { MESSAGES, OBJECT_CATEGORY, PAINT } from "@/lib/constants"
import { paintsByRef, usePalettes, type Paint } from "./api"
import { closestPaint, formatNumber, formatTins, isPaintable, litresFor, tinsFor, type PaintSettings } from "./paint-math"

/** One color to paint on a surface: the whole surface, or one tone of a surface split by color (bricks, mortar). */
type Line = { color: string; paint: Paint | undefined; share: number; tone: number | null }

/** One recolored wall or ceiling of the list, with its area (once it has a size) and the colors on it. */
type Row = { object: DetectedObject; area: number | null; lines: Line[] }

/** One paint to buy for the room's surfaces, with the area it covers. */
type Total = { key: string; color: string; title: string; area: number }

/**
 * The inspector's Paint list button, shown while a wall or ceiling is selected: opens the list of paints for the
 * room's walls and ceilings, where the user enters their sizes. Off until a wall or ceiling is recolored.
 * @param props.room - The room being edited.
 */
export function PaintListButton({ room }: { room: Room }) {
  const { selected, edits, sizes, setSize } = useEditorStore()
  const [open, setOpen] = useState(false)
  const object = room.objects.find((o) => o.index === selected)
  if (!object || !isPaintable(object.category)) return null
  const count = room.objects.filter((o) => edits[o.index] && isPaintable(o.category)).length

  return (
    <div className="space-y-2">
      <Button variant="outline" className="w-full" disabled={count === 0} onClick={() => setOpen(true)}>
        <ListChecksIcon data-icon="inline-start" />
        Paint list
      </Button>
      {count === 0 && <p className="text-xs text-muted-foreground">Recolor a wall or ceiling to see what paint to buy.</p>}
      <PaintListDialog open={open} onOpenChange={setOpen} objects={room.objects} edits={edits} sizes={sizes} onSize={setSize} />
    </div>
  )
}

/**
 * The paint list in a dialog: one row per recolored wall or ceiling with its paint and size, and what to buy. Other
 * objects are left out: floors and furniture are not painted.
 * @param props.open - Whether it is shown.
 * @param props.onOpenChange - Shows or hides it.
 * @param props.objects - The room's objects.
 * @param props.edits - The room's recolors.
 * @param props.sizes - The sizes of its surfaces.
 * @param props.onSize - Changes a surface's size; without it the sizes are only shown (a saved design).
 */
export function PaintListDialog({
  open,
  onOpenChange,
  objects,
  edits,
  sizes,
  onSize,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  objects: readonly DetectedObject[]
  edits: Edits
  sizes: SurfaceSizes
  onSize?: (index: number, size: SurfaceSize | null) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {/* The dialog drops its content once closed, so the inputs start from the saved sizes on every open. */}
        <PaintList objects={objects} edits={edits} sizes={sizes} onSize={onSize} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * The list itself (see PaintListDialog).
 * @param props.objects - The room's objects.
 * @param props.edits - The room's recolors.
 * @param props.sizes - The sizes of its surfaces.
 * @param props.onSize - Changes a surface's size, or undefined to only show them.
 */
function PaintList({
  objects,
  edits,
  sizes,
  onSize,
}: {
  objects: readonly DetectedObject[]
  edits: Edits
  sizes: SurfaceSizes
  onSize?: (index: number, size: SurfaceSize | null) => void
}) {
  const palettes = usePalettes()
  const paints = paintsByRef(palettes.data)
  const allPaints = [...paints.values()]
  // As typed, so a number can be typed digit by digit; the amounts use them kept in range.
  const [coats, setCoats] = useState(String(PAINT.coats))
  const [coverage, setCoverage] = useState(String(PAINT.coverage))
  const settings: PaintSettings = {
    coats: Math.round(clamp(Number(coats), 1, PAINT.maxCoats, PAINT.coats)),
    coverage: clamp(Number(coverage), PAINT.minCoverage, PAINT.maxCoverage, PAINT.coverage),
  }

  const rows: Row[] = objects
    .filter((object) => edits[object.index] && isPaintable(object.category))
    .map((object) => {
      const edit = edits[object.index]
      const size = sizes[object.index]
      // A surface split by color needs a paint per recolored tone, for its share of the area.
      const lines: Line[] = edit.tones
        ? edit.tones.flatMap((t, i) => (t.color ? [{ color: t.color, paint: t.paint ? paints.get(t.paint) : undefined, share: t.share, tone: i }] : []))
        : [{ color: edit.color, paint: edit.paint ? paints.get(edit.paint) : undefined, share: 1, tone: null }]
      return { object, area: size ? size.width * size.height : null, lines }
    })
    .filter((row) => row.lines.length > 0)

  // The same paint (or the same free color) on several surfaces is bought once.
  const totals = new Map<string, Total>()
  for (const row of rows) {
    if (row.area === null) continue
    for (const line of row.lines) {
      const key = line.paint?.ref ?? line.color.toUpperCase()
      const total = totals.get(key) ?? { key, color: line.color, title: paintTitle(line), area: 0 }
      totals.set(key, { ...total, area: total.area + row.area * line.share })
    }
  }

  const text = listText(rows, [...totals.values()], settings)

  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(MESSAGES.paintListCopied),
      () => toast.error(MESSAGES.paintListCopyFailed),
    )
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <DialogHeader>
        <DialogTitle>Paint list</DialogTitle>
        <DialogDescription>
          {onSize ? "Enter the size of each wall and ceiling to see how much paint to buy." : "The paints of this room’s walls and ceilings and how much to buy."}
        </DialogDescription>
      </DialogHeader>

      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-label="Painted objects">
        {rows.map((row) => (
          <li key={row.object.index} data-paint-row={row.object.index} className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border p-3">
            <div className="flex items-center gap-3">
              <span className="size-8 shrink-0 rounded-lg border shadow-soft" style={{ backgroundColor: row.lines[0].color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium first-letter:uppercase">{row.object.label}</p>
                {row.lines[0].tone === null && (
                  <p className="truncate text-sm text-muted-foreground" data-paint-name>
                    {paintTitle(row.lines[0])}
                    {!row.lines[0].paint && allPaints.length > 0 && ` · closest ${closestPaint(row.lines[0].color, allPaints)?.code}`}
                  </p>
                )}
              </div>
              {row.area !== null && (
                <p className="shrink-0 text-right text-sm tabular-nums" data-area>
                  {formatNumber(row.area)} m²
                </p>
              )}
            </div>
            {row.lines[0].tone !== null && (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1 text-sm" aria-label={`Colors of the ${row.object.label}`}>
                {row.lines.map((line) => (
                  <li key={line.tone} className="flex items-center gap-2" data-tone-line={line.tone}>
                    <span className="size-4 shrink-0 rounded border" style={{ backgroundColor: line.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      Color {(line.tone ?? 0) + 1} · {paintTitle(line)}
                      {!line.paint && allPaints.length > 0 && <span className="text-muted-foreground"> · closest {closestPaint(line.color, allPaints)?.code}</span>}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {Math.round(line.share * 100)}%{row.area !== null && ` · ${formatNumber(row.area * line.share)} m²`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <SizeInputs object={row.object} size={sizes[row.object.index]} onSize={onSize} />
          </li>
        ))}
      </ul>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-label="What to buy">
        <div className="flex flex-wrap items-end gap-3">
          <h3 className="mr-auto font-medium">What to buy</h3>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Coats
            <Input
              type="number"
              className="h-8 w-20"
              min={1}
              max={PAINT.maxCoats}
              step={1}
              value={coats}
              onChange={(event) => setCoats(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            m² per litre
            <Input
              type="number"
              className="h-8 w-24"
              min={PAINT.minCoverage}
              max={PAINT.maxCoverage}
              step={1}
              value={coverage}
              onChange={(event) => setCoverage(event.target.value)}
            />
          </label>
        </div>
        {totals.size === 0 ? (
          <p className="text-sm text-muted-foreground">No sizes yet. Enter a width and height for a recolored wall or ceiling.</p>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {[...totals.values()].map((total) => {
              const litres = litresFor(total.area, settings)
              return (
                <li key={total.key} data-paint-total={total.key} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                  <span className="size-6 shrink-0 rounded-md border" style={{ backgroundColor: total.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{total.title}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span data-litres>{formatNumber(total.area)} m² · {formatNumber(litres)} L</span>
                    <br />
                    <span className="text-muted-foreground" data-tins>{formatTins(tinsFor(litres))}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {settings.coats} {settings.coats === 1 ? "coat" : "coats"}, {settings.coverage} m² per litre, {Math.round(PAINT.spare * 100)}% spare.{" "}
          {MESSAGES.paintApproximate}
        </p>
      </section>

      <DialogFooter>
        <Button variant="outline" onClick={() => printList(text)}>
          <PrinterIcon data-icon="inline-start" />
          Print
        </Button>
        <Button onClick={copy}>
          <CopyIcon data-icon="inline-start" />
          Copy list
        </Button>
      </DialogFooter>
    </div>
  )
}

/**
 * A wall's width and height, or a ceiling's width and length. A wall's height starts at the usual ceiling height. The size is
 * kept once both are valid, and dropped when one is cleared.
 * @param props.object - The wall or ceiling.
 * @param props.size - Its size, if it has one.
 * @param props.onSize - Changes it; without it the size is only shown.
 */
function SizeInputs({ object, size, onSize }: { object: DetectedObject; size: SurfaceSize | undefined; onSize?: (index: number, size: SurfaceSize | null) => void }) {
  const wall = object.category === OBJECT_CATEGORY.Wall
  const [width, setWidth] = useState(size ? String(size.width) : "")
  const [height, setHeight] = useState(size ? String(size.height) : wall ? String(PAINT.wallHeight) : "")
  const second = wall ? "Height" : "Length"

  if (!onSize) {
    return (
      <p className="text-xs text-muted-foreground">
        {size ? `${formatNumber(size.width)} × ${formatNumber(size.height)} m` : "No size given."}
      </p>
    )
  }

  const change = (nextWidth: string, nextHeight: string) => {
    setWidth(nextWidth)
    setHeight(nextHeight)
    const [w, h] = [Number(nextWidth), Number(nextHeight)]
    const valid = [w, h].every((side) => nextWidth !== "" && nextHeight !== "" && side >= PAINT.minMetres && side <= PAINT.maxMetres)
    onSize(object.index, valid ? { width: w, height: h } : null)
  }

  return (
    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground [&>label]:min-w-0">
      <label className="grid gap-1">
        Width (m)
        <Input
          type="number"
          inputMode="decimal"
          className="h-8"
          min={PAINT.minMetres}
          max={PAINT.maxMetres}
          step={0.1}
          value={width}
          aria-label={`Width of ${object.label} in metres`}
          onChange={(event) => change(event.target.value, height)}
        />
      </label>
      <label className="grid gap-1">
        {second} (m)
        <Input
          type="number"
          inputMode="decimal"
          className="h-8"
          min={PAINT.minMetres}
          max={PAINT.maxMetres}
          step={0.1}
          value={height}
          aria-label={`${second} of ${object.label} in metres`}
          onChange={(event) => change(width, event.target.value)}
        />
      </label>
    </div>
  )
}

/**
 * What a line's paint is called: "RAL 9010 Pure white", or the color for a free one.
 * @param line - The line.
 */
function paintTitle(line: Pick<Line, "paint" | "color">) {
  return line.paint ? `${line.paint.code} ${line.paint.name}` : `Custom color ${line.color.toUpperCase()}`
}

/**
 * The list as plain text, to copy or print.
 * @param rows - The painted walls and ceilings.
 * @param totals - The paints to buy for the sized surfaces.
 * @param settings - The coats and coverage.
 */
function listText(rows: Row[], totals: Total[], settings: PaintSettings) {
  const lines = ["Paint list", ""]
  for (const total of totals) {
    const litres = litresFor(total.area, settings)
    lines.push(`${total.title}: ${formatNumber(total.area)} m², ${formatNumber(litres)} L for ${settings.coats} coats → ${formatTins(tinsFor(litres))}`)
  }
  const unsized = rows.filter((row) => row.area === null)
  if (unsized.length > 0) {
    if (totals.length > 0) lines.push("")
    for (const row of unsized) {
      for (const line of row.lines) {
        lines.push(`${row.object.label}${line.tone === null ? "" : ` (color ${line.tone + 1}, ${Math.round(line.share * 100)}%)`}: ${paintTitle(line)}`)
      }
    }
  }
  lines.push("", MESSAGES.paintApproximate)
  return lines.join("\n")
}

/**
 * Prints the list on its own page.
 * @param text - The list as text.
 */
function printList(text: string) {
  const page = window.open("", "_blank", "width=640,height=720")
  if (!page) return
  const pre = page.document.createElement("pre")
  pre.style.font = "14px/1.6 system-ui, sans-serif"
  pre.style.whiteSpace = "pre-wrap"
  pre.textContent = text
  page.document.title = "Paint list"
  page.document.body.append(pre)
  page.print()
}

/**
 * A number kept inside a range, or a fallback when it isn't a number (or is empty, which reads as 0).
 * @param value - The number.
 * @param min - The smallest allowed.
 * @param max - The largest allowed.
 * @param fallback - Used for NaN.
 */
function clamp(value: number, min: number, max: number, fallback: number) {
  return Number.isNaN(value) || value === 0 ? fallback : Math.min(max, Math.max(min, value))
}
