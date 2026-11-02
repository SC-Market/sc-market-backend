/**
 * Installing the SC Market Discord app on your own account ("user install").
 *
 * Whether the app can be user-installed is a Developer Portal setting
 * (Installation › User Install), not something the backend controls. It
 * shows in the app's integration_types_config: key "1" (USER_INSTALL) is
 * present only when it is enabled. As of 2026-11-02 only "0" (GUILD_INSTALL)
 * is there. The "Add SC Market to your Discord" call to action is shown only
 * while it is enabled, so no one is sent to an install link Discord refuses.
 *
 * Read with the bot token (GET /applications/@me, read-only), cached for
 * CACHE_MS; a failed read counts as not available and is retried after
 * FAILURE_CACHE_MS.
 */
import { Routes } from "discord-api-types/v10"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { rest } from "./discord.service.js"

const CACHE_MS = 60 * 60 * 1000
const FAILURE_CACHE_MS = 5 * 60 * 1000

let cached: { available: boolean; until: number } | null = null

/** Tests: forget the cached answer. */
export function resetUserInstallCacheForTesting() {
  cached = null
}

/** Whether the app has User Install enabled (Developer Portal). */
export async function userInstallAvailable(now = Date.now()): Promise<boolean> {
  if (cached && cached.until > now) return cached.available
  try {
    const app = (await rest.get(Routes.currentApplication())) as {
      integration_types_config?: Record<string, unknown>
    }
    const available = !!app?.integration_types_config && "1" in app.integration_types_config
    cached = { available, until: now + CACHE_MS }
  } catch (err) {
    logger.warn("Could not read the Discord app's install settings", {
      error: err instanceof Error ? err.message : String(err),
    })
    cached = { available: false, until: now + FAILURE_CACHE_MS }
  }
  return cached.available
}

/** The link that installs the app on the visitor's own Discord account (integration_type=1). */
export function userInstallUrl(clientId: string | undefined = env.DISCORD_CLIENT_ID): string | null {
  if (!clientId || !/^\d{15,21}$/.test(clientId)) return null
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&integration_type=1&scope=applications.commands`
}
