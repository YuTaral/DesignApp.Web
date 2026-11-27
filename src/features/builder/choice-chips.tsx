import type { ReactNode } from "react"
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
 * A labelled row of chips to pick one of, wrapping onto more lines; the one picked is highlighted. Given a list of
 * values instead, it is a row of checkboxes, each chip on or off (`onPick` gets the chip clicked, to switch it).
 * @param props.label - What the choice is (also its name for screen readers).
 * @param props.chips - The choices.
 * @param props.value - The one picked (null for none), or those that are on.
 * @param props.onPick - Picks one.
 * @param props.attribute - The data attribute each chip carries its value in (`data-<attribute>`), for tests.
 * @param props.group - Data attributes for the row itself.
 * @param props.after - Something to end the row with, after the chips (such as a button that adds one).
 */
export function ChoiceChips<T extends string>({
  label,
  chips,
  value,
  onPick,
  attribute,
  group,
  after,
}: {
  label: string
  chips: Chip<T>[]
  value: T | readonly T[] | null
  onPick: (value: T) => void
  attribute: string
  group?: Record<`data-${string}`, string>
  after?: ReactNode
}) {
  const several = Array.isArray(value)
  const isOn = (chip: T) => (several ? value.includes(chip) : chip === value)

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <div role={several ? "group" : "radiogroup"} aria-label={label} className="contents" {...group}>
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              role={several ? "checkbox" : "radio"}
              aria-checked={isOn(chip.value)}
              title={chip.title}
              onClick={() => onPick(chip.value)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                isOn(chip.value) && "border-primary bg-accent text-accent-foreground hover:bg-accent"
              )}
              {...{ [`data-${attribute}`]: chip.value }}
            >
              {chip.name}
            </button>
          ))}
        </div>
      {after}
      </div>
    </div>
  )
}
