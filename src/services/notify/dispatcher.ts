/**
 * notify(): the single entry point for user notifications.
 * See drafts/notifications-design.md §2.2.
 *
 * For one event and a list of recipients:
 * 1. deduplicates recipients (same user and org scope);
 * 2. resolves each recipient's preferences per channel (preferences.ts);
 * 3. claims each (recipient, channel) delivery in notification_deliveries, so
 *    the same event is never delivered twice to the same place;
 * 4. writes the in-app rows (one notification object for the event, as the
 *    legacy code does) and sends the other channels through their adapters.
 *
 * notify() never throws because a delivery failed: failures are logged and
 * recorded. It throws only for programmer errors (unknown event).
 *
 * Shadow mode (`shadow: true`) computes and records the deliveries it WOULD
 * make (status 'shadow') without writing or sending anything, so a migration
 * can be compared with the legacy path on real traffic before switching.
 */
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import logger from "../../logger/logger.js"
import { eventDefinition, type EventKey } from "./catalog.js"
import type {
  DeliveryResult,
  RenderedMessages,
  UserChannel,
  UserChannelAdapter,
  UserRecipient,
} from "./channels.js"
import { claimDeliveries, finishDelivery, idempotencyKey } from "./deliveries.js"
import { recipientKey, resolvePreferences } from "./preferences.js"
import { pushAdapter } from "./adapters/push.js"
import { emailAdapter } from "./adapters/email.js"
import { discordDmAdapter } from "./adapters/discord-dm.js"

export interface NotifyOptions {
  /** The entity the in-app notification points at (order, offer session, listing, ...). */
  entityId: string
  /** The user whose action raised the event; recorded on the in-app row. Not notified. */
  actorId?: string | null
  /**
   * Identifies this occurrence of the event for idempotency. Defaults to
   * entityId; pass something more specific when the same entity can raise
   * the same event again legitimately (a new bid, a new price).
   */
  dedupeKey?: string
  /** Keep the actor as a recipient (price alerts: the watcher is the actor). */
  notifyActor?: boolean
  /** Restrict this call to some of the event's channels. */
  channels?: readonly UserChannel[]
  /** What each channel delivers; may depend on the recipient. */
  messages: RenderedMessages | ((recipient: UserRecipient) => RenderedMessages)
  shadow?: boolean
}

export interface PlannedDelivery {
  userId: string
  contractorId: string | null
  channel: UserChannel
}

export interface NotifyResult {
  planned: PlannedDelivery[]
  delivered: PlannedDelivery[]
  failed: PlannedDelivery[]
  /** Deliveries already made by an earlier call with the same idempotency key. */
  duplicate: PlannedDelivery[]
}

type Adapters = Record<Exclude<UserChannel, "in_app">, UserChannelAdapter<never>>

const DEFAULT_ADAPTERS = {
  push: pushAdapter,
  email: emailAdapter,
  discord_dm: discordDmAdapter,
} as unknown as Adapters

let adapters: Adapters = DEFAULT_ADAPTERS

/** Tests: replace channel adapters (e.g. with recording fakes). */
export function setAdaptersForTesting(next: Partial<Adapters> | null) {
  adapters = next ? { ...DEFAULT_ADAPTERS, ...next } : DEFAULT_ADAPTERS
}

const CHANNEL_ORDER: readonly UserChannel[] = ["in_app", "push", "email", "discord_dm"]

/** Deliveries in flight at once for one notify() call. */
const SEND_CONCURRENCY = 8

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

