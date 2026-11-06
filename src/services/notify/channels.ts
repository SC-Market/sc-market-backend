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
import type { DBNotificationWebhook } from "../../clients/database/db-models.js"

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
  /** Mandatory events bypass the transports' own preference re-checks. */
  mandatory: boolean
}

export interface UserChannelAdapter<Msg> {
  id: Exclude<UserChannel, "in_app">
  send(msg: Msg, ctx: DeliveryContext): Promise<DeliveryResult>
}

/**
 * Destination channels (Phase 5): a configured place, not a person. Gated by
 * the place's own configuration (webhook_actions, the Discord setup's alerts
 * or contracts flag, STAFF_DISCORD_WEBHOOK_URL), not by user preferences or
 * org mutes. See destinations.ts.
 */
export const DESTINATION_CHANNELS = ["webhook", "discord_channel"] as const
export type DestinationChannel = (typeof DESTINATION_CHANNELS)[number]

/**
 * Where one destination delivery goes. `ref` identifies it in
 * notification_deliveries.destination_ref and in logs; it never contains a
 * webhook URL (those are secrets: whoever has one can post).
 */
export type Destination =
  | { channel: "webhook"; ref: `webhook:${string}`; webhook: DBNotificationWebhook }
  /** The staff channel's webhook; its URL is read from the environment at send time. */
  | { channel: "webhook"; ref: "webhook:staff"; staff: true }
  | { channel: "discord_channel"; ref: `discord_channel:${string}`; channelId: string }

export interface DestinationContext {
  eventKey: string
  idempotencyKey: string
}

export interface DestinationAdapter {
  id: DestinationChannel
  send(body: unknown, destination: Destination, ctx: DestinationContext): Promise<DeliveryResult>
}
