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
 * Creates a signed state token that includes both CSRF protection and redirect path
 * Format: base64(csrfToken:path):signature
 */
export function createSignedStateToken(path: string, secret: string): string {
  // Validate the path is safe
  if (!validateRedirectPath(path)) {
    throw new Error("Invalid redirect path")
  }

  // Generate a cryptographically random CSRF token
  const csrfToken = randomBytes(32).toString("hex")

  // Create the payload: csrfToken:path
  const payload = `${csrfToken}:${path}`

  // Create HMAC signature
  const hmac = createHmac("sha256", secret)
  hmac.update(payload)
  const signature = hmac.digest("hex")

  // Return: base64(payload):signature
  const encodedPayload = Buffer.from(payload).toString("base64url")
  return `${encodedPayload}:${signature}`
}

/**
 * Verifies and extracts the redirect path from a signed state token
 * Returns the path if valid, null if invalid
 */
export function verifySignedStateToken(
  signedToken: string,
  secret: string,
): { csrfToken: string; path: string } | null {
  if (!signedToken) {
    return null
  }

  const parts = signedToken.split(":")
  if (parts.length !== 2) {
    return null
  }

  const [encodedPayload, signature] = parts

  // Decode the payload
  let payload: string
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf-8")
  } catch {
    return null
  }

  // Verify the signature
  const hmac = createHmac("sha256", secret)
  hmac.update(payload)
  const expectedSignature = hmac.digest("hex")

  // Use timing-safe comparison to prevent timing attacks
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null
  }

  // Extract csrfToken and path from payload
  const payloadParts = payload.split(":")
  if (payloadParts.length !== 2) {
    return null
  }

  const [csrfToken, path] = payloadParts

  // Validate the extracted path is still safe
  if (!validateRedirectPath(path)) {
    return null
  }

  return { csrfToken, path }
}
