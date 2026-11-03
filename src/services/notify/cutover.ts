/**
 * Cutover: which of the shadowed events (orders, offers, chat messages)
 * notify() delivers live. See drafts/notifications-design.md, Phase 7.
 *
 * For a live event, notify() is the only sender: the legacy code in
 * notification.service.ts is not called and no shadow comparison runs. Every
 * other shadowed event keeps the legacy sender with notify() in shadow mode
 * (shadow.ts). The choice is made once per call, so one occurrence is never
 * sent by both paths.
 *
 * The live list is LIVE_EVENTS_DEFAULT unless NOTIFY_LIVE_EVENTS is set:
 * - a comma-separated list of event keys replaces the default entirely (to
 *   revert one event, list the others);
 * - "none" (or an empty value) reverts every event to legacy + shadow.
 * Keys that are not cutover events are logged and ignored. The variable is
 * read at each call, so a container environment change takes effect without
 * a code deploy.
 */
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import type { EventKey } from "./catalog.js"

/** The events with a legacy sender and a shadow plan (notification.service.ts). */
export const CUTOVER_EVENTS = [
  "order.created",
  "order.assigned",
  "order.status_changed",
  "order.message",
  "offer.received",
  "offer.message",
] as const satisfies readonly EventKey[]
export type CutoverEvent = (typeof CUTOVER_EVENTS)[number]

/**
 * Owner-approved 2026-10-31: every shadow line on production traffic
 * (Oct 26-31) matched, with no unexpected difference. order.status_changed
 * covers the four order statuses and offer.received covers new and counter
 * offers (the shadow lines from before the merge named them
 * order.status.* and offer.created).
 *
 * Buy now orders (owner decision 2026-11-02) are ordinary new orders
 * (services/notifications/new-order.ts), so they follow order.created and
 * order.assigned here; they have no shadow path of their own any more.
 */
export const LIVE_EVENTS_DEFAULT: readonly CutoverEvent[] = [
  "order.created",
  "order.assigned",
  "order.status_changed",
  "order.message",
  "offer.received",
  "offer.message",
]

let parsed: { raw: string | undefined; live: ReadonlySet<CutoverEvent> } | undefined

export function liveEvents(): ReadonlySet<CutoverEvent> {
  const raw = (env as Record<string, string | undefined>).NOTIFY_LIVE_EVENTS
  if (parsed && parsed.raw === raw) return parsed.live
  let live: Set<CutoverEvent>
  if (raw === undefined) {
    live = new Set(LIVE_EVENTS_DEFAULT)
  } else {
    live = new Set()
    const keys = raw.trim().toLowerCase() === "none" ? [] : raw.split(",").map((k) => k.trim()).filter(Boolean)
    const ignored: string[] = []
    for (const k of keys) {
      if ((CUTOVER_EVENTS as readonly string[]).includes(k)) live.add(k as CutoverEvent)
      else ignored.push(k)
    }
    if (ignored.length) {
      logger.error("NOTIFY_LIVE_EVENTS: ignoring keys that are not cutover events", {
        ignored,
        cutover_events: CUTOVER_EVENTS,
      })
    }
  }
  parsed = { raw, live }
  logger.info("notify.cutover live events", { live: [...live], source: raw === undefined ? "default" : "env" })
  return live
}

export function isLive(event: CutoverEvent): boolean {
  return liveEvents().has(event)
}
