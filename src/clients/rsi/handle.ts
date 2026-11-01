/**
 * The RSI handle a user typed or pasted for profile verification. Accepts a
 * bare handle (optionally "@handle") or any RSI citizen URL form:
 *
 * - https://robertsspaceindustries.com/citizens/<handle>
 * - https://robertsspaceindustries.com/en/citizens/<handle> (any locale
 *   prefix: /de/, /fr/, /es-ES/, /zh-CN/, ...)
 * - with www., without a scheme, with a trailing slash, with extra path
 *   segments after the handle (/organizations), a query string or a hash.
 *
 * Returns null for anything else (another site, an org URL, a citizens URL
 * with no handle, characters RSI handles never contain).
 */
const HANDLE = /^[A-Za-z0-9_-]{1,60}$/
const RSI_HOSTS = new Set(["robertsspaceindustries.com", "www.robertsspaceindustries.com"])
const LOCALE = /^[a-z]{2}(?:[-_][a-z0-9]{2,4})?$/i

export function parseRsiHandle(input: unknown): string | null {
  if (typeof input !== "string") return null
  const raw = input.trim()
  if (!raw) return null
  const bare = raw.startsWith("@") ? raw.slice(1) : raw
  if (HANDLE.test(bare)) return bare

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (!RSI_HOSTS.has(url.hostname.toLowerCase())) return null
  const parts = url.pathname.split("/").filter(Boolean)
  let i = 0
  if (parts[i] && LOCALE.test(parts[i]) && parts[i].toLowerCase() !== "citizens") i++
  if ((parts[i] ?? "").toLowerCase() !== "citizens") return null
  let handle: string
  try {
    handle = decodeURIComponent(parts[i + 1] ?? "")
  } catch {
    return null
  }
  return HANDLE.test(handle) ? handle : null
}
