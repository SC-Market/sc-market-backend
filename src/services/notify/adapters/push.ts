/** Web push: the existing push service (subscriptions, 410 cleanup, VAPID). */
import { pushNotificationService } from "../../push-notifications/push-notification.service.js"
import type { PushNotificationPayload } from "../../push-notifications/push-notification.service.types.js"
import type { UserChannelAdapter } from "../channels.js"

export const pushAdapter: UserChannelAdapter<PushNotificationPayload> = {
  id: "push",
  async send(payload, ctx) {
    try {
      // The push service re-reads the same preference row; it agrees with the
      // dispatcher's resolution, so this is a no-op check kept for safety.
      await pushNotificationService.sendPushNotification(
        ctx.recipient.userId,
        payload,
        // Without an action type the push service doesn't re-check the
        // preference: mandatory events go out regardless.
        ctx.mandatory ? undefined : ctx.legacyAction,
        ctx.recipient.contractorId ?? null,
      )
      return { status: "sent" }
    } catch (err) {
      return { status: "retryable", error: err instanceof Error ? err.message : String(err) }
    }
  },
}
