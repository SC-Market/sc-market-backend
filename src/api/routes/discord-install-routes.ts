/**
 * The Discord install flow's two browser routes (services/discord/install-oauth.ts):
 *
 *   GET /auth/discord-install?type=user|server&src=<surface>[&shop=<shop id>|&org=<Spectrum ID>]
 *     Signs a state, sets its nonce in an httpOnly cookie and sends the
 *     browser to Discord's authorize page.
 *   GET /auth/discord-install/callback?code=…&state=…[&guild_id=…]
 *     Discord's redirect_uri. Verifies the state and the cookie, exchanges
 *     the code server-side, links what may be linked, and sends the browser
 *     to the website.
 *
 * Both are top-level GET navigations that change nothing without a valid
 * state bound to this browser, so they sit outside the JSON CSRF check
 * (which covers unsafe methods). Query strings here hold a code and a state:
 * they are never logged.
 */
import { Application, Request, Response } from "express"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { User } from "./v1/api-models.js"
import {
  authCallbackLimit,
  authInitLimit,
} from "../middleware/enhanced-ratelimiting.js"
import { redirectUriRegistered } from "../../services/discord/app-install.js"
import {
  INSTALL_PATH,
  INSTALL_STATE_COOKIE,
  INSTALL_STATE_TTL_MS,
  completeInstall,
  installConfig,
  outcomeUrl,
  startInstall,
} from "../../services/discord/install-oauth.js"

export function setupDiscordInstallRoutes(
  app: Application,
  frontendUrl: URL,
  backendUrl: URL,
): void {
  const config = installConfig(env, backendUrl)
  if (!config) {
    logger.warn(
      "Discord install flow is off: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and SESSION_SECRET are required",
    )
  }

  const cookieOptions = (withMaxAge: boolean) => ({
    httpOnly: true,
    secure: app.get("env") === "production",
    // Discord sends the browser back with a top-level GET, which carries Lax cookies.
    sameSite: "lax" as const,
    path: INSTALL_PATH,
    ...(withMaxAge ? { maxAge: INSTALL_STATE_TTL_MS } : {}),
  })

  // The browser's own sign-in (session or JWT cookie). A request made with an
  // API token counts as signed out: this flow links accounts.
  const userId = (req: Request) =>
    req.__tokenInfo ? null : ((req.user as User | undefined)?.user_id ?? null)

  app.get(INSTALL_PATH, authInitLimit, async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store")
    try {
      const redirectRegistered = config
        ? await redirectUriRegistered(config.redirectUri)
        : false
      if (config && !redirectRegistered) {
        logger.warn(
          "Discord install redirect URI isn't registered yet; using the plain install link",
          {
            redirect_uri: config.redirectUri,
          },
        )
      }
      const started = await startInstall(
        {
          query: req.query as Record<string, unknown>,
          userId: userId(req),
          redirectRegistered,
        },
        config,
      )
      if ("plainUrl" in started) return res.redirect(started.plainUrl)
      if ("outcome" in started)
        return res.redirect(outcomeUrl(started.outcome, frontendUrl))
      res.cookie(INSTALL_STATE_COOKIE, started.nonce, cookieOptions(true))
      return res.redirect(started.discordUrl)
    } catch (err) {
      logger.error("Discord install start failed", {
        error: err instanceof Error ? err.message : String(err),
      })
      return res.redirect(
        outcomeUrl({ result: "failed", type: null }, frontendUrl),
      )
    }
  })

  app.get(
    `${INSTALL_PATH}/callback`,
    authCallbackLimit,
    async (req: Request, res: Response) => {
      res.set("Cache-Control", "no-store")
      res.set("Referrer-Policy", "no-referrer")
      const cookieNonce = req.cookies?.[INSTALL_STATE_COOKIE]
      res.clearCookie(INSTALL_STATE_COOKIE, cookieOptions(false))
      try {
        const outcome = await completeInstall(
          {
            query: req.query as Record<string, unknown>,
            cookieNonce,
            userId: userId(req),
          },
          config,
        )
        return res.redirect(outcomeUrl(outcome, frontendUrl))
      } catch (err) {
        logger.error("Discord install callback failed", {
          error: err instanceof Error ? err.name : "error",
        })
        return res.redirect(
          outcomeUrl({ result: "failed", type: null }, frontendUrl),
        )
      }
    },
  )
}
