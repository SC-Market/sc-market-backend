/**
 * Notification channels and the adapter interface every channel implements.
 * See drafts/notifications-design.md §2.3.
 *
 * "user" channels deliver to a person and are gated by that person's
 * preferences; "destination" channels deliver to a configured place (a Discord
 * channel, a webhook) and are gated by that place's own configuration.
 */
import type { PushNotificationPayload } from "../push-notifications/push-notification.service.types.js"
import type { NotificationEmailData } from "../email/email.service.types.js"
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10"

export const USER_CHANNELS = ["in_app", "push", "email", "discord_dm"] as const
export type UserChannel = (typeof USER_CHANNELS)[number]

/** Not registered with the dispatcher yet (Spectrum needs an RSI integration; see the design doc, Q6). */
export const FUTURE_CHANNELS = ["spectrum_dm", "spectrum_channel"] as const

export interface UserRecipient {
  userId: string
  /** The org whose org-scoped preferences apply, for org events. */
  contractorId?: string | null
}

/** What each user channel is asked to deliver. */
export interface RenderedMessages {
  push?: PushNotificationPayload
  /** Email keeps the legacy template switch: the template is the legacy action. */
  email?: { data: NotificationEmailData }
  discord_dm?: RESTPostAPIChannelMessageJSONBody
}

export type DeliveryResult =
  | { status: "sent"; providerId?: string }
  | { status: "skipped"; reason: string }
  | { status: "retryable"; error: string }
  | { status: "permanent"; error: string }

export interface DeliveryContext {
  eventKey: string
  legacyAction: string
  recipient: UserRecipient
  idempotencyKey: string
}

export interface UserChannelAdapter<Msg> {
  id: Exclude<UserChannel, "in_app">
  send(msg: Msg, ctx: DeliveryContext): Promise<DeliveryResult>
}
