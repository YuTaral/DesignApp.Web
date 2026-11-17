import { HTTP_STATUS, MESSAGES, MIME } from "@/lib/constants"

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

/** Fallback messages per status, used when the API sent no usable `detail`. */
const STATUS_MESSAGES: Record<number, string> = {
  [HTTP_STATUS.notFound]: MESSAGES.notFound,
  [HTTP_STATUS.tooLarge]: MESSAGES.tooLarge,
  [HTTP_STATUS.tooManyRequests]: MESSAGES.tooManyRequests,
  [HTTP_STATUS.badGateway]: MESSAGES.network,
  [HTTP_STATUS.unavailable]: MESSAGES.network,
  [HTTP_STATUS.gatewayTimeout]: MESSAGES.network,
}

/**
 * Builds an ApiError from a response status and its RFC 9457 problem details body, if any.
 * @param status - The HTTP status, or 0 for a network failure.
 * @param body - The parsed response body, if there was one.
 */
export function toApiError(status: number, body: unknown): ApiError {
  if (status === HTTP_STATUS.network) {
    return new ApiError(HTTP_STATUS.network, MESSAGES.network)
  }

  const detail = isProblem(body) ? body.detail : undefined
  // The API writes `detail` for user mistakes (4xx). Server errors never expose internals.
  const message =
    (status < HTTP_STATUS.serverError && detail) || STATUS_MESSAGES[status] || MESSAGES.serverError

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
 * @param cache - How the browser's HTTP cache is used ("no-cache" always asks the server); its default when missing.
 * @returns The parsed body.
 * @throws ApiError with a user-facing message when the request fails.
 */
export async function getJson<T>(path: string, signal?: AbortSignal, cache?: RequestCache): Promise<T> {
  let response: Response

  try {
    response = await fetch(apiUrl(path), { signal, cache, headers: { Accept: MIME.json } })
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }

    throw toApiError(HTTP_STATUS.network, undefined)
  }

  if (!response.ok) {
    throw toApiError(response.status, await response.json().catch(() => undefined))
  }

  return (await response.json()) as T
}

/**
 * Sends JSON to the API and reads the JSON answer.
 * @param method - The HTTP method, such as "POST".
 * @param path - An API path such as `/api/rooms/123/outline`.
 * @param body - What to send; nothing when undefined.
 * @returns The parsed answer, or undefined when the API answered with no content (204).
 * @throws ApiError with a user-facing message when the request fails.
 */
export async function sendJson<T>(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  let response: Response

  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: body === undefined ? { Accept: MIME.json } : { Accept: MIME.json, "Content-Type": MIME.json },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw toApiError(HTTP_STATUS.network, undefined)
  }

  if (!response.ok) {
    throw toApiError(response.status, await response.json().catch(() => undefined))
  }

  if (response.status === HTTP_STATUS.noContent) {
    return undefined as T
  }

  return (await response.json()) as T
}

/**
 * POSTs a multipart form (such as a file) to the API and reads the JSON answer.
 * @param path - An API path such as `/api/plans/123/generate`.
 * @param form - The form's fields and files.
 * @returns The parsed answer.
 * @throws ApiError with a user-facing message when the request fails.
 */
export async function sendForm<T>(path: string, form: FormData): Promise<T> {
  let response: Response

  try {
    response = await fetch(apiUrl(path), { method: "POST", headers: { Accept: MIME.json }, body: form })
  } catch {
    throw toApiError(HTTP_STATUS.network, undefined)
  }

  if (!response.ok) {
    throw toApiError(response.status, await response.json().catch(() => undefined))
  }

  return (await response.json()) as T
}

/**
 * For toasts: ApiErrors carry a readable message; anything else gets a generic one.
 * @param error - Whatever was thrown.
 */
export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : MESSAGES.unknownError
}
