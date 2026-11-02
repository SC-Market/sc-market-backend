/**
 * Site admins hear about a new branded storefront enquiry (enquiries.ts).
 * Its own module so the notification entity lookup (enquiries.ts, used by
 * the notifications list) doesn't import the dispatcher.
 */
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { notify } from "../notify/dispatcher.js"
import type { EventKey } from "../notify/catalog.js"
import {
  siteAdminIds,
  type AdminStorefrontEnquiry,
  type EnquiryStatus,
  type EnquiryTarget,
  type StorefrontEnquiry,
} from "./enquiries.js"

/**
 * Tell the site admins about a new enquiry: an in-app notification (event
 * admin.storefront_enquiry; the frontend links it to Admin › Premium). A test org or shop's
 * enquiry notifies nobody (test accounts never cause notifications to real
 * users); it is still listed for admins, marked as a test. The staff email
 * and Discord webhook alerts are staff-alerts.ts. Best effort: never throws.
 */
export async function notifyAdminsOfEnquiry(
  enquiry: StorefrontEnquiry,
  target: EnquiryTarget,
  actorId: string,
): Promise<{ notified: number }> {
  if (target.is_test) return { notified: 0 }
  try {
    const admins = await siteAdminIds()
    if (!admins.length) return { notified: 0 }
    // In-app only (the event's one channel): what admins see is built from
    // the enquiry by enquiryNoticeEntity().
    const result = await notify(
      "admin.storefront_enquiry",
      admins.map((userId) => ({ userId })),
      { entityId: enquiry.enquiry_id, actorId, messages: {} },
    )
    return { notified: result.delivered.length }
  } catch (error) {
    logger.warn("storefront enquiry: admin notification failed", {
      enquiry_id: enquiry.enquiry_id,
      error: error instanceof Error ? error.message : String(error),
    })
    return { notified: 0 }
  }
}

/** The statuses that answer an enquiry, and the event each one raises. */
const DECISION_EVENTS: Partial<Record<EnquiryStatus, EventKey>> = {
  // "Done" in the UI: staff accepted it and set the storefront up.
  completed: "storefront.enquiry_accepted",
  declined: "storefront.enquiry_declined",
}

/** Where the sender manages the storefront: the org's Storefront settings, or the shop's settings. */
export function enquiryManageUrl(enquiry: Pick<StorefrontEnquiry, "target_type" | "target">): string {
  const base = (env.FRONTEND_URL || "https://sc-market.space").replace(/\/+$/, "")
  const handle = encodeURIComponent(enquiry.target)
  return enquiry.target_type === "org" ? `${base}/org/${handle}/manage/storefront` : `${base}/shop/${handle}/settings`
}

/**
 * Tell the person who sent an enquiry that staff accepted (status completed)
 * or declined it, through notify() with their own (Personal) preferences:
 * in-app, push, email and Discord DM as they chose. Other status changes
 * (open, in progress) and note-only edits notify nobody. Each decision goes
 * out once per enquiry (dedupe key enquiry + status), so setting the same
 * status again, or reopening and declining again, does not repeat it.
 * Nobody to tell once the sender's account is deleted. Best effort: never throws.
 */
export async function notifySubmitterOfDecision(
  enquiry: AdminStorefrontEnquiry,
  adminId: string,
): Promise<{ notified: number }> {
  const eventKey = DECISION_EVENTS[enquiry.status]
  const userId = enquiry.submitted_by_user_id
  if (!eventKey || !userId) return { notified: 0 }
  try {
    const accepted = enquiry.status === "completed"
    const subdomain = `${enquiry.requested_subdomain}.sc-market.space`
    const name = enquiry.target_name || enquiry.target
    const url = enquiryManageUrl(enquiry)
    const base = (env.FRONTEND_URL || "https://sc-market.space").replace(/\/+$/, "")
    const result = await notify(eventKey, [{ userId, contractorId: null }], {
      entityId: enquiry.enquiry_id,
      actorId: adminId,
      dedupeKey: `${enquiry.enquiry_id}:${enquiry.status}`,
      messages: {
        push: {
          title: accepted ? "Storefront enquiry accepted" : "Storefront enquiry declined",
          body: accepted
            ? `SC Market staff accepted your branded storefront enquiry for ${name} (${subdomain}).`
            : `SC Market staff declined your branded storefront enquiry for ${name} (${subdomain}).`,
          icon: `${base}/android-chrome-192x192.png`,
          data: { url, type: "storefront_enquiry", entityId: enquiry.enquiry_id },
          tag: `storefront-enquiry-${enquiry.enquiry_id}`,
        },
        email: {
          data: {
            enquiry: {
              enquiry_id: enquiry.enquiry_id,
              target_type: enquiry.target_type,
              target: enquiry.target,
              target_name: name,
              requested_subdomain: enquiry.requested_subdomain,
              status: enquiry.status,
            },
          },
        },
      },
    })
    return { notified: result.delivered.length }
  } catch (error) {
    logger.warn("storefront enquiry: decision notification failed", {
      enquiry_id: enquiry.enquiry_id,
      error: error instanceof Error ? error.message : String(error),
    })
    return { notified: 0 }
  }
}
