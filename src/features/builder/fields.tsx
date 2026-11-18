import { useState } from "react"
import { cn } from "cn"

import { Input } from "@/components/ui/input"

/**
 * A number field that takes the value once it is a number in range; until then the typing stays as typed, and leaving
 * the field shows the value in use again.
 * @param props.label - Its label.
 * @param props.value - The value in use.
 * @param props.min - The lowest value taken.
 * @param props.max - The highest value taken.
 * @param props.step - The arrows' step.
 * @param props.onCommit - Takes a new value.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onCommit: (value: number) => void
}) {
  // What is being typed; null while the field isn't being typed in, so it shows the value in use.
  const [text, setText] = useState<string | null>(null)

  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="decimal"
        className="h-8"
        value={text ?? String(value)}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onFocus={() => setText(String(value))}
        onBlur={() => setText(null)}
        onChange={(event) => {
          setText(event.target.value)
          const number = Number(event.target.value)

          if (event.target.value !== "" && number >= min && number <= max) {
            onCommit(number)
          }
        }}
      />
    </label>
  )
}

/**
 * A color: swatches and any color.
 * @param props.label - What it colors.
 * @param props.value - The color in use.
 * @param props.colors - The swatches.
 * @param props.onPick - Takes a color.
 */
export function ColorChoice({ label, value, colors, onPick }: { label: string; value: string; colors: readonly string[]; onPick: (color: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{value}</span>
          <span className="relative size-6 overflow-hidden rounded-md border" style={{ backgroundColor: value }}>
            <input
              type="color"
              value={value.toLowerCase()}
              aria-label={`Any ${label.toLowerCase()} color`}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={(event) => onPick(event.target.value.toUpperCase())}
            />
          </span>
        </label>
      </div>
      <div role="radiogroup" aria-label={`${label} color`} className="grid grid-cols-8 gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value.toUpperCase() === color.toUpperCase()}
            aria-label={`Color ${color}`}
            onClick={() => onPick(color)}
            className={cn(
              "aspect-square rounded-md border shadow-soft outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50",
              value.toUpperCase() === color.toUpperCase() && "ring-2 ring-primary ring-offset-2 ring-offset-card"
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}
