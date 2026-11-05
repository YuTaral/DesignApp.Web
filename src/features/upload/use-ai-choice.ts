import { useState } from "react"

import type { AiAvailability } from "@/features/rooms/api"
import type { AiMode } from "@/features/rooms/types"

/** Where the choice is kept for this tab. Session storage, so a new visit starts on the free default. */
const STORAGE_KEY = "designapp.ai"

/**
 * The AI the user picked in this tab, if any.
 * Storage can be unavailable (private windows, blocked site data), so failures fall back quietly.
 */
function remembered(): AiMode | null {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    return saved === "Fake" || saved === "Real" ? saved : null
  } catch {
    return null
  }
}

/**
 * Keeps the fake/real choice. Until the user picks, it follows the API's default; a pick that
 * isn't possible (the real AI without keys) falls back to the default too.
 * @param availability - What the API can use; undefined while it loads.
 * @returns The mode to upload with (undefined: let the API decide) and a setter.
 */
export function useAiChoice(availability: AiAvailability | undefined) {
  const [picked, setPicked] = useState<AiMode | null>(remembered)
  const choose = (mode: AiMode) => {
    setPicked(mode)
    try {
      sessionStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Not remembered; the choice still applies to this upload.
    }
  }
  if (!availability?.canChoose) return [undefined, choose] as const
  const usable = picked === "Real" && !availability.realAvailable ? null : picked
  return [usable ?? availability.default, choose] as const
}