export async function notify(
  eventKey: EventKey,
  recipientsIn: UserRecipient[],
  opts: NotifyOptions,
): Promise<NotifyResult> {
  const def = eventDefinition(eventKey)
  const result: NotifyResult = { planned: [], delivered: [], failed: [], duplicate: [] }

  // 1. Recipients: one per (user, org scope), never the actor unless asked.
  const seen = new Set<string>()
  const recipients: UserRecipient[] = []
  for (const r of recipientsIn) {
    if (!r.userId) continue
    if (!opts.notifyActor && opts.actorId && r.userId === opts.actorId) continue
    const key = recipientKey(r)
    if (seen.has(key)) continue
    seen.add(key)
    recipients.push({ userId: r.userId, contractorId: r.contractorId ?? null })
  }
  if (!recipients.length) return result

  const channels = CHANNEL_ORDER.filter(
    (c) => def.channels.includes(c) && (!opts.channels || opts.channels.includes(c)),
  )

  try {
    // 2. Preferences.
    const prefs = await resolvePreferences(def, recipients, channels)
    for (const r of recipients) {
      const p = prefs.get(recipientKey(r)) ?? {}
      for (const c of channels) {
        if (p[c]) result.planned.push({ userId: r.userId, contractorId: r.contractorId ?? null, channel: c })
      }
    }
    if (!result.planned.length) return result

    // 3. Claim.
    const dedupe = opts.dedupeKey ?? opts.entityId
    const keyOf = (d: PlannedDelivery) =>
      idempotencyKey([opts.shadow ? "shadow" : "live", eventKey, dedupe, d.userId, d.contractorId, d.channel])
    const won = await claimDeliveries(
      result.planned.map((d) => ({
        idempotencyKey: keyOf(d),
        eventKey,
        channel: d.channel,
        userId: d.userId,
        contractorId: d.contractorId,
        entityId: opts.entityId,
        status: opts.shadow ? "shadow" : "pending",
      })),
    )
    const toSend = result.planned.filter((d) => {
      if (won.has(keyOf(d))) return true
      result.duplicate.push(d)
      return false
    })
    if (opts.shadow) return result

    // 4a. In-app: one notification object for the event.
    const inApp = toSend.filter((d) => d.channel === "in_app")
    if (inApp.length) {
      try {
        const action = await notificationDb.getNotificationActionByName(def.legacyAction)
        const [object] = await notificationDb.insertNotificationObjects([
          { action_type_id: action.action_type_id, entity_id: opts.entityId },
        ])
        if (opts.actorId) {
          await notificationDb.insertNotificationChange([
            { notification_object_id: object.notification_object_id, actor_id: opts.actorId },
          ])
        }
        await notificationDb.insertNotifications(
          inApp.map((d) => ({ notification_object_id: object.notification_object_id, notifier_id: d.userId })),
        )
        for (const d of inApp) {
          result.delivered.push(d)
          await finishDelivery(keyOf(d), "sent")
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        logger.error("notify: in-app write failed", { event: eventKey, error })
        for (const d of inApp) {
          result.failed.push(d)
          await finishDelivery(keyOf(d), "failed", error)
        }
      }
    }

    // 4b. Other channels, a few recipients at a time (admin alerts reach
    // every user; the legacy bulk push ran them all in parallel).
    await forEachLimit(toSend.filter((d) => d.channel !== "in_app"), SEND_CONCURRENCY, async (d) => {
      const channel = d.channel as Exclude<UserChannel, "in_app">
      const recipient = { userId: d.userId, contractorId: d.contractorId }
      const messages = typeof opts.messages === "function" ? opts.messages(recipient) : opts.messages
      const msg = messages[channel]
      let outcome: DeliveryResult
      if (msg === undefined) {
        outcome = { status: "skipped", reason: `no ${d.channel} message for ${eventKey}` }
      } else {
        try {
          outcome = await adapters[channel].send(msg as never, {
            eventKey,
            legacyAction: def.legacyAction,
            recipient,
            idempotencyKey: keyOf(d),
          })
        } catch (err) {
          outcome = { status: "retryable", error: err instanceof Error ? err.message : String(err) }
        }
      }
      if (outcome.status === "sent") {
        result.delivered.push(d)
        await finishDelivery(keyOf(d), "sent")
      } else if (outcome.status === "skipped") {
        await finishDelivery(keyOf(d), "skipped", outcome.reason)
      } else {
        result.failed.push(d)
        logger.warn("notify: delivery failed", {
          event: eventKey,
          channel: d.channel,
          user_id: d.userId,
          error: outcome.error,
        })
        await finishDelivery(keyOf(d), "failed", outcome.error)
      }
    })
  } catch (err) {
    logger.error("notify: failed", {
      event: eventKey,
      entity_id: opts.entityId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return result
}
