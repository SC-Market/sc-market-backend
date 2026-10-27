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
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"
import { eventDefinition, isMandatory, type EventKey } from "./catalog.js"
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
  /**
   * "unread": one in-app notification per entity while it is unread (chat
   * messages). The existing object is reused and bumped; a recipient who
   * still has it unread gets nothing on any channel.
   */
  collapse?: "unread"
  /** What each channel delivers; may depend on the recipient. */
  messages: RenderedMessages | ((recipient: UserRecipient) => RenderedMessages)
  /**
   * Merged events only: the action this occurrence is (which order status;
   * new or counter offer). Its in-app row and channel messages use it, so
   * they still say which; preferences are read across all merged actions.
   */
  legacyAction?: string
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

/** A Discord DM built from the push payload, for events without their own DM. */
function dmFromPush(push: NonNullable<RenderedMessages["push"]>) {
  const url = push.data?.url
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: push.title.slice(0, 256),
        description: `${push.body}${url ? `\n\n[Open on SC Market](${url})` : ""}`.slice(0, 4000),
        url,
        color: 0x10b881,
      },
    ],
  }
}

export async function notify(
  eventKey: EventKey,
  recipientsIn: UserRecipient[],
  opts: NotifyOptions,
): Promise<NotifyResult> {
  const def = eventDefinition(eventKey)
  const result: NotifyResult = { planned: [], delivered: [], failed: [], duplicate: [] }
  if (opts.legacyAction && !def.mergedActions?.includes(opts.legacyAction)) {
    throw new Error(`${opts.legacyAction} is not one of ${String(eventKey)}'s actions`)
  }
  const occurrenceAction = opts.legacyAction ?? def.legacyAction

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
    // 1b. Collapse: drop recipients who still have this entity unread.
    let collapseObjectId: string | null = null
    if (opts.collapse === "unread") {
      const action = await notificationDb.getNotificationActionByName(occurrenceAction)
      const existing = await notificationDb.getNotificationObjectByEntityAndAction(
        opts.entityId,
        action.action_type_id,
      )
      if (existing) {
        collapseObjectId = existing.notification_object_id
        const unread: string[] = await getKnex()("notification")
          .where({ notification_object_id: collapseObjectId, read: false })
          .whereIn("notifier_id", recipients.map((r) => r.userId))
          .pluck("notifier_id")
        const keep = recipients.filter((r) => !unread.includes(r.userId))
        recipients.splice(0, recipients.length, ...keep)
        if (!opts.shadow) {
          // As the legacy chat notifications did: every new message bumps the
          // conversation's notification and records its author, whether or
          // not anyone needs a new notification row.
          await notificationDb.updateNotificationObjectTimestamp(collapseObjectId)
          if (opts.actorId) {
            await notificationDb.insertNotificationChange([
              { notification_object_id: collapseObjectId, actor_id: opts.actorId },
            ])
          }
        }
      }
    }

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

    // 4a. In-app: one notification object for the event (or the collapsed one).
    const inApp = toSend.filter((d) => d.channel === "in_app")
    if (inApp.length) {
      try {
        let objectId = collapseObjectId
        if (!objectId) {
          const action = await notificationDb.getNotificationActionByName(occurrenceAction)
          const [object] = await notificationDb.insertNotificationObjects([
            { action_type_id: action.action_type_id, entity_id: opts.entityId },
          ])
          objectId = object.notification_object_id
          if (opts.actorId) {
            await notificationDb.insertNotificationChange([
              { notification_object_id: objectId, actor_id: opts.actorId },
            ])
          }
        }
        await notificationDb.insertNotifications(
          inApp.map((d) => ({ notification_object_id: objectId!, notifier_id: d.userId })),
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
      const msg = channel === "discord_dm" && !messages.discord_dm && messages.push
        ? dmFromPush(messages.push)
        : messages[channel]
      let outcome: DeliveryResult
      if (msg === undefined) {
        outcome = { status: "skipped", reason: `no ${d.channel} message for ${eventKey}` }
      } else {
        try {
          outcome = await adapters[channel].send(msg as never, {
            eventKey,
            legacyAction: occurrenceAction,
            recipient,
            idempotencyKey: keyOf(d),
            mandatory: isMandatory(def),
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
