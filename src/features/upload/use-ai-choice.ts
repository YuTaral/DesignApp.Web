import type { AiAvailability } from "@/features/rooms/api"
import { AI_MODE } from "@/lib/constants"
import { useAiStore } from "@/stores/ai-store"

/**
 * The fake/real choice made in the header, shared by every page. Until the user picks, it follows the API's default; a
 * pick that isn't possible (the real AI without keys) falls back to the default too.
 * @param availability - What the API can use; undefined while it loads.
 * @returns The mode to use (undefined: let the API decide) and a setter.
 */
export function useAiChoice(availability: AiAvailability | undefined) {
  const picked = useAiStore((state) => state.picked)
  const choose = useAiStore((state) => state.choose)

  if (!availability?.canChoose) {
    return [undefined, choose] as const
  }

  const usable = picked === AI_MODE.Real && !availability.realAvailable ? null : picked

  return [usable ?? availability.default, choose] as const
}
