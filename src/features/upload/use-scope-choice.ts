import { useState } from "react"

import { ANALYSIS_SCOPE, type AnalysisScope, isEnumValue, STORAGE_KEYS } from "@/lib/constants"

/**
 * The last scope this browser chose, or the whole room.
 * Storage can be unavailable (private windows, blocked site data), so failures fall back quietly.
 */
function rememberedScope(): AnalysisScope {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.scope)
    return isEnumValue(ANALYSIS_SCOPE, saved) ? saved : ANALYSIS_SCOPE.WholeRoom
  } catch {
    return ANALYSIS_SCOPE.WholeRoom
  }
}

/**
 * Keeps the scope choice, remembered across visits.
 * @returns The current scope and a setter.
 */
export function useScopeChoice() {
  const [scope, setScope] = useState<AnalysisScope>(rememberedScope)
  const choose = (next: AnalysisScope) => {
    setScope(next)
    try {
      localStorage.setItem(STORAGE_KEYS.scope, next)
    } catch {
      // Not remembered; the choice still applies to this upload.
    }
  }
  return [scope, choose] as const
}
