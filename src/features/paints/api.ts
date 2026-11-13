import { useQuery } from "@tanstack/react-query"

import { getJson } from "@/lib/api"
import { API, QUERY_KEYS } from "@/lib/constants"

/** One real paint (mirrors the API's PaintResponse). */
export type Paint = {
  /** What a recolor stores to name it, such as "ral-classic/9010". */
  ref: string
  /** The code shops use, such as "RAL 9010". */
  code: string
  /** Such as "Pure white". */
  name: string
  /** Its on-screen color, "#RRGGBB"; a recolor naming the paint must use exactly this color. */
  color: string
}

/** A set of real paints, such as RAL Classic (mirrors the API's PaletteResponse). */
export type Palette = {
  /** Such as "ral-classic". */
  id: string
  name: string
  /** Where the colors come from and how exact they are. */
  notice: string
  paints: Paint[]
}

/** Loads the paint palettes; they change only with a new release. */
export function usePalettes() {
  return useQuery({
    queryKey: QUERY_KEYS.palettes,
    queryFn: ({ signal }) => getJson<Palette[]>(API.palettes, signal),
    staleTime: Infinity,
  })
}

/**
 * Every paint of every palette by its reference, for looking up a recolor's paint.
 * @param palettes - The palettes, or undefined while they load.
 */
export function paintsByRef(palettes: Palette[] | undefined): ReadonlyMap<string, Paint> {
  return new Map((palettes ?? []).flatMap((palette) => palette.paints.map((paint) => [paint.ref, paint] as const)))
}
