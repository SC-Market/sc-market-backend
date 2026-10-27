/**
 * Who notify() would notify for the order, offer and chat events, computed
 * independently of the legacy notification.service.ts code. Shadow mode
 * (shadow.ts) compares these plans with what the legacy code delivers; once
 * they agree on real traffic, these become the live implementation.
 *
 * They already carry the owner's decisions that ship with the cutover; the
 * shadow lines report those as expected differences (shadow.ts):
 * - the actor (whoever did it: the member claiming or assigning, the member
 *   making an offer) is never notified;
 * - org-side recipients are the members holding the event's permission,
 *   once each, current members only, banned accounts excluded
 *   (recipients.ts): "duplicate_role", "permission_scope";
 * - the customer is on their Personal preferences, not the seller org's:
 *   "customer_scope";
 * - messages and customer reviews on an unassigned org order or offer go to
 *   the org's manage_orders members: "unassigned_to_managers";
 * - order.status_changed replaces the four order.status.* events, and
 *   offer.received replaces offer.created / offer.countered; the occurrence's
 *   own action (legacyAction) keeps the message saying which, and its own
 *   per-status preference applies;
 * - buy-now orders use the normal order notification (buyNowOrderPlans).
 */
import { randomUUID } from "node:crypto"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import { getKnex } from "../../clients/database/knex-db.js"
import type { DBMessage, DBOfferSession, DBOrder } from "../../clients/database/db-models.js"
import type { UserRecipient } from "./channels.js"
import type { EventKey } from "./catalog.js"
import { ORDER_STATUS_ACTIONS } from "./catalog.js"
import { orgMembersWithPermission, type OrgPermission } from "./recipients.js"
import type { ExpectedReason, ShadowDiff, ShadowPlan } from "./shadow.js"

type Explain = (d: ShadowDiff) => ExpectedReason | undefined

function firstOf(...fs: (Explain | undefined)[]): Explain {
  return (d) => {
    for (const f of fs) {
      const r = f?.(d)
      if (r) return r
    }
    return undefined
  }
}

/**
 * Org members holding a permission, plus an explainer for the members the
 * legacy query (one row per member-role, no membership/ban check) reaches but
 * the helper doesn't.
 */
async function orgSide(contractorId: string, permission: OrgPermission): Promise<{ recipients: UserRecipient[]; explain: Explain }> {
  const [recipients, legacyRows] = await Promise.all([
    orgMembersWithPermission(contractorId, permission),
    contractorDb.getMembersWithMatchingRole(contractorId, { [permission]: true }),
  ])
  const kept = new Set(recipients.map((r) => r.userId))
  const legacy = new Set(legacyRows.map((r) => r.user_id))
  return {
    recipients,
    explain: (d) => (d.kind === "missing" && legacy.has(d.userId) && !kept.has(d.userId) ? "permission_scope" : undefined),
  }
}

/** The customer is on Personal preferences; legacy looked them up under the seller org. */
function customerScope(customerId: string | null | undefined, contractorId: string | null | undefined): Explain {
  return (d) =>
    contractorId && d.userId === customerId && (d.channel === "push" || d.channel === "email")
      ? "customer_scope"
      : undefined
}

function party(userId: string | null | undefined, contractorId: string | null | undefined): UserRecipient[] {
  return userId ? [{ userId, contractorId: contractorId ?? null }] : []
}

export async function orderCreatedPlans(order: DBOrder): Promise<ShadowPlan[]> {
  const plans: ShadowPlan[] = []
  if (order.contractor_id) {
    const org = await orgSide(order.contractor_id, "manage_orders")
    plans.push({
      event: "order.created",
      recipients: org.recipients,
      opts: { entityId: order.order_id, actorId: order.customer_id },
      explain: org.explain,
    })
  }
  if (order.assigned_id) plans.push(...orderAssignedPlans(order))
  return plans
}

/** actorId: who assigned it (a member claiming it for themselves is not notified). */
export function orderAssignedPlans(order: DBOrder, actorId?: string | null): ShadowPlan[] {
  if (!order.assigned_id) return []
  return [
    {
      event: "order.assigned",
      recipients: party(order.assigned_id, order.contractor_id),
      opts: { entityId: order.order_id, actorId: actorId ?? order.customer_id },
    },
  ]
}

/**
 * Buy now (V2 direct purchase): owner decision, the normal order
 * notification instead of the V2 push to the shop's managers. Compared with
 * that V2 push (action order_create_v2): in-app and email are new, and push
 * follows the normal order preferences, org-scoped.
 */
