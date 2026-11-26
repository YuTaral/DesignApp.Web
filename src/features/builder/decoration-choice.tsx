import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BUILDER } from "@/lib/constants"

/**
 * The small things on an object (the photo shows them on it, and nothing else): its five most popular decorations to
 * tick, the ones the user typed, and an "Other" field for more (several at once, separated by commas).
 * @param props.suggestions - The object's most popular decorations, from the catalog (may be empty).
 * @param props.value - The decorations chosen.
 * @param props.onChange - Sets the decorations chosen.
 * @param props.titled - Whether it shows its "Decorations" title (not under a heading of that name; screen readers still hear it).
 */
export function DecorationChoice({
  suggestions,
  value,
  onChange,
  titled = true,
}: {
  suggestions: string[]
  value: string[]
  onChange: (next: string[]) => void
  titled?: boolean
}) {
  const [other, setOther] = useState("")
  const chosen = new Set(value.map((name) => name.toLowerCase()))
  const typed = value.filter((name) => !suggestions.some((s) => s.toLowerCase() === name.toLowerCase()))
  const full = value.length >= BUILDER.maxDecorations

  const toggle = (name: string) => {
    if (chosen.has(name.toLowerCase())) {
      onChange(value.filter((v) => v.toLowerCase() !== name.toLowerCase()))
    } else if (!full) {
      onChange([...value, name])
    }
  }

  const addOther = () => {
    const next = [...value]

    for (const part of other.split(",")) {
      const name = part.trim().slice(0, BUILDER.decorationLength)

      if (name && next.length < BUILDER.maxDecorations && !next.some((v) => v.toLowerCase() === name.toLowerCase())) {
        next.push(name)
      }
    }

    onChange(next)
    setOther("")
  }

  return (
    <fieldset className="space-y-2" data-decorations>
      <legend className={titled ? "text-sm font-medium" : "sr-only"}>Decorations</legend>
      <p className="text-xs text-muted-foreground">Small things the photo shows on it. Nothing else is added to the room.</p>
      <div className="flex flex-wrap gap-1.5">
        {[...suggestions, ...typed].map((name) => {
          const on = chosen.has(name.toLowerCase())

          return (
            <button
              key={name}
              type="button"
              role="checkbox"
              aria-checked={on}
              data-decoration={name}
              disabled={!on && full}
              onClick={() => toggle(name)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                on && "border-primary bg-accent text-accent-foreground hover:bg-accent"
              )}
            >
              {name}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Other decorations"
          placeholder="Other, such as: candles, a bowl of lemons"
          value={other}
          maxLength={BUILDER.decorationLength * BUILDER.maxDecorations}
          disabled={full}
          data-decoration-other
          onChange={(event) => setOther(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return
            }

            event.preventDefault()
            addOther()
          }}
        />
        <Button type="button" variant="outline" disabled={full || !other.trim()} onClick={addOther} data-decoration-add>
          <PlusIcon data-icon="inline-start" />
          Add
        </Button>
      </div>
    </fieldset>
  )
}
