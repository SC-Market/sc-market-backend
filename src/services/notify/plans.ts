/**
 * Who notify() would notify for the order, offer and chat events, computed
 * independently of the legacy notification.service.ts code. Shadow mode
 * (shadow.ts) compares these plans with what the legacy code delivers; once
 * they agree on real traffic, these become the live implementation.
 *
 * They already carry the owner's decisions that ship with the cutover; the
 * shadow lines report those as expected differences (shadow.ts):
 * - the actor is never notified (no notifyActor on these events);
 * - each member is notified once, however many roles grant the permission
 *   (notify() deduplicates recipients);
 * - order.status_changed replaces the four order.status.* events, and
 *   offer.received replaces offer.created / offer.countered; the occurrence's
 *   own action (legacyAction) keeps the message saying which;
 * - buy-now orders use the normal order notification (buyNowOrderPlans).
 */
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import type { DBMessage, DBOfferSession, DBOrder } from "../../clients/database/db-models.js"
import type { UserRecipient } from "./channels.js"
import type { EventKey } from "./catalog.js"
import { ORDER_STATUS_ACTIONS } from "./catalog.js"
import type { ShadowPlan } from "./shadow.js"

/** Org members holding a permission, checked against their preferences for that org. */
export async function orgMembersWith(
  contractorId: string,
  permission: "manage_orders" | "manage_market",
): Promise<UserRecipient[]> {
  const rows = await contractorDb.getMembersWithMatchingRole(contractorId, { [permission]: true })
  return rows.map((r) => ({ userId: r.user_id, contractorId }))
}

function party(userId: string | null | undefined, contractorId: string | null | undefined): UserRecipient[] {
  return userId ? [{ userId, contractorId: contractorId ?? null }] : []
}

export async function orderCreatedPlans(order: DBOrder): Promise<ShadowPlan[]> {
  const plans: ShadowPlan[] = []
  if (order.contractor_id) {
    plans.push({
      event: "order.created",
      recipients: await orgMembersWith(order.contractor_id, "manage_orders"),
      opts: { entityId: order.order_id, actorId: order.customer_id },
    })
  }
  if (order.assigned_id) plans.push(...orderAssignedPlans(order))
  return plans
}

export function orderAssignedPlans(order: DBOrder): ShadowPlan[] {
  if (!order.assigned_id) return []
  return [
    {
      event: "order.assigned",
      recipients: party(order.assigned_id, order.contractor_id),
      opts: { entityId: order.order_id, actorId: order.customer_id },
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
    return {
      ...p,
      legacyActions: [p.event === "order.created" ? "order_create" : "order_assigned", "order_create_v2"],
      explain: (d) =>
        (d.kind === "extra" && d.channel !== "push") || (d.channel === "push" && ids.has(d.userId))
          ? "buy_now_normal_path"
          : undefined,
    }
  })
}

export function orderStatusPlans(order: DBOrder, newStatus: string, actorId: string): ShadowPlan[] {
  const action = `order_status_${newStatus.replace("-", "_")}`
  if (!(ORDER_STATUS_ACTIONS as readonly string[]).includes(action)) return []
  return [
    {
      event: "order.status_changed",
      recipients: [...party(order.assigned_id, order.contractor_id), ...party(order.customer_id, order.contractor_id)],
      opts: { entityId: order.order_id, actorId, legacyAction: action, dedupeKey: `${order.order_id}:${action}` },
    },
  ]
}

export function chatMessagePlans(
  thread: { kind: "order"; order: DBOrder } | { kind: "offer"; session: DBOfferSession },
  message: DBMessage,
): ShadowPlan[] {
  const t = thread.kind === "order" ? thread.order : thread.session
  const entityId = thread.kind === "order" ? thread.order.order_id : thread.session.id
  return [
    {
      event: thread.kind === "order" ? "order.message" : "offer.message",
      recipients: [...party(t.assigned_id, t.contractor_id), ...party(t.customer_id, t.contractor_id)],
      opts: {
        entityId,
        actorId: message.author ?? null,
        dedupeKey: message.message_id,
        collapse: "unread",
      },
    },
  ]
}

export async function offerPlans(
  session: DBOfferSession,
  type: "create" | "counteroffer",
): Promise<ShadowPlan[]> {
  const event: EventKey = "offer.received"
  const legacyAction = type === "create" ? "offer_create" : "counter_offer_create"
  // Cutover TODO: a session gets several counter offers; key each on its
  // offer row once the caller passes it (shadow planning ignores the key).
  const dedupeKey = `${session.id}:${legacyAction}`
  const plans: ShadowPlan[] = []
  if (session.contractor_id) {
    // Org managers get the offer in-app and by email, not by push (today).
    plans.push({
      event,
      recipients: await orgMembersWith(session.contractor_id, "manage_orders"),
      opts: { entityId: session.id, actorId: session.customer_id, legacyAction, dedupeKey, channels: ["in_app", "email"] },
    })
  }
  if (session.assigned_id) {
    plans.push({
      event,
      recipients: party(session.assigned_id, session.contractor_id),
      opts: { entityId: session.id, actorId: session.customer_id, legacyAction, dedupeKey },
    })
  }
  return plans
}
