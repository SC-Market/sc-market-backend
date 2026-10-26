/**
 * Make a secret safe to log: keep a short prefix (enough to correlate log
 * lines) and the length, never the usable value. Email verification and
 * unsubscribe tokens and wishlist share tokens are bearer secrets: anyone who
 * reads the logs could otherwise use them.
 */
export function redactToken(token: unknown): string | undefined {
  if (token === undefined || token === null || token === "") return undefined
  const s = String(token)
  return `${s.slice(0, 4)}…[${s.length}]`
}
