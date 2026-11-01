/**
 * Site admins hear about a new branded storefront enquiry (enquiries.ts).
 * Its own module so the notification entity lookup (enquiries.ts, used by
 * the notifications list) doesn't import the dispatcher.
 */
import logger from "../../logger/logger.js"
import { notify } from "../notify/dispatcher.js"
import { siteAdminIds, type EnquiryTarget, type StorefrontEnquiry } from "./enquiries.js"

/**
 * Tell the site admins about a new enquiry: an in-app notification (event
 * admin.storefront_enquiry; the frontend links it to Admin › Premium). A test org or shop's
 * enquiry notifies nobody (test accounts never cause notifications to real
 * users); it is still listed for admins, marked as a test. There is no staff
 * Discord channel or webhook to post to. Best effort: never throws.
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
