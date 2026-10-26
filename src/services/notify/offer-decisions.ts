/**
 * Offer accepted / rejected (owner decision on question 8): tell the other
 * party. Until now only the Discord thread and the chat got a system message.
 *
 * - The customer decided: the seller side hears (the assignee, or the org's
 *   manage_orders members while nobody is assigned).
 * - The seller side decided: the customer hears.
 * Preferences use the offer's org scope, like the other offer events.
 */
import type { DBOfferSession } from "../../clients/database/db-models.js"
import { env } from "../../config/env.js"
import { notify } from "./dispatcher.js"
import { orgMembersWith } from "./plans.js"
import type { UserRecipient } from "./channels.js"

export type OfferDecision = "accepted" | "rejected" | "withdrawn"

export async function offerDecisionRecipients(
  session: DBOfferSession,
  actorId: string,
): Promise<UserRecipient[]> {
  const scope = session.contractor_id ?? null
  if (actorId !== session.customer_id) {
    return [{ userId: session.customer_id, contractorId: scope }]
  }
  if (session.assigned_id) return [{ userId: session.assigned_id, contractorId: scope }]
  if (session.contractor_id) return orgMembersWith(session.contractor_id, "manage_orders")
  return []
}

export async function notifyOfferDecision(
  session: DBOfferSession,
  decision: OfferDecision,
  actorId: string,
): Promise<void> {
  const recipients = await offerDecisionRecipients(session, actorId)
  if (!recipients.length) return
  const base = env.FRONTEND_URL || "https://sc-market.space"
  const title =
    decision === "accepted" ? "Offer accepted" : decision === "withdrawn" ? "Offer withdrawn" : "Offer rejected"
  await notify(decision === "accepted" ? "offer.accepted" : "offer.rejected", recipients, {
    entityId: session.id,
    actorId,
    dedupeKey: `${session.id}:${decision}`,
    messages: {
      push: {
        title,
        body:
          decision === "accepted"
            ? "Your offer was accepted and is now an order."
            : decision === "withdrawn"
              ? "The customer withdrew their offer."
              : "Your offer was rejected.",
        icon: `${base}/android-chrome-192x192.png`,
        data: { url: `${base}/offer/${session.id}`, type: "offer", entityId: session.id },
        tag: `offer-${decision}-${session.id}`,
      },
      email: { data: { offer: session } },
    },
  })
}
