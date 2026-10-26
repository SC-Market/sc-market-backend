/**
 * Shadow mode for the high-volume events (orders, offers, messages): the
 * legacy code keeps sending; notify() plans the same event in shadow mode
 * (nothing is written or sent); both delivery sets are compared and the
 * result is logged as one `notify.shadow` line per event:
 *
 *   notify.shadow { event, entity_id, match, legacy, planned, missing, extra }
 *
 * `missing` = delivered by legacy but not planned; `extra` = planned but not
 * delivered by legacy. Parity is proven when real traffic shows no mismatch;
 * then the event is switched to notify() and its legacy code removed.
 *
 * The legacy side is captured by trace.ts at the legacy write points:
 * - in_app: notification rows inserted for the event's action;
 * - push: sendPushNotification calls whose preference check passed;
 * - email: sendNotificationEmail calls (enqueued) whose preference check
 *   would pass in the queue consumer (the same isEmailEnabled lookup).
 *
 * Shadow planning runs before the legacy call (chat collapse depends on the
 * unread state the legacy call then changes) and never affects it: any
 * shadow error is logged and swallowed. NOTIFY_SHADOW=off disables it.
 */
import { env } from "../../config/env.js"
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"
import * as emailPreferenceDb from "../../api/routes/v1/email/database.js"
import { eventDefinition, type EventKey } from "./catalog.js"
import type { UserChannel, UserRecipient } from "./channels.js"
import { notify, type NotifyOptions } from "./dispatcher.js"
import { actionTypeId } from "./preferences.js"
import { currentTrace, outsideTrace, traceLegacy, type LegacyTrace } from "./trace.js"

export interface ShadowPlan {
  event: EventKey
  recipients: UserRecipient[]
  opts: Omit<NotifyOptions, "shadow" | "messages"> & { messages?: NotifyOptions["messages"] }
}

type Key = string
const keyOf = (userId: string, contractorId: string | null | undefined, channel: UserChannel) =>
  `${channel}:${userId}:${contractorId ?? ""}`

function shadowEnabled(): boolean {
  return (env as Record<string, string | undefined>).NOTIFY_SHADOW !== "off"
}

/**
 * Run `legacy` (always) and compare what it delivered with what notify()
 * would deliver for `plans`. Returns legacy's result.
 */
export async function withShadow<T>(plans: ShadowPlan[], legacy: () => Promise<T>): Promise<T> {
  // Nested legacy calls (createOrderNotification -> createOrderAssignedNotification)
  // are part of the outer shadow comparison.
  if (!shadowEnabled() || !plans.length || currentTrace()) return legacy()

  const planned = new Map<EventKey, Set<Key>>()
  try {
    await outsideTrace(async () => {
      for (const p of plans) {
        const r = await notify(p.event, p.recipients, { ...p.opts, messages: p.opts.messages ?? {}, shadow: true })
        const set = planned.get(p.event) ?? new Set<Key>()
        for (const d of r.planned) set.add(keyOf(d.userId, d.contractorId, d.channel))
        planned.set(p.event, set)
      }
    })
  } catch (err) {
    logger.warn("notify.shadow planning failed", { error: err instanceof Error ? err.message : String(err) })
    return legacy()
  }

  const { result, trace } = await traceLegacy(legacy)

  try {
    await outsideTrace(() => compare(plans, planned, trace))
  } catch (err) {
    logger.warn("notify.shadow compare failed", { error: err instanceof Error ? err.message : String(err) })
  }
  return result
}

async function compare(plans: ShadowPlan[], planned: Map<EventKey, Set<Key>>, trace: LegacyTrace) {
  // Rows added to an existing (collapsed chat) object: look its action up.
  const unknown = [...new Set(trace.inApp.map((r) => r.objectId))].filter((id) => !trace.objects.has(id))
  if (unknown.length) {
    const rows: { notification_object_id: string; action_type_id: number }[] = await getKnex()(
      "notification_object",
    )
      .whereIn("notification_object_id", unknown)
      .select("notification_object_id", "action_type_id")
    for (const r of rows) trace.objects.set(r.notification_object_id, Number(r.action_type_id))
  }
  const events = [...new Set(plans.map((p) => p.event))]
  for (const event of events) {
    const def = eventDefinition(event)
    const actionId = await actionTypeId(def.legacyAction)
    const entity = plans.find((p) => p.event === event)!.opts.entityId
    const legacy = new Set<Key>()

    // In-app rows have no org scope; compare them by user.
    for (const row of trace.inApp) {
      if (trace.objects.get(row.objectId) === actionId) legacy.add(`in_app:${row.userId}`)
    }
    for (const p of trace.push) {
      if (p.action === def.legacyAction && p.enabled) legacy.add(keyOf(p.userId, p.contractorId, "push"))
    }
    for (const e of trace.email) {
      if (e.action !== def.legacyAction) continue
      if (await emailPreferenceDb.isEmailEnabled(e.userId, actionId, e.contractorId)) {
        legacy.add(keyOf(e.userId, e.contractorId, "email"))
      }
    }

    const plannedRaw = planned.get(event) ?? new Set<Key>()
    const plannedSet = new Set<Key>(
      [...plannedRaw].map((k) => (k.startsWith("in_app:") ? k.split(":").slice(0, 2).join(":") : k)),
    )
    const missing = [...legacy].filter((k) => !plannedSet.has(k))
    const extra = [...plannedSet].filter((k) => !legacy.has(k))
    const line = {
      event,
      entity_id: entity,
      match: missing.length === 0 && extra.length === 0,
      legacy: legacy.size,
      planned: plannedSet.size,
      missing: missing.slice(0, 10),
      extra: extra.slice(0, 10),
    }
    if (line.match) logger.info("notify.shadow", line)
    else logger.warn("notify.shadow", line)
  }
}
