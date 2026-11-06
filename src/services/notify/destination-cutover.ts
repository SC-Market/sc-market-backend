/**
 * Cutover for the destination posts (Phase 5): which webhook and Discord
 * alert-channel routes notify() posts live. Same rollout as the user events
 * (cutover.ts): until a route is live, the legacy sender posts and notify()
 * plans the same post in shadow mode (destinations.ts deliverDestinations);
 * for a live route notify() is the only sender. The choice is made once per
 * call, so one occurrence is never posted by both paths.
 *
 * NOTIFY_DESTINATIONS_LIVE (default: unset, nothing live, shadow everywhere):
 * - "all" (or "*"): every route;
 * - a comma-separated list of routes, "<channel>:<event>" (e.g.
 *   "webhook:order.created,discord_channel:order.created") or a whole
 *   channel, "webhook:*" / "discord_channel:*";
 * - unset, empty or "none": nothing live.
 * Unknown keys are logged and ignored. Read at each call.
 *
 * A separate variable from NOTIFY_LIVE_EVENTS: that one's default is "every
 * user event live", and it goes with the legacy user senders (≥ 2026-11-10).
 *
 * NOTIFY_DESTINATIONS_SHADOW=off turns the shadow comparison off (legacy
 * still posts).
 */
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import type { DestinationChannel } from "./channels.js"
import { DESTINATION_ROUTES, type DestinationRoute } from "./destinations.js"

let parsed: { raw: string | undefined; live: ReadonlySet<DestinationRoute> } | undefined

export function liveDestinationRoutes(): ReadonlySet<DestinationRoute> {
  const raw = (env as Record<string, string | undefined>).NOTIFY_DESTINATIONS_LIVE
  if (parsed && parsed.raw === raw) return parsed.live
  const live = new Set<DestinationRoute>()
  const value = (raw ?? "").trim()
  if (value === "all" || value === "*") {
    for (const r of DESTINATION_ROUTES) live.add(r)
  } else if (value && value.toLowerCase() !== "none") {
    const ignored: string[] = []
    for (const key of value.split(",").map((k) => k.trim()).filter(Boolean)) {
      const wildcard = key.match(/^(webhook|discord_channel):\*$/)
      if (wildcard) {
        const channel = wildcard[1] as DestinationChannel
        for (const r of DESTINATION_ROUTES) if (r.startsWith(`${channel}:`)) live.add(r)
      } else if ((DESTINATION_ROUTES as readonly string[]).includes(key)) {
        live.add(key as DestinationRoute)
      } else {
        ignored.push(key)
      }
    }
    if (ignored.length) {
      logger.error("NOTIFY_DESTINATIONS_LIVE: ignoring keys that are not destination routes", {
        ignored,
        routes: DESTINATION_ROUTES,
      })
    }
  }
  parsed = { raw, live }
  logger.info("notify.destinations live routes", { live: [...live], source: raw === undefined ? "default" : "env" })
  return live
}

export function isDestinationLive(route: DestinationRoute): boolean {
  return liveDestinationRoutes().has(route)
}

export function destinationShadowEnabled(): boolean {
  return (env as Record<string, string | undefined>).NOTIFY_DESTINATIONS_SHADOW !== "off"
}
