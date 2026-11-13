import { useState } from "react"
import { MousePointerClickIcon, PipetteIcon, RotateCcwIcon, SearchIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { paintsByRef, usePalettes, type Paint, type Palette } from "@/features/paints/api"
import { closestPaint, matchesPaint } from "@/features/paints/paint-math"
import type { Room } from "@/features/rooms/types"
import { useEditorStore } from "./editor-store"
import { DEFAULT_STRENGTH, MESSAGES, RAL_FAMILIES, SWATCHES } from "@/lib/constants"

/** The panel's two ways to pick a color. */
type ColorTab = "quick" | "paints"

/**
 * The Color section: recolors the selected object with a quick swatch, a real paint (RAL) or any color, sets how
 * strongly, and resets it. A color that isn't a paint shows the closest paint, one click away. Without a selection it
 * explains how to pick an object. For an object split by color, the Parts dialog's copy changes the chosen tone, and
 * the inspector's copy lists the tones and points to the dialog.
 * @param props.room - The room being edited.
 * @param props.inDialog - Whether it is the Parts dialog's copy.
 */
export function ColorPanel({ room, inDialog = false }: { room: Room; inDialog?: boolean }) {
  const { selected, selectedTone, edits, setColor, previewStrength, commitStrength, resetObject } = useEditorStore()
  const palettes = usePalettes()
  const [tab, setTab] = useState<ColorTab>("quick")
  const object = room.objects.find((o) => o.index === selected)
  const objectEdit = selected ? edits[selected] : undefined
  const tones = objectEdit?.tones
  const toneIndex = tones && selectedTone !== null && selectedTone < tones.length ? selectedTone : null
  const tone = toneIndex !== null ? tones?.[toneIndex] : undefined
  // What the controls show and change: the chosen tone of a split object, or the object.
  const edit = tones ? (tone?.color ? { color: tone.color, strength: tone.strength, paint: tone.paint } : undefined) : objectEdit

  if (!object) {
    return (
      <div className="space-y-2">
        <h2 className="font-medium">Color</h2>
        <p className="flex gap-2 text-sm text-muted-foreground">
          <MousePointerClickIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          Click an object in the photo, or pick one from the list, to change its color.
        </p>
      </div>
    )
  }

  if (tones && !inDialog) {
    return (
      <div className="space-y-2">
        <h2 className="min-w-0 truncate font-medium first-letter:uppercase">{object.label}</h2>
        <div className="flex items-center gap-2" data-tone-summary>
          {tones.map((t, i) => (
            <span
              key={t.center}
              className="size-6 rounded-md border shadow-soft"
              style={{ backgroundColor: t.color ?? t.center }}
              title={`Tone ${i + 1}`}
              aria-hidden
            />
          ))}
          <span className="text-sm text-muted-foreground">Split into {tones.length} colors</span>
        </div>
        <p className="text-xs text-muted-foreground">Change them in Parts.</p>
      </div>
    )
  }

  const current = edit?.color ?? tone?.center ?? object.dominantColor
  const strength = edit?.strength ?? DEFAULT_STRENGTH
  const paint = edit?.paint ? paintsByRef(palettes.data).get(edit.paint) : undefined
  const allPaints = palettes.data?.flatMap((p) => p.paints) ?? []
  const closest = edit && !edit.paint ? closestPaint(edit.color, allPaints) : undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate font-medium first-letter:uppercase">
          {object.label}
          {toneIndex !== null && <span className="text-muted-foreground"> · color {toneIndex + 1}</span>}
        </h2>
        <Button variant="ghost" size="sm" disabled={!edit} onClick={() => resetObject(object.index)}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset
        </Button>
      </div>

      <div role="tablist" aria-label="Colors" className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1 text-sm">
        {(
          [
            ["quick", "Quick colors"],
            ["paints", "RAL colors"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`color-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`color-tabpanel-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              "rounded-lg px-2 py-1.5 font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              tab === value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "quick" ? (
        <div role="tabpanel" id="color-tabpanel-quick" aria-labelledby="color-tab-quick">
          <div role="radiogroup" aria-label={`Color for ${object.label}`} className="grid grid-cols-[repeat(8,1.75rem)] justify-between gap-y-2">
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={edit?.color === color && !edit.paint}
                aria-label={`Color ${color}`}
                onClick={() => setColor(object.index, color)}
                className={cn(
                  "aspect-square rounded-lg border shadow-soft outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50",
                  edit?.color === color && !edit.paint && "ring-2 ring-primary ring-offset-2 ring-offset-card"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div role="tabpanel" id="color-tabpanel-paints" aria-labelledby="color-tab-paints">
          {palettes.isError ? (
            <p className="text-sm text-destructive">{MESSAGES.palettesLoadFailed}</p>
          ) : (
            <PaintPicker
              palettes={palettes.data ?? []}
              label={object.label}
              selected={edit?.paint}
              onPick={(picked) => setColor(object.index, picked.color, picked.ref)}
            />
          )}
        </div>
      )}

      {paint && (
        <p className="flex items-center gap-2 text-sm" data-paint-label>
          <span className="size-4 shrink-0 rounded border" style={{ backgroundColor: paint.color }} aria-hidden />
          <span className="font-medium">{paint.code}</span>
          <span className="text-muted-foreground">· {paint.name}</span>
        </p>
      )}
      {closest && (
        <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-2 text-sm" data-closest-paint>
          <span className="size-6 shrink-0 rounded-md border" style={{ backgroundColor: closest.color }} aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            Closest paint: <span className="font-medium">{closest.code}</span> <span className="text-muted-foreground">{closest.name}</span>
          </span>
          <Button size="xs" variant="outline" onClick={() => setColor(object.index, closest.color, closest.ref)}>
            Use it
          </Button>
        </div>
      )}

      <label className="flex items-center gap-3 text-sm">
        <span className="relative size-9 shrink-0 overflow-hidden rounded-lg border shadow-soft" style={{ backgroundColor: current }}>
          <input
            type="color"
            value={current.toLowerCase()}
            onChange={(event) => setColor(object.index, event.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label="Any color"
          />
        </span>
        <span className="flex items-center gap-1.5">
          <PipetteIcon className="size-4 text-muted-foreground" aria-hidden />
          Any color
        </span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{current}</span>
      </label>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Strength</span>
          <span className="text-muted-foreground tabular-nums">{Math.round(strength * 100)}%</span>
        </div>
        <Slider
          value={[Math.round(strength * 100)]}
          max={100}
          step={1}
          disabled={!edit}
          aria-label="Recolor strength"
          onValueChange={([value]) => previewStrength(object.index, value / 100)}
          onValueCommit={commitStrength}
        />
      </div>
    </div>
  )
}

/**
 * The real paints, searchable by code or name and grouped by RAL family (the code's first digit).
 * @param props.palettes - The palettes.
 * @param props.label - The selected object's name, for the radio group.
 * @param props.selected - The paint the object has, if any.
 * @param props.onPick - Paints the object with a paint.
 */
function PaintPicker({
  palettes,
  label,
  selected,
  onPick,
}: {
  palettes: readonly Palette[]
  label: string
  selected: string | undefined
  onPick: (paint: Paint) => void
}) {
  const [query, setQuery] = useState("")
  const paints = palettes.flatMap((p) => p.paints).filter((paint) => matchesPaint(paint, query))
  const families = new Map<string, Paint[]>()
  for (const paint of paints) {
    const family = paint.code.replace(/\D/g, "").charAt(0)
    families.set(family, [...(families.get(family) ?? []), paint])
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Code or name, such as 9010 or white"
          aria-label="Search RAL colors"
          className="pl-8"
        />
      </div>
      <div role="radiogroup" aria-label={`Paint for ${label}`} className="max-h-64 space-y-3 overflow-y-auto pr-1" data-paint-grid>
        {paints.length === 0 && <p className="text-sm text-muted-foreground">No RAL color matches “{query.trim()}”.</p>}
        {[...families].map(([family, members]) => (
          <div key={family} className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{RAL_FAMILIES[family] ?? "Other"}</p>
            <div className="grid grid-cols-[repeat(8,1.75rem)] justify-between gap-y-2">
              {members.map((paint) => (
                <button
                  key={paint.ref}
                  type="button"
                  role="radio"
                  aria-checked={selected === paint.ref}
                  aria-label={`${paint.code} ${paint.name}`}
                  title={`${paint.code} ${paint.name}`}
                  data-paint={paint.ref}
                  onClick={() => onPick(paint)}
                  className={cn(
                    "aspect-square rounded-lg border shadow-soft outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected === paint.ref && "ring-2 ring-primary ring-offset-2 ring-offset-card"
                  )}
                  style={{ backgroundColor: paint.color }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
