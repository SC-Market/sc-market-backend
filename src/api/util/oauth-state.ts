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
 * Creates a signed state token that includes CSRF protection, redirect path, and action
 * Format: base64(csrfToken:path:action):signature
 * @param path - Redirect path after authentication
 * @param secret - Secret key for signing
 * @param action - Optional action: "signup" or "signin" (defaults to "signin")
 */
export function createSignedStateToken(
  path: string,
  secret: string,
  action: "signup" | "signin" = "signin",
): string {
  // Validate the path is safe
  if (!validateRedirectPath(path)) {
    throw new Error("Invalid redirect path")
  }

  // Validate action
  if (action !== "signup" && action !== "signin") {
    throw new Error("Invalid action, must be 'signup' or 'signin'")
  }

  // Generate a cryptographically random CSRF token
  const csrfToken = randomBytes(32).toString("hex")

  // Create the payload: csrfToken:path:action
  const payload = `${csrfToken}:${path}:${action}`

  // Create HMAC signature
  const hmac = createHmac("sha256", secret)
  hmac.update(payload)
  const signature = hmac.digest("hex")

  // Return: base64(payload):signature
  const encodedPayload = Buffer.from(payload).toString("base64url")
  return `${encodedPayload}:${signature}`
}

/**
 * Verifies and extracts the redirect path and action from a signed state token
 * Returns the path and action if valid, null if invalid
 * Supports both old format (without action) and new format (with action)
 */
export function verifySignedStateToken(
  signedToken: string,
  secret: string,
): { csrfToken: string; path: string; action: "signup" | "signin" } | null {
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

  // Extract csrfToken, path, and optionally action from payload
  const payloadParts = payload.split(":")
  if (payloadParts.length < 2 || payloadParts.length > 3) {
    return null
  }

  const [csrfToken, path, action] = payloadParts

  // Validate the extracted path is still safe
  if (!validateRedirectPath(path)) {
    return null
  }

  // Default to "signin" for backward compatibility (old tokens without action)
  const validatedAction: "signup" | "signin" =
    action === "signup" || action === "signin" ? action : "signin"

  return { csrfToken, path, action: validatedAction }
}
