/**
 * Email: the existing SQS email path. sendNotificationEmail queues the email
 * (EMAIL_QUEUE_URL) and the backend's own consumer renders the legacy
 * template for the action and sends it through SES, re-checking the
 * recipient's verified address and email preference at send time.
 */
import { emailService } from "../../email/email.service.js"
import type { NotificationEmailData } from "../../email/email.service.types.js"
import type { UserChannelAdapter } from "../channels.js"

export const emailAdapter: UserChannelAdapter<{ data: NotificationEmailData }> = {
  id: "email",
  async send(msg, ctx) {
    try {
      const ok = await emailService.sendNotificationEmail(
        ctx.recipient.userId,
        ctx.legacyAction,
        msg.data,
        false,
        ctx.recipient.contractorId ?? null,
      )
      return ok ? { status: "sent" } : { status: "skipped", reason: "not sent (no verified email or disabled)" }
    } catch (err) {
      return { status: "retryable", error: err instanceof Error ? err.message : String(err) }
    }
  },
}
