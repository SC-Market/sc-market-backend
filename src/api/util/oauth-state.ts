import { randomBytes, createHmac, timingSafeEqual } from "node:crypto"

/**
 * Validates that a redirect path is safe (relative, no protocol handlers, etc.)
 */
/**
 * Resolve a post-auth redirect path against an allowed base URL. Returns the
 * base's root if the result would land on a different origin, so a path that
 * slips past validateRedirectPath still can't redirect off-site.
 */
export function resolveSameOriginRedirect(path: string, base: URL): string {
  try {
    const url = new URL(path || "/", base)
    if (url.origin === base.origin) return url.toString()
  } catch {
    /* unparseable path */
  }
  return new URL("/", base).toString()
}

export function validateRedirectPath(path: string): boolean {
  if (!path) return true // Empty path is valid (redirects to home)

  // Must be a relative path starting with /
  if (!path.startsWith("/")) {
    return false
  }

  // Prevent protocol handlers (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return false
  }

  // Prevent double slashes that could be used for protocol confusion
  if (path.includes("//")) {
    return false
  }

  // Prevent backslashes: URL parsers treat "\" like "/", so "/\evil.com"
  // resolves to https://evil.com/.
  if (path.includes("\\")) {
    return false
  }

  // Prevent control characters (incl. NUL, tab, CR/LF): parsers strip tabs and
  // newlines, which can turn an innocent-looking path into "//host".
  if (/[\u0000-\u001f\u007f]/.test(path)) {
    return false
  }

  return true
}

/**
 * What the user asked for when starting an OAuth flow. "link" attaches the
 * provider to the account that started the flow; it is only honoured when the
 * state is bound to the browser (see stateNonceMatches) and a user is logged in.
 */
export type OAuthAction = "signup" | "signin" | "link"

function isOAuthAction(action: string): action is OAuthAction {
  return action === "signup" || action === "signin" || action === "link"
}

/**
 * Creates a signed state token plus the nonce embedded in it. The caller must
 * store the nonce in the browser (an httpOnly cookie) and compare it on the
 * callback with stateNonceMatches, so a callback URL minted in someone else's
 * browser is rejected.
 */
export function createSignedState(
  path: string,
  secret: string,
  action: OAuthAction = "signin",
  origin: string = "",
): { token: string; nonce: string } {
  const token = createSignedStateToken(path, secret, action, origin)
  const nonce = Buffer.from(token.split(":")[0], "base64url")
    .toString("utf-8")
    .split(":")[0]
  return { token, nonce }
}

/** Constant-time comparison of the browser-held nonce with the state's nonce. */
export function stateNonceMatches(
  browserNonce: string | undefined | null,
  stateNonce: string | undefined | null,
): boolean {
  if (!browserNonce || !stateNonce) return false
  const a = Buffer.from(browserNonce)
  const b = Buffer.from(stateNonce)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Creates a signed state token that includes CSRF protection, redirect path, action, and origin
 * Format: base64(csrfToken:path:action:origin):signature
 */
export function createSignedStateToken(
  path: string,
  secret: string,
  action: OAuthAction = "signin",
  origin: string = "",
): string {
  if (!validateRedirectPath(path)) {
    throw new Error("Invalid redirect path")
  }
  if (!isOAuthAction(action)) {
    throw new Error("Invalid action, must be 'signup', 'signin' or 'link'")
  }

  const csrfToken = randomBytes(32).toString("hex")
  const payload = `${csrfToken}:${path}:${action}:${origin}`
  const hmac = createHmac("sha256", secret)
  hmac.update(payload)
  const signature = hmac.digest("hex")
  const encodedPayload = Buffer.from(payload).toString("base64url")
  return `${encodedPayload}:${signature}`
}

/**
 * Verifies and extracts the redirect path, action, and origin from a signed state token
 */
export function verifySignedStateToken(
  signedToken: string,
  secret: string,
): { csrfToken: string; path: string; action: OAuthAction; origin: string } | null {
  if (!signedToken) {
    return null
  }

  const parts = signedToken.split(":")
  if (parts.length !== 2) {
    return null
  }

  const [encodedPayload, signature] = parts

  let payload: string
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf-8")
  } catch {
    return null
  }

  const hmac = createHmac("sha256", secret)
  hmac.update(payload)
  const expectedSignature = hmac.digest("hex")

  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null
  }

  const payloadParts = payload.split(":")
  // Origin may contain colons (e.g. https://example.com), so limit split to 4
  // and rejoin any remaining parts as the origin
  if (payloadParts.length < 2) {
    return null
  }

  const csrfToken = payloadParts[0]
  const path = payloadParts[1]
  const action = payloadParts[2] || ""
  const origin = payloadParts.slice(3).join(":")

  if (!validateRedirectPath(path)) {
    return null
  }

  const validatedAction: OAuthAction = isOAuthAction(action) ? action : "signin"

  return { csrfToken, path, action: validatedAction, origin: origin || "" }
}
