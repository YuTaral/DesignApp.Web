/** Joins class names and merges conflicting Tailwind classes. Re-exported for shadcn components. */
export { cn } from "cn"

/**
 * A name with "a" or "an" before it, by the sound it starts with ("an accent chair", "a desk").
 * @param name - The name, such as "accent lounge chair".
 */
export function withArticle(name: string) {
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`
}

/**
 * Whether a click is the second (or later) of a double-click: the browser counts quick clicks in one place in
 * `detail`. Buttons that send a request ignore it, so one double-click sends one request.
 * @param event - The click.
 */
export function isRepeatClick(event: { detail: number }) {
  return event.detail > 1
}
