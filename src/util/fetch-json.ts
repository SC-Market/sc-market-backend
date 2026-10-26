/**
 * Reading JSON from a third-party API that can answer with an HTML page (an
 * error page, a Cloudflare challenge, a maintenance page). `response.json()`
 * on such a body throws "SyntaxError: Unexpected token '<' ... is not valid
 * JSON", which says nothing about which upstream failed or how.
 */

/** An upstream API answered with an error status or a body that isn't JSON. */
export class UpstreamResponseError extends Error {
  constructor(
    readonly source: string,
    readonly status: number,
    readonly contentType: string,
    /** Start of the body, for logs. */
    readonly bodyPreview: string,
    reason: string,
  ) {
    super(`${source}: ${reason} (HTTP ${status}, ${contentType || "no content-type"})`)
    this.name = "UpstreamResponseError"
  }
}

const PREVIEW_LENGTH = 200

/**
 * The parsed JSON body of `response`, or an UpstreamResponseError when the
 * status isn't 2xx or the body doesn't parse. `source` names the upstream in
 * the error, e.g. "RSI starmap".
 */
export async function readJsonResponse<T = unknown>(
  response: Response,
  source: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? ""
  const body = await response.text()
  const preview = body.slice(0, PREVIEW_LENGTH)
  if (!response.ok) {
    throw new UpstreamResponseError(source, response.status, contentType, preview, "error status")
  }
  try {
    return JSON.parse(body) as T
  } catch {
    throw new UpstreamResponseError(source, response.status, contentType, preview, "response is not JSON")
  }
}
