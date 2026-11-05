import { useState } from "react"

import type { AnalysisScope } from "@/features/rooms/types"

/** The scopes that may be remembered. */
const KNOWN: AnalysisScope[] = ["WholeRoom", "NoDoorsOrWindows", "ObjectsOnly"]

/** Where the last choice is remembered for this browser. */
const STORAGE_KEY = "designapp.scope"

/**
 * The last scope this browser chose, or the whole room.
 * Storage can be unavailable (private windows, blocked site data), so failures fall back quietly.
 */
function rememberedScope(): AnalysisScope {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return KNOWN.includes(saved as AnalysisScope) ? (saved as AnalysisScope) : "WholeRoom"
  } catch {
    return "WholeRoom"
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
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not remembered; the choice still applies to this upload.
    }
  }
  return [scope, choose] as const
}
