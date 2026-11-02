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
 * The same read gives the app's OAuth2 redirect URIs, which the install
 * flow (install-oauth.ts) checks before sending anyone to Discord with ours.
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

interface AppInfo {
  /** User Install is enabled (integration_types_config has "1"). */
  userInstall: boolean
  /** The app's OAuth2 redirect URIs (Developer Portal › OAuth2 › Redirects). */
  redirectUris: string[]
}

let cached: { info: AppInfo; until: number } | null = null

/** Tests: forget the cached answer. */
export function resetUserInstallCacheForTesting() {
  cached = null
}

async function appInfo(now: number): Promise<AppInfo> {
  if (cached && cached.until > now) return cached.info
  try {
    const app = (await rest.get(Routes.currentApplication())) as {
      integration_types_config?: Record<string, unknown>
      redirect_uris?: unknown
    }
    const info: AppInfo = {
      userInstall:
        !!app?.integration_types_config && "1" in app.integration_types_config,
      redirectUris: Array.isArray(app?.redirect_uris)
        ? app.redirect_uris.filter((u): u is string => typeof u === "string")
        : [],
    }
    cached = { info, until: now + CACHE_MS }
  } catch (err) {
    logger.warn("Could not read the Discord app's install settings", {
      error: err instanceof Error ? err.message : String(err),
    })
    cached = {
      info: { userInstall: false, redirectUris: [] },
      until: now + FAILURE_CACHE_MS,
    }
  }
  return cached.info
}

/** Whether the app has User Install enabled (Developer Portal). */
export async function userInstallAvailable(now = Date.now()): Promise<boolean> {
  return (await appInfo(now)).userInstall
}

/**
 * Whether `uri` is one of the app's OAuth2 redirects. Discord refuses an
 * authorize request whose redirect_uri isn't registered, so the install flow
 * (install-oauth.ts) uses it only once the owner has added it; until then
 * the install link is Discord's plain one and nothing is linked.
 */
export async function redirectUriRegistered(
  uri: string,
  now = Date.now(),
): Promise<boolean> {
  return (await appInfo(now)).redirectUris.includes(uri)
}

/** The link that installs the app on the visitor's own Discord account (integration_type=1). */
export function userInstallUrl(
  clientId: string | undefined = env.DISCORD_CLIENT_ID,
): string | null {
  if (!clientId || !/^\d{15,21}$/.test(clientId)) return null
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&integration_type=1&scope=applications.commands`
}
