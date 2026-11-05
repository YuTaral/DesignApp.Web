/** How dates are shown: "5 Nov 2026, 14:32" in the browser's language. */
export const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

/**
 * "1 room", "3 rooms".
 * @param count - How many rooms.
 */
export const roomCount = (count: number) => `${count} ${count === 1 ? "room" : "rooms"}`
