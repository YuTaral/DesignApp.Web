import type { CatalogObject } from "./api"

/**
 * Whether a catalog object matches what the user typed: every word appears in its name or one of its types' names;
 * everything matches nothing typed.
 * @param object - The object.
 * @param query - What the user typed.
 */
export function matchesSearch(object: CatalogObject, query: string) {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  const text = [object.label, ...object.variants.map((v) => v.label)].join(" ").toLowerCase()

  return words.every((word) => text.includes(word))
}
