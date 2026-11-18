import { cn } from "cn"

/** One chip of a {@link ChoiceChips} row. */
export type Chip<T extends string> = {
  value: T
  /** What it says. */
  name: string
  /** More about it, on hover. */
  title?: string
}

/**
 * A labelled row of chips to pick one of, wrapping onto more lines; the one picked is highlighted.
 * @param props.label - What the choice is (also its name for screen readers).
 * @param props.chips - The choices.
 * @param props.value - The one picked; null for none.
 * @param props.onPick - Picks one.
 * @param props.attribute - The data attribute each chip carries its value in (`data-<attribute>`), for tests.
 * @param props.group - Data attributes for the row itself.
 */
export function ChoiceChips<T extends string>({
  label,
  chips,
  value,
  onPick,
  attribute,
  group,
}: {
  label: string
  chips: Chip<T>[]
  value: T | null
  onPick: (value: T) => void
  attribute: string
  group?: Record<`data-${string}`, string>
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5" {...group}>
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            role="radio"
            aria-checked={chip.value === value}
            title={chip.title}
            onClick={() => onPick(chip.value)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              chip.value === value && "border-primary bg-accent text-accent-foreground hover:bg-accent"
            )}
            {...{ [`data-${attribute}`]: chip.value }}
          >
            {chip.name}
          </button>
        ))}
      </div>
    </div>
  )
}
