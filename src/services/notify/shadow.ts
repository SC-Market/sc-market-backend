/**
 * Shadow mode for the high-volume events (orders, offers, messages): the
 * legacy code keeps sending; notify() plans the same event in shadow mode
 * (nothing is written or sent); both delivery sets are compared and the
 * result is logged as one `notify.shadow` line per event:
 *
 *   notify.shadow { event, entity_id, match, exact, legacy, planned,
 *                   missing, extra, expected }
 *
 * `missing` = delivered by legacy but not planned; `extra` = planned but not
 * delivered by legacy. Both list only UNEXPECTED differences; `match` is true
 * when there are none. Differences the owner decided on (they ship with the
 * cutover) are listed under `expected`, by reason, and don't break `match`;
 * `exact` is true only when legacy and plan are identical. Reasons:
 *
 * - duplicate_role: legacy delivered more than once to the same place (a
 *   member holding two roles with the permission); notify() delivers once.
 * - actor_excluded: legacy notified the user who acted; notify() never does.
 * - buy_now_normal_path: buy-now orders go through the normal order
 *   notification (in-app, email, org-scoped push preferences) instead of the
 *   V2 push-only one.
 * - permission_scope: legacy reached an org member the permission helper
 *   excludes (no longer a member, or banned).
 * - customer_scope: the customer's push/email follow their Personal
 *   preferences; legacy read them under the seller org's.
 * - unassigned_to_managers: messages on an unassigned org order/offer also go
 *   to the org's manage_orders members.
 * (Merged events read the occurrence's own per-status preference, exactly as
 * legacy does, so they add no difference.)
 *
 * Parity is proven when real traffic shows no unexpected difference; then the
 * event is switched to notify() and its legacy code removed.
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

export type ExpectedReason =
  | "duplicate_role"
  | "actor_excluded"
  | "buy_now_normal_path"
  | "permission_scope"
  | "customer_scope"
  | "unassigned_to_managers"

export interface ShadowDiff {
  kind: "missing" | "extra"
  channel: UserChannel
  userId: string
  /** Absent for in-app (in-app rows have no org scope). */
  contractorId: string | null | undefined
}

export interface ShadowPlan {
  event: EventKey
  recipients: UserRecipient[]
  opts: Omit<NotifyOptions, "shadow" | "messages"> & { messages?: NotifyOptions["messages"] }
  /**
   * The legacy actions whose deliveries this plan replaces. Default: the
   * occurrence's action (opts.legacyAction, else the event's).
   */
  legacyActions?: string[]
  /** Plan-specific expected differences (owner decisions), beyond the generic ones. */
  explain?: (d: ShadowDiff) => ExpectedReason | undefined
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

function legacyActionsOf(p: ShadowPlan): string[] {
  return p.legacyActions ?? [p.opts.legacyAction ?? eventDefinition(p.event).legacyAction]
}

function parseKey(k: Key): { channel: UserChannel; userId: string; contractorId: string | null | undefined } {
  const [channel, userId, scope] = k.split(":")
  return { channel: channel as UserChannel, userId, contractorId: channel === "in_app" ? undefined : scope || null }
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
    const eventPlans = plans.filter((p) => p.event === event)
    const entity = eventPlans[0].opts.entityId
    const actions = [...new Set(eventPlans.flatMap(legacyActionsOf))]
    const actionIds = new Map<number, string>()
    for (const a of actions) {
      try {
        actionIds.set(await actionTypeId(a), a)
      } catch {
        // An action with no notification_actions row (order_create_v2): push-only, never in-app.
      }
    }

    // What legacy delivered, with multiplicity (duplicates are a difference too).
    const legacy = new Map<Key, number>()
    const bump = (k: Key) => legacy.set(k, (legacy.get(k) ?? 0) + 1)
    // In-app rows have no org scope; compare them by user.
    for (const row of trace.inApp) {
      const id = trace.objects.get(row.objectId)
      if (id !== undefined && actionIds.has(id)) bump(`in_app:${row.userId}`)
    }
    for (const p of trace.push) {
      if (p.action && actions.includes(p.action) && p.enabled) bump(keyOf(p.userId, p.contractorId, "push"))
    }
    for (const e of trace.email) {
      if (!actions.includes(e.action)) continue
      if (await emailPreferenceDb.isEmailEnabled(e.userId, await actionTypeId(e.action), e.contractorId)) {
        bump(keyOf(e.userId, e.contractorId, "email"))
      }
    }

    const plannedRaw = planned.get(event) ?? new Set<Key>()
    const plannedSet = new Set<Key>(
      [...plannedRaw].map((k) => (k.startsWith("in_app:") ? k.split(":").slice(0, 2).join(":") : k)),
    )

    const expected: Partial<Record<ExpectedReason, Key[]>> = {}
    const missing: Key[] = []
    const extra: Key[] = []
    const explainers = eventPlans.map((p) => p.explain).filter((f): f is NonNullable<typeof f> => !!f)
    const actorIds = new Set(eventPlans.filter((p) => !p.opts.notifyActor && p.opts.actorId).map((p) => p.opts.actorId!))

    const classify = async (kind: "missing" | "extra", k: Key): Promise<ExpectedReason | undefined> => {
      const d: ShadowDiff = { kind, ...parseKey(k) }
      if (kind === "missing" && actorIds.has(d.userId)) return "actor_excluded"
      for (const f of explainers) {
        const reason = f(d)
        if (reason) return reason
      }
      return undefined
    }

    for (const [k, n] of legacy) {
      if (plannedSet.has(k)) {
        if (n > 1) (expected.duplicate_role ??= []).push(k)
        continue
      }
      const reason = await classify("missing", k)
      if (reason) (expected[reason] ??= []).push(k)
      else missing.push(k)
    }
    for (const k of plannedSet) {
      if (legacy.has(k)) continue
      const reason = await classify("extra", k)
      if (reason) (expected[reason] ??= []).push(k)
      else extra.push(k)
    }

    const expectedCounts = Object.fromEntries(Object.entries(expected).map(([r, ks]) => [r, ks!.length]))
    const line = {
      event,
      entity_id: entity,
      match: missing.length === 0 && extra.length === 0,
      exact: missing.length === 0 && extra.length === 0 && Object.keys(expected).length === 0,
      legacy: [...legacy.values()].reduce((a, b) => a + b, 0),
      planned: plannedSet.size,
      missing: missing.slice(0, 10),
      extra: extra.slice(0, 10),
      expected: expectedCounts,
    }
    if (line.match) logger.info("notify.shadow", line)
    else logger.warn("notify.shadow", line)
  }
}
