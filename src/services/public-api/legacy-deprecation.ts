/**
 * The switch for deprecating legacy API tokens (api_tokens, `scm_`), OFF until
 * the owner sets a date (design doc §7 step 4).
 *
 * LEGACY_API_TOKEN_SUNSET: an ISO-8601 date or datetime. While it is unset
 * (now), nothing changes. Once set:
 * - every response to a legacy token request on v1/v2 carries
 *   `Deprecation: true`, `Sunset: <date>` and
 *   `Link: </api/public/v1>; rel="successor-version"` (cookie requests don't);
 * - GET /api/v2/public-api-tokens/options reports the date, which the token
 *   settings page shows as a notice.
 * Legacy tokens keep working either way; turning them off is a separate,
 * later change (doc §7 step 5).
 */

import type { Response } from "express"
import logger from "../../logger/logger.js"

let warned = false

/** The configured sunset date, or null while deprecation is off. */
export function legacyTokenSunset(
  env: NodeJS.ProcessEnv = process.env,
): Date | null {
  const raw = env.LEGACY_API_TOKEN_SUNSET?.trim()
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    if (!warned) {
      warned = true
      logger.warn(
        "LEGACY_API_TOKEN_SUNSET is not a valid date; legacy token deprecation stays off",
      )
    }
    return null
  }
  return date
}

/** Adds the deprecation headers to a legacy-token response, when switched on. */
export function applyLegacyTokenDeprecation(
  res: Pick<Response, "setHeader">,
  env?: NodeJS.ProcessEnv,
): void {
  const sunset = legacyTokenSunset(env)
  if (!sunset) return
  res.setHeader("Deprecation", "true")
  res.setHeader("Sunset", sunset.toUTCString())
  res.setHeader("Link", '</api/public/v1>; rel="successor-version"')
}
