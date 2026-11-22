/** Joins class names and merges conflicting Tailwind classes. Re-exported for shadcn components. */
export { cn } from "cn"

/**
 * A name with "a" or "an" before it, by the sound it starts with ("an accent chair", "a desk").
 * @param name - The name, such as "accent lounge chair".
 */
export function withArticle(name: string) {
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`
}
