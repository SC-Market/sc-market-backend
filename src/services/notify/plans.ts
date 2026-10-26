/**
 * Who notify() would notify for the order, offer and chat events, computed
 * independently of the legacy notification.service.ts code. Shadow mode
 * (shadow.ts) compares these plans with what the legacy code delivers; once
 * they agree on real traffic, these become the live implementation.
 */
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import type { DBMessage, DBOfferSession, DBOrder } from "../../clients/database/db-models.js"
import type { UserRecipient } from "./channels.js"
import type { EventKey } from "./catalog.js"
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
      opts: { entityId: order.order_id, actorId: order.customer_id, notifyActor: true },
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
      opts: { entityId: order.order_id, actorId: order.customer_id, notifyActor: true },
    },
  ]
}

const STATUS_EVENTS: Record<string, EventKey> = {
  "not-started": "order.status.not_started",
  "in-progress": "order.status.in_progress",
  fulfilled: "order.status.fulfilled",
  cancelled: "order.status.cancelled",
}

export function orderStatusPlans(order: DBOrder, newStatus: string, actorId: string): ShadowPlan[] {
  const event = STATUS_EVENTS[newStatus]
  if (!event) return []
  return [
    {
      event,
      recipients: [...party(order.assigned_id, order.contractor_id), ...party(order.customer_id, order.contractor_id)],
      opts: { entityId: order.order_id, actorId },
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
  const event: EventKey = type === "create" ? "offer.created" : "offer.countered"
  const plans: ShadowPlan[] = []
  if (session.contractor_id) {
    // Org managers get the offer in-app and by email, not by push (today).
    plans.push({
      event,
      recipients: await orgMembersWith(session.contractor_id, "manage_orders"),
      opts: { entityId: session.id, actorId: session.customer_id, notifyActor: true, channels: ["in_app", "email"] },
    })
  }
  if (session.assigned_id) {
    plans.push({
      event,
      recipients: party(session.assigned_id, session.contractor_id),
      opts: { entityId: session.id, actorId: session.customer_id, notifyActor: true },
    })
  }
  return plans
}
