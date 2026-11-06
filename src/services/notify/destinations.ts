/**
 * notifyDestinations(): notify()'s destination side (Phase 5,
 * drafts/notifications-design.md §2.3). Webhooks and Discord alert-channel
 * posts go through here, with the same delivery log, idempotency and
 * failure handling as the user channels:
 *
 * 1. a plan (built next to the legacy sender, which uses the same resolver
 *    and payload builder) names the event, the channel, the destinations and
 *    how to render the body;
 * 2. each (destination, occurrence) is claimed in notification_deliveries
 *    (destination_ref, no user), so a retried request never posts twice;
 * 3. the body is rendered once and posted to each destination in turn, in
 *    order, through the channel's adapter (adapters/webhook.ts,
 *    adapters/discord-channel.ts), as the legacy loop did;
 * 4. each outcome is recorded: sent, skipped, or failed (retryable or
 *    permanent, with the error).
 *
 * Destinations are gated by their own configuration, which the plan's
 * resolver reads (webhook_actions, the Discord setup flags,
 * STAFF_DISCORD_WEBHOOK_URL), not by user preferences or org mutes. Test
 * accounts are excluded by the resolvers (involvesTestParty) and the
 * transports (actingAsTestAccount), as before.
 *
 * Never throws. Which path posts (legacy, or this one) is
 * destination-cutover.ts; shadow mode is deliverDestinations().
 */
import logger from "../../logger/logger.js"
import type { DeliveryResult, Destination, DestinationAdapter, DestinationChannel } from "./channels.js"
import { claimDeliveries, finishDelivery, idempotencyKey } from "./deliveries.js"
import { webhookAdapter } from "./adapters/webhook.js"
import { discordChannelAdapter } from "./adapters/discord-channel.js"

/**
 * The destination events, per channel. Event keys follow the user catalog's
 * where they mean the same occurrence; the channel tells them apart in
 * notification_deliveries.
 */
export const DESTINATION_EVENTS = {
  webhook: [
    "order.created",
    "order.assigned",
    "order.status_changed",
    "offer.received",
    "order.review",
    "market.bid",
    "contract.public_created",
    "admin.storefront_enquiry",
  ],
  discord_channel: ["order.created", "offer.received", "contract.public_created"],
} as const satisfies Record<DestinationChannel, readonly string[]>

export type DestinationEvent<C extends DestinationChannel = DestinationChannel> =
  (typeof DESTINATION_EVENTS)[C][number]

/** "<channel>:<event>", the unit the live switch works in. */
export type DestinationRoute = {
  [C in DestinationChannel]: `${C}:${(typeof DESTINATION_EVENTS)[C][number]}`
}[DestinationChannel]

export const DESTINATION_ROUTES: readonly DestinationRoute[] = (
  Object.entries(DESTINATION_EVENTS) as [DestinationChannel, readonly string[]][]
).flatMap(([channel, events]) => events.map((e) => `${channel}:${e}` as DestinationRoute))

export interface DestinationPlan {
  channel: DestinationChannel
  event: DestinationEvent
  /** The entity the post is about (order, offer session, listing, contract, enquiry). */
  entityId: string
  /**
   * Identifies this occurrence for idempotency (e.g. the order for "Order
   * Placed"; a fresh id where the same entity legitimately repeats the event,
   * like a status change).
   */
  dedupeKey: string
  destinations: Destination[]
  /** The body every destination of this plan gets (rendered once, only if there is a destination). */
  render: () => Promise<unknown> | unknown
}

export function routeOf(plan: Pick<DestinationPlan, "channel" | "event">): DestinationRoute {
  return `${plan.channel}:${plan.event}` as DestinationRoute
}

export interface DestinationDeliveryResult {
  /** Destination refs, in plan order. */
  planned: string[]
  delivered: string[]
  skipped: string[]
  failed: { ref: string; permanent: boolean; error: string }[]
  /** Already claimed by an earlier call for the same occurrence. */
  duplicate: string[]
}

const DEFAULT_ADAPTERS: Record<DestinationChannel, DestinationAdapter> = {
  webhook: webhookAdapter,
  discord_channel: discordChannelAdapter,
}
let adapters = DEFAULT_ADAPTERS

/** Tests: replace destination adapters (e.g. with recording fakes). */
export function setDestinationAdaptersForTesting(next: Partial<Record<DestinationChannel, DestinationAdapter>> | null) {
  adapters = next ? { ...DEFAULT_ADAPTERS, ...next } : DEFAULT_ADAPTERS
}

/** One destination once, in plan order (the legacy senders' order). */
export function uniqueDestinations(destinations: Destination[]): Destination[] {
  const seen = new Set<string>()
  return destinations.filter((d) => (seen.has(d.ref) ? false : (seen.add(d.ref), true)))
}

export function destinationKey(plan: DestinationPlan, ref: string, mode: "live" | "shadow" = "live"): string {
  return idempotencyKey([mode, "destination", plan.channel, plan.event, plan.dedupeKey, ref])
}

export async function notifyDestinations(plan: DestinationPlan): Promise<DestinationDeliveryResult> {
  const result: DestinationDeliveryResult = { planned: [], delivered: [], skipped: [], failed: [], duplicate: [] }
  const route = routeOf(plan)
  try {
    if (!(DESTINATION_ROUTES as readonly string[]).includes(route)) {
      throw new Error(`Unknown destination route ${route}`)
    }
    const destinations = uniqueDestinations(plan.destinations)
    if (!destinations.length) return result
    result.planned = destinations.map((d) => d.ref)

    const won = await claimDeliveries(
      destinations.map((d) => ({
        idempotencyKey: destinationKey(plan, d.ref),
        eventKey: plan.event,
        channel: plan.channel,
        userId: null,
        contractorId: null,
        entityId: plan.entityId,
        destinationRef: d.ref,
      })),
    )
    const toSend = destinations.filter((d) => {
      if (won.has(destinationKey(plan, d.ref))) return true
      result.duplicate.push(d.ref)
      return false
    })
    if (!toSend.length) return result

    let body: unknown
    try {
      body = await plan.render()
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      logger.error("notify: destination render failed", { event: plan.event, channel: plan.channel, error })
      for (const d of toSend) {
        result.failed.push({ ref: d.ref, permanent: false, error })
        await finishDelivery(destinationKey(plan, d.ref), "failed", error)
      }
      return result
    }

    for (const d of toSend) {
      const key = destinationKey(plan, d.ref)
      let outcome: DeliveryResult
      try {
        outcome = await adapters[plan.channel].send(body, d, { eventKey: plan.event, idempotencyKey: key })
      } catch (err) {
        outcome = { status: "retryable", error: err instanceof Error ? err.message : String(err) }
      }
      if (outcome.status === "sent") {
        result.delivered.push(d.ref)
        await finishDelivery(key, "sent")
      } else if (outcome.status === "skipped") {
        result.skipped.push(d.ref)
        await finishDelivery(key, "skipped", outcome.reason)
      } else {
        const permanent = outcome.status === "permanent"
        result.failed.push({ ref: d.ref, permanent, error: outcome.error })
        logger.warn("notify: delivery failed", {
          event: plan.event,
          channel: plan.channel,
          destination: d.ref,
          permanent,
          error: outcome.error,
        })
        await finishDelivery(key, "failed", `${outcome.status}: ${outcome.error}`)
      }
    }
  } catch (err) {
    logger.error("notify: destinations failed", {
      event: plan.event,
      channel: plan.channel,
      entity_id: plan.entityId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return result
}
