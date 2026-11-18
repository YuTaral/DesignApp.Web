import { FlaskConicalIcon, SparklesIcon } from "lucide-react"
import { cn } from "cn"

import { useAiAvailability } from "@/features/rooms/api"
import { AI_MODE, type AiMode } from "@/lib/constants"
import { useAiChoice } from "./use-ai-choice"

/** The two choices. */
const MODES: { value: AiMode; title: string; note: string; icon: typeof SparklesIcon }[] = [
  { value: AI_MODE.Fake, title: "Fake AI", note: "Fake AI: free and instant", icon: FlaskConicalIcon },
  { value: AI_MODE.Real, title: "Real AI", note: "Real AI: Claude, SAM 3 and FLUX; costs a few cents", icon: SparklesIcon },
]

/**
 * The development switch between the fake and the real AI, in the header: what new uploads, sample rooms and built
 * rooms use. Shown only when the API allows choosing (never in production), and from tablet width up (on a phone the
 * header has no room for it); icons only below desktop width.
 */
export function AiSwitch() {
  const availability = useAiAvailability().data
  const [value, choose] = useAiChoice(availability)

  if (!availability?.canChoose || !value) {
    return null
  }

  return (
    <div role="radiogroup" aria-label="Which AI the app uses" className="hidden rounded-lg border bg-card p-0.5 sm:flex" data-ai-switch>
      {MODES.map(({ value: mode, title, note, icon: Icon }) => {
        const unavailable = mode === AI_MODE.Real && !availability.realAvailable

        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={value === mode}
            aria-label={title}
            disabled={unavailable}
            title={unavailable ? "Add the Anthropic and fal.ai keys to the API's user secrets first." : note}
            onClick={() => choose(mode)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
              value === mode
                ? mode === AI_MODE.Real
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="hidden lg:inline">{title}</span>
          </button>
        )
      })}
    </div>
  )
}