export async function buyNowOrderPlans(order: DBOrder): Promise<ShadowPlan[]> {
  const normal = await orderCreatedPlans(order)
  return normal.map((p) => {
    const ids = new Set(p.recipients.map((r) => r.userId))
    const buyNow: Explain = (d) =>
      (d.kind === "extra" && d.channel !== "push") || (d.channel === "push" && ids.has(d.userId))
        ? "buy_now_normal_path"
        : undefined
    return {
      ...p,
      legacyActions: [p.event === "order.created" ? "order_create" : "order_assigned", "order_create_v2"],
      explain: firstOf(p.explain, buyNow),
    }
  })
}

export function orderStatusPlans(order: DBOrder, newStatus: string, actorId: string): ShadowPlan[] {
  const action = `order_status_${newStatus.replace("-", "_")}`
  if (!(ORDER_STATUS_ACTIONS as readonly string[]).includes(action)) return []
  return [
    {
      event: "order.status_changed",
      recipients: [...party(order.assigned_id, order.contractor_id), ...party(order.customer_id, null)],
      opts: {
        entityId: order.order_id,
        actorId,
        legacyAction: action,
        // One occurrence per status change: an order can go in-progress ->
        // not-started -> in-progress, and each change is notified. The call
        // is not retried, so a per-call id loses no idempotency.
        dedupeKey: `${order.order_id}:${action}:${randomUUID()}`,
      },
      explain: customerScope(order.customer_id, order.contractor_id),
    },
  ]
}

export async function chatMessagePlans(
  thread: { kind: "order"; order: DBOrder } | { kind: "offer"; session: DBOfferSession },
  message: DBMessage,
): Promise<ShadowPlan[]> {
  const t = thread.kind === "order" ? thread.order : thread.session
  const entityId = thread.kind === "order" ? thread.order.order_id : thread.session.id
  const recipients = [...party(t.assigned_id, t.contractor_id), ...party(t.customer_id, null)]
  let explain = customerScope(t.customer_id, t.contractor_id)
  if (!t.assigned_id && t.contractor_id) {
    // Unassigned org order/offer: the org's order managers (owner decision).
    const org = await orgSide(t.contractor_id, "manage_orders")
    const managers = new Set(org.recipients.map((r) => r.userId))
    recipients.push(...org.recipients)
    explain = firstOf(explain, org.explain, (d) =>
      d.kind === "extra" && managers.has(d.userId) && d.userId !== t.customer_id ? "unassigned_to_managers" : undefined,
    )
  }
  return [
    {
      event: thread.kind === "order" ? "order.message" : "offer.message",
      recipients,
      opts: {
        entityId,
        actorId: message.author ?? null,
        dedupeKey: message.message_id,
        collapse: "unread",
      },
      explain,
    },
  ]
}

export async function offerPlans(
  session: DBOfferSession,
  type: "create" | "counteroffer",
): Promise<ShadowPlan[]> {
  const event: EventKey = "offer.received"
  const legacyAction = type === "create" ? "offer_create" : "counter_offer_create"
  // The offer row this notification is about (the newest in the session):
  // its author is the actor (the member offering on a public contract, or the
  // side that countered), and its id makes each counter offer one occurrence.
  const latest: { id: string; actor_id: string | null } | undefined = await getKnex()("order_offers")
    .where({ session_id: session.id })
    .orderBy("timestamp", "desc")
    .first("id", "actor_id")
  const actorId = latest?.actor_id ?? session.customer_id
  const dedupeKey = `${session.id}:${legacyAction}:${latest?.id ?? "none"}`
  const plans: ShadowPlan[] = []
  if (session.contractor_id) {
    // Org managers: in-app, email and (owner decision, ships with the
    // cutover) push, as for new orders. Legacy sends them no push.
    const org = await orgSide(session.contractor_id, "manage_orders")
    const managers = new Set(org.recipients.map((r) => r.userId))
    plans.push({
      event,
      recipients: org.recipients,
      opts: { entityId: session.id, actorId, legacyAction, dedupeKey, channels: ["in_app", "push", "email"] },
      explain: firstOf(org.explain, (d) =>
        d.kind === "extra" && d.channel === "push" && managers.has(d.userId) ? "org_offer_push" : undefined,
      ),
    })
  }
  if (session.assigned_id) {
    plans.push({
      event,
      recipients: party(session.assigned_id, session.contractor_id),
      opts: { entityId: session.id, actorId, legacyAction, dedupeKey },
    })
  }
  return plans
}
