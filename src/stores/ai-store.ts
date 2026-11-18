import { create } from "zustand"

import { AI_MODE, type AiMode, isEnumValue, STORAGE_KEYS } from "@/lib/constants"

/** The AI the user picked in the header (Development), shared by every page that makes or analyzes a room. */
type AiState = {
  /** The AI picked, or null for the API's default. */
  picked: AiMode | null
  /** Picks an AI, remembered while the tab is open. */
  choose: (mode: AiMode) => void
}

/** The AI picked earlier in this tab, if any. */
function remembered(): AiMode | null {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEYS.ai)

    return isEnumValue(AI_MODE, saved) ? saved : null
  } catch {
    return null
  }
}

/** Hook for the AI picked in the header. */
export const useAiStore = create<AiState>((set) => ({
  picked: remembered(),
  choose: (mode) => {
    set({ picked: mode })

    try {
      sessionStorage.setItem(STORAGE_KEYS.ai, mode)
    } catch {
      // Not remembered; the choice still applies while the page is open.
    }
  },
}))
