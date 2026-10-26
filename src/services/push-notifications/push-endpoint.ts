/**
 * Web Push endpoints the server will POST to. The browser's push service
 * picks the endpoint, and every real one is https on one of these hosts.
 * Accepting any URL let a user point the server's push sender at arbitrary
 * hosts (blind SSRF into internal networks).
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge (Chromium), Opera, Samsung, Android
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari 16+
]
const PUSH_SERVICE_HOST_SUFFIXES = [
  ".notify.windows.com", // legacy Edge / Windows (WNS)
  ".push.apple.com",
]

export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return false
  const host = url.hostname.toLowerCase()
  return (
    PUSH_SERVICE_HOSTS.includes(host) ||
    PUSH_SERVICE_HOST_SUFFIXES.some((s) => host.endsWith(s))
  )
}
