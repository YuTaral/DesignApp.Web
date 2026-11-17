import { FlaskConicalIcon, SparklesIcon } from "lucide-react"
import { cn } from "cn"

import type { AiAvailability } from "@/features/rooms/api"
import { AI_MODE, type AiMode } from "@/lib/constants"

/** The two choices. */
const MODES: { value: AiMode; title: string; note: string; icon: typeof SparklesIcon }[] = [
  { value: AI_MODE.Fake, title: "Fake AI", note: "Free, instant", icon: FlaskConicalIcon },
  { value: AI_MODE.Real, title: "Real AI", note: "Claude + SAM 3, costs a few cents", icon: SparklesIcon },
]

/**
 * The development switch between the fake and the real AI, above the upload area. Shown only when
 * the API allows choosing (never in production).
 * @param props.availability - What the API can use.
 * @param props.value - The chosen mode.
 * @param props.onChange - Called with a new choice.
 * @param props.disabled - Locks the choice while a photo uploads.
 */
export function AiSwitch({
  availability,
  value,
  onChange,
  disabled = false,
}: {
  availability: AiAvailability
  value: AiMode
  onChange: (mode: AiMode) => void
  disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <legend className="sr-only">Which AI analyzes the photo</legend>
      <span className="text-sm font-medium" aria-hidden>
        AI
      </span>
      <div role="radiogroup" aria-label="Which AI analyzes the photo" className="flex rounded-xl border bg-card p-1 shadow-soft">
        {MODES.map(({ value: mode, title, note, icon: Icon }) => {
          const unavailable = mode === AI_MODE.Real && !availability.realAvailable

          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={value === mode}
              disabled={unavailable}
              title={unavailable ? "Add the Anthropic and fal.ai keys to the API's user secrets first." : note}
              onClick={() => onChange(mode)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                value === mode
                  ? mode === AI_MODE.Real
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden />
              {title}
            </button>
          )
        })}
      </div>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {value === AI_MODE.Real
          ? "Claude and SAM 3 analyze the photo. Costs a few cents."
          : availability.realAvailable
            ? "Free. The five sample photos get recorded outlines."
            : "Free. The real AI needs its keys in the API's user secrets."}
      </span>
    </fieldset>
  )
}
