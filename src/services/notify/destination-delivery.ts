/**
 * deliverDestinations(): the one way the call sites post to webhooks and
 * Discord alert channels (Phase 5). Per call, for one route
 * ("<channel>:<event>", destination-cutover.ts):
 *
 * - live: notify()'s plan is posted by notifyDestinations() (destinations.ts)
 *   and the legacy sender is not called;
 * - otherwise (the default): the legacy sender posts, and the plan is
 *   compared with what it addressed (shadow mode). Nothing is written or
 *   posted for the plan. One log line per call:
 *
 *   notify.destinations.shadow { route, entity_id, match, legacy, planned,
 *                                missing, extra, payload_mismatch }
 *
 *   `missing` = destinations legacy posted to that the plan lacks; `extra` =
 *   planned but not posted by legacy; `payload_mismatch` = both, with a
 *   different body (embed timestamps, which are the send time, are ignored).
 *   `match` is true when all three are empty. Logged at info when it
 *   matches, warn when not. Refs are webhook ids and channel ids, never
 *   webhook URLs.
 *
 * Shadow planning runs before the legacy call and never affects it: a
 * planning or comparison error is logged and swallowed.
 */
import logger from "../../logger/logger.js"
import { destinationShadowEnabled, isDestinationLive } from "./destination-cutover.js"
import { outsideDestinationTrace, traceLegacyDestinations, type LegacyDestinationSend } from "./destination-trace.js"
import {
  notifyDestinations,
  routeOf,
  uniqueDestinations,
  type DestinationDeliveryResult,
  type DestinationPlan,
  type DestinationRoute,
} from "./destinations.js"

export type DeliverOutcome<T> =
  | { path: "live"; result: DestinationDeliveryResult | null }
  | { path: "legacy"; result: T }

export async function deliverDestinations<T>(
  route: DestinationRoute,
  build: () => Promise<DestinationPlan> | DestinationPlan,
  legacy: () => Promise<T>,
): Promise<DeliverOutcome<T>> {
  if (isDestinationLive(route)) {
    let plan: DestinationPlan
    try {
      plan = await build()
    } catch (err) {
      logger.error("notify: destination plan failed", {
        route,
        error: err instanceof Error ? err.message : String(err),
      })
      return { path: "live", result: null }
    }
    if (routeOf(plan) !== route) {
      logger.error("notify: destination plan for the wrong route", { route, plan_route: routeOf(plan) })
      return { path: "live", result: null }
    }
    return { path: "live", result: await outsideDestinationTrace(() => notifyDestinations(plan)) }
  }

  if (!destinationShadowEnabled()) return { path: "legacy", result: await legacy() }

  let plan: DestinationPlan | null = null
  let planError: string | undefined
  try {
    plan = await outsideDestinationTrace(async () => build())
  } catch (err) {
    planError = err instanceof Error ? err.message : String(err)
  }

  const { result, sends } = await traceLegacyDestinations(legacy)
  if (!plan) {
    // The plan shares the legacy resolver, so legacy usually failed the same
    // way (and logged it). A difference only if legacy still posted.
    const posted = sends.some((s) => s.ref.startsWith(`${route.split(":")[0]}:`))
    const line = { route, error: planError, legacy_posted: posted }
    if (posted) logger.warn("notify.destinations.shadow planning failed", line)
    else logger.info("notify.destinations.shadow planning failed", line)
    return { path: "legacy", result }
  }
  try {
    await outsideDestinationTrace(() => compare(route, plan!, sends))
  } catch (err) {
    logger.warn("notify.destinations.shadow compare failed", {
      route,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return { path: "legacy", result }
}

/** A body without its embeds' timestamps (the send time on both paths). */
export function comparableBody(body: unknown): string {
  return JSON.stringify(body, (key, value) => {
    if (key === "embeds" && Array.isArray(value)) {
      return value.map((e) => {
        if (!e || typeof e !== "object") return e
        const rest = { ...(e as Record<string, unknown>) }
        delete rest.timestamp
        return rest
      })
    }
    return value
  })
}

async function compare(route: DestinationRoute, plan: DestinationPlan, allSends: LegacyDestinationSend[]) {
  const prefix = `${plan.channel}:`
  const sends = allSends.filter((s) => s.ref.startsWith(prefix))
  const planned: string[] = uniqueDestinations(plan.destinations).map((d) => d.ref)
  if (!planned.length && !sends.length) return

  const legacyRefs = sends.map((s) => s.ref)
  const missing = [...new Set(legacyRefs.filter((r) => !planned.includes(r)))]
  const extra = planned.filter((r) => !legacyRefs.includes(r))
  // notify() posts each destination once; legacy posting one twice is a difference too.
  const duplicated = [...new Set(legacyRefs.filter((r, i) => legacyRefs.indexOf(r) !== i))]

  const payloadMismatch: string[] = []
  let renderError: string | undefined
  const both = sends.filter((s) => planned.includes(s.ref))
  if (both.length) {
    try {
      const body = comparableBody(await plan.render())
      for (const s of both) {
        if (comparableBody(s.body) !== body && !payloadMismatch.includes(s.ref)) payloadMismatch.push(s.ref)
      }
    } catch (err) {
      renderError = err instanceof Error ? err.message : String(err)
    }
  }

  const line = {
    route,
    entity_id: plan.entityId,
    match: !missing.length && !extra.length && !duplicated.length && !payloadMismatch.length && !renderError,
    legacy: sends.length,
    planned: planned.length,
    missing: missing.slice(0, 10),
    extra: extra.slice(0, 10),
    duplicated: duplicated.slice(0, 10),
    payload_mismatch: payloadMismatch.slice(0, 10),
    ...(renderError ? { render_error: renderError } : {}),
  }
  if (line.match) logger.info("notify.destinations.shadow", line)
  else logger.warn("notify.destinations.shadow", line)
}
