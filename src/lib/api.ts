/**
 * Base URL of DesignApp.Api. Empty by default: the dev server forwards /api to the API, so calls
 * stay on the page's own origin. Set VITE_API_URL only when the API is hosted on another origin.
 */
const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")

/**
 * Turns an API path into a full URL.
 * @param path - An API path such as `/api/rooms`.
 * @returns The URL to request.
 */
export function apiUrl(path: string) {
  return `${API_URL}${path}`
}

/** An error with a message that is safe and useful to show to the user. */
export class ApiError extends Error {
  /** The HTTP status, or 0 when the API couldn't be reached. */
  readonly status: number

  /**
   * @param status - The HTTP status, or 0 for a network failure.
   * @param message - The message to show the user.
   */
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Shown when the request never reached the API (offline, API down, bad gateway). */
const NETWORK_MESSAGE = "Can't reach DesignApp right now. Check your connection and try again."

/** Fallback messages per status, used when the API sent no usable `detail`. */
const STATUS_MESSAGES: Record<number, string> = {
  404: "We couldn't find that.",
  413: "That photo is too large. Use one under 15 MB.",
  429: "You've uploaded a lot of photos in a short time. Try again in a little while.",
  502: NETWORK_MESSAGE,
  503: NETWORK_MESSAGE,
  504: NETWORK_MESSAGE,
}

/**
 * Builds an ApiError from a response status and its RFC 9457 problem details body, if any.
 * @param status - The HTTP status, or 0 for a network failure.
 * @param body - The parsed response body, if there was one.
 */
export function toApiError(status: number, body: unknown): ApiError {
  if (status === 0) return new ApiError(0, NETWORK_MESSAGE)
  const detail = isProblem(body) ? body.detail : undefined
  // The API writes `detail` for user mistakes (4xx). Server errors never expose internals.
  const message =
    (status < 500 && detail) || STATUS_MESSAGES[status] || "Something went wrong on our side. Try again in a moment."
  return new ApiError(status, message)
}

/**
 * Whether a response body looks like RFC 9457 problem details.
 * @param body - The parsed response body.
 */
function isProblem(body: unknown): body is { title?: string; detail?: string } {
  return typeof body === "object" && body !== null && ("title" in body || "detail" in body)
}

/**
 * GETs JSON from the API.
 * @param path - An API path such as `/api/rooms/123`.
 * @param signal - Cancels the request.
 * @returns The parsed body.
 * @throws ApiError with a user-facing message when the request fails.
 */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), { signal, headers: { Accept: "application/json" } })
  } catch (error) {
    if (signal?.aborted) throw error
    throw toApiError(0, undefined)
  }
  if (!response.ok) throw toApiError(response.status, await response.json().catch(() => undefined))
  return (await response.json()) as T
}

/**
 * For toasts: ApiErrors carry a readable message; anything else gets a generic one.
 * @param error - Whatever was thrown.
 */
export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again."
}
