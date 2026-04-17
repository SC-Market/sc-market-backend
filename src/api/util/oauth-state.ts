import { randomBytes, createHmac, timingSafeEqual } from "node:crypto"

/**
 * Validates that a redirect path is safe (relative, no protocol handlers, etc.)
 */
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

  // Prevent null bytes
  if (path.includes("\0")) {
    return false
  }

  return true
}

/**
 * Creates a signed state token that includes CSRF protection, redirect path, action, and origin
 * Format: base64(csrfToken:path:action:origin):signature
 */
export function createSignedStateToken(
  path: string,
  secret: string,
  action: "signup" | "signin" = "signin",
  origin: string = "",
): string {
  if (!validateRedirectPath(path)) {
    throw new Error("Invalid redirect path")
  }
  if (action !== "signup" && action !== "signin") {
    throw new Error("Invalid action, must be 'signup' or 'signin'")
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
): { csrfToken: string; path: string; action: "signup" | "signin"; origin: string } | null {
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

  const validatedAction: "signup" | "signin" =
    action === "signup" || action === "signin" ? action : "signin"

  return { csrfToken, path, action: validatedAction, origin: origin || "" }
}
