/**
 * Runtime kill switch for the Discord DM channel of chosen events:
 * DISCORD_DM_DISABLED_EVENTS is a comma-separated list of event keys
 * (catalog.ts), e.g. "reminder.unread_messages,listing.expiring". Read on
 * every call, so a changed value applies on the next run after the
 * container picks it up. Other channels are unaffected.
 */
export function discordDmDisabled(eventKey: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.DISCORD_DM_DISABLED_EVENTS
  if (!raw) return false
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((k) => k === eventKey || k === "*")
}
