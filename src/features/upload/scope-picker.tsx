import { cn } from "cn"
import { ANALYSIS_SCOPE, type AnalysisScope } from "@/lib/constants"


/** The choices, with what each finds. */
const SCOPES: { value: AnalysisScope; title: string; text: string }[] = [
  { value: ANALYSIS_SCOPE.WholeRoom, title: "Whole room", text: "Walls, floor, ceiling, doors, windows, furniture and decor" },
  { value: ANALYSIS_SCOPE.NoDoorsOrWindows, title: "Skip doors & windows", text: "Everything except doors and windows" },
  { value: ANALYSIS_SCOPE.ObjectsOnly, title: "Objects only", text: "Furniture, cabinets and decor; no walls or floor" },
]

/**
 * "What should the AI find?": three cards above the upload area.
 * @param props.value - The chosen scope.
 * @param props.onChange - Called with a new choice.
 * @param props.disabled - Locks the choice while a photo uploads.
 */
export function ScopePicker({ value, onChange, disabled = false }: { value: AnalysisScope; onChange: (scope: AnalysisScope) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-2 text-sm font-medium">What should the AI find?</legend>
      <div role="radiogroup" aria-label="What should the AI find?" className="grid gap-2 sm:grid-cols-3">
        {SCOPES.map((scope) => (
          <button
            key={scope.value}
            type="button"
            role="radio"
            aria-checked={value === scope.value}
            onClick={() => onChange(scope.value)}
            className={cn(
              "rounded-xl border bg-card px-3.5 py-3 text-left shadow-soft outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
              value === scope.value ? "border-primary bg-accent/60" : "hover:border-primary/50"
            )}
          >
            <span className="block text-sm font-medium">{scope.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{scope.text}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}
