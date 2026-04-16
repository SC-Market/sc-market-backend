import { REST } from "@discordjs/rest"
import {
  APIChannel,
  APIGuild,
  APITextChannel,
  APIInvite,
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIChannelInviteJSONBody,
  Routes,
} from "discord-api-types/v10"
import { DBOfferSession, DBOrder } from "../../clients/database/db-models.js"
import { User } from "../../api/routes/v1/api-models.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import {
  generateAssignedMessage,
  generateOfferStatusUpdateMessage,
  generateStatusUpdateMessage,
} from "../../api/routes/v1/util/webhooks.js"
import logger from "../../logger/logger.js"
import { env } from "../../config/env.js"
import { sendMessage } from "../../clients/aws/sqs.js"
import { checkDiscordSQSConfiguration } from "../../clients/aws/sqs-config.js"
import {
  DiscordIntegrationSettings,
  DiscordInviteOptions,
  ThreadCreationResult,
} from "./discord.service.types.js"

/**
 * Service interface for Discord operations.
 * This service handles all Discord-related operations including direct messages,
 * thread management, and integration settings.
 */
export interface DiscordService {
  // Direct messages
  sendDirectMessage(
    userId: string,
    message: RESTPostAPIChannelMessageJSONBody,
  ): Promise<void>

  // Thread management
  queueThreadCreation(
    object: DBOfferSession | DBOrder,
  ): Promise<ThreadCreationResult>
  assignUserToThread(threadId: string, userId: string): Promise<void>
  renameThread(threadId: string, name: string): Promise<void>
  archiveThread(threadId: string): Promise<void>

  // Thread messages
  sendThreadMessage(
    threadId: string,
    message: RESTPostAPIChannelMessageJSONBody,
  ): Promise<void>
  sendOrderStatusUpdate(order: DBOrder, newStatus: string): Promise<void>
  sendOfferStatusUpdate(
    offer: DBOfferSession,
    status: "Rejected" | "Accepted" | "Counter-Offered",
    user?: User,
  ): Promise<void>
  sendOrderAssignedMessage(order: DBOrder, assigned: User): Promise<void>
  sendUserChatMessage(
    order: DBOrder | DBOfferSession,
    author: User,
    content: string,
  ): Promise<void>

  // Integration settings
  getDiscordIntegrationSettings(
    userId: string,
  ): Promise<DiscordIntegrationSettings>
  getDiscordIntegrationSettingsForContractor(
    contractorId: string,
  ): Promise<DiscordIntegrationSettings>

  // Utility
  fetchGuild(guildId: string): Promise<APIGuild>
  fetchChannel(channelId: string): Promise<APITextChannel>
  createInvite(
    channelId: string,
    options?: DiscordInviteOptions,
  ): Promise<string | null>
}

/**
 * REST API-backed implementation of DiscordService.
 * This implementation uses the Discord REST API and SQS queues for thread creation.
 */
class RestDiscordService implements DiscordService {
  public readonly rest: REST

  constructor() {
    this.rest = new REST({ version: "10" }).setToken(
      env.DISCORD_API_KEY || "missing",
    )
  }

  async sendDirectMessage(
    userId: string,
    message: RESTPostAPIChannelMessageJSONBody,
  ): Promise<void> {
    try {
      const channel: APIChannel = (await this.rest.post(Routes.userChannels(), {
        body: {
          recipient_id: userId,
        },
      })) as APIChannel

      await this.rest.post(Routes.channelMessages(channel.id), {
        body: message,
      })
    } catch (error) {
      logger.error(`Failed to send DM to user ${userId}: ${error}`)
      // Don't throw - Discord errors are expected and should be logged but not fail the operation
    }
  }

  async queueThreadCreation(
    object: DBOfferSession | DBOrder,
  ): Promise<ThreadCreationResult> {
    const contractor = object.contractor_id
      ? await contractorDb.getContractor({
          contractor_id: object.contractor_id,
        })
      : null
    const assigned = object.assigned_id
      ? await profileDb.getUser({ user_id: object.assigned_id })
      : null
    const customer = object.customer_id
      ? await profileDb.getUser({ user_id: object.customer_id })
      : null

    // Get Discord integration settings with fallback to old columns
    let server_id: string | null = null
    let channel_id: string | null = null

    if (contractor) {
      server_id = contractor.official_server_id?.toString() || null
      channel_id = contractor.discord_thread_channel_id?.toString() || null
    } else if (assigned) {
      const discordSettings = await this.getDiscordIntegrationSettings(
        assigned.user_id,
      )
      server_id = discordSettings.official_server_id
      channel_id = discordSettings.discord_thread_channel_id
    }

    if (!server_id || !channel_id) {
      const entityId = "order_id" in object ? object.order_id : object.id
      logger.debug(
        `Discord not configured for ${"order_id" in object ? "order" : "offer session"} ${entityId}`,
      )
      return {
        status: "failed",
        message: "Discord not configured for this entity",
      }
    }

    // Get Discord IDs from providers
    const customerDiscordId = customer
      ? await profileDb.getUserDiscordId(customer.user_id)
      : null
    const assignedDiscordId = assigned
      ? await profileDb.getUserDiscordId(assigned.user_id)
      : null

    const messageBody = {
      type: "create_thread",
      payload: {
        server_id: server_id,
        channel_id: channel_id,
        members: [assignedDiscordId, customerDiscordId].filter(
          (o): o is string => o !== null && o !== undefined,
        ),
        order: object,
        customer_discord_id: customerDiscordId,
        // Store the entity info so we can post initialization messages after thread creation
        entity_info: {
          type: "order_id" in object ? "order" : "offer_session",
          id: "order_id" in object ? object.order_id : object.id,
          customer_discord_id: customerDiscordId,
          assigned_discord_id: assignedDiscordId || null,
        },
      },
      metadata: {
        order_id: "order_id" in object ? object.order_id : object.id,
        entity_type: "order_id" in object ? "order" : "offer_session",
        created_at: new Date().toISOString(),
      },
    }

    try {
      const config = checkDiscordSQSConfiguration()

      if (!config.isDiscordConfigured) {
        logger.warn(
          "SQS not configured - Discord thread creation will be skipped",
          {
            entityId: "order_id" in object ? object.order_id : object.id,
            missingConfig: config.missingConfig,
          },
        )
        return {
          status: "failed",
          message: "Discord queue not configured - thread creation disabled",
        }
      }

      await sendMessage(env.DISCORD_QUEUE_URL!, messageBody)
      return {
        status: "queued",
        message: "Thread creation queued successfully",
      }
    } catch (error) {
      logger.error("Failed to queue thread creation:", error)
      return {
        status: "failed",
        message: "Failed to queue thread creation",
      }
    }
  }

  async assignUserToThread(threadId: string, userId: string): Promise<void> {
    if (!threadId) {
      return
    }

    // Get Discord ID from provider system
    const discordId = await profileDb.getUserDiscordId(userId)

    if (discordId) {
      try {
        await this.rest.put(Routes.threadMembers(threadId, discordId), {})
      } catch (error) {
        logger.debug(
          `Failed to assign user ${discordId} to Discord thread ${threadId}: ${error}`,
        )
      }
    }
  }

  async renameThread(threadId: string, name: string): Promise<void> {
    if (!threadId) {
      return
    }

    try {
      await this.rest.patch(Routes.channel(threadId), {
        body: {
          name: name,
        },
      })
    } catch (error) {
      logger.debug(`Failed to rename Discord thread ${threadId}: ${error}`)
    }
  }

  async archiveThread(threadId: string): Promise<void> {
    if (!threadId) {
      return
    }

    try {
      await this.rest.patch(Routes.channel(threadId), {
        body: { archived: true },
      })
    } catch (error) {
      logger.debug(`Failed to archive Discord thread ${threadId}: ${error}`)
    }
  }

  async sendThreadMessage(
    threadId: string,
    message: RESTPostAPIChannelMessageJSONBody,
  ): Promise<void> {
    if (!threadId) {
      return
    }

    try {
      await this.rest.post(Routes.channelMessages(threadId), {
        body: message,
      })
    } catch (error) {
      logger.debug(
        `Failed to send message to Discord thread ${threadId}: ${error}`,
      )
    }
  }

  async sendOrderStatusUpdate(
    order: DBOrder,
    newStatus: string,
  ): Promise<void> {
    if (!order.thread_id) {
      return
    }

    try {
      await this.rest.post(Routes.channelMessages(order.thread_id), {
        body: await generateStatusUpdateMessage(order, newStatus),
      })
    } catch (error) {
      logger.debug(
        `Failed to send status update to Discord thread ${order.thread_id}: ${error}`,
      )
    }

    if (["fulfilled", "cancelled"].includes(newStatus)) {
      await this.archiveThread(order.thread_id)
    }
  }

  async sendOfferStatusUpdate(
    offer: DBOfferSession,
    status: "Rejected" | "Accepted" | "Counter-Offered",
    user?: User,
  ): Promise<void> {
    if (!offer.thread_id) {
      return
    }

    try {
      await this.rest.post(Routes.channelMessages(offer.thread_id), {
        body: await generateOfferStatusUpdateMessage(offer, status, user),
      })
    } catch (error) {
      logger.debug(
        `Failed to send offer status update to Discord thread ${offer.thread_id}: ${error}`,
      )
    }

    if (["Rejected"].includes(status)) {
      await this.archiveThread(offer.thread_id)
    }
  }

  async sendOrderAssignedMessage(
    order: DBOrder,
    assigned: User,
  ): Promise<void> {
    if (!order.thread_id) {
      return
    }

    try {
      await this.rest.post(Routes.channelMessages(order.thread_id), {
        body: await generateAssignedMessage(order, assigned),
      })
    } catch (error) {
      logger.debug(
        `Failed to send assigned message to Discord thread ${order.thread_id}: ${error}`,
      )
    }

    // Get Discord ID from provider system
    const assignedDiscordId = await profileDb.getUserDiscordId(assigned.user_id)

    if (assignedDiscordId) {
      try {
        await this.rest.put(
          Routes.threadMembers(order.thread_id, assignedDiscordId),
          {},
        )
      } catch (error) {
        logger.debug(
          `Failed to add assigned user ${assignedDiscordId} to Discord thread ${order.thread_id}: ${error}`,
        )
      }
    }
  }

  async sendUserChatMessage(
    order: DBOrder | DBOfferSession,
    author: User,
    content: string,
  ): Promise<void> {
    const threadId = "thread_id" in order ? order.thread_id : null

    if (!threadId) {
      const identifier = "order_id" in order ? order.order_id : order.id
      logger.debug(
        `No Discord thread_id available for ${identifier}, skipping message`,
      )
      return
    }

    try {
      await this.rest.post(Routes.channelMessages(threadId), {
        body: {
          allowed_mentions: {
            parse: [],
          },
          content: `[${author.username}] ${content}`,
        },
      })
    } catch (error) {
      // Log as debug since this is a user-caused issue (invalid thread_id)
      logger.debug(
        `Failed to send Discord message to thread ${threadId}: ${error}`,
      )
    }
  }

  async getDiscordIntegrationSettings(
    userId: string,
  ): Promise<DiscordIntegrationSettings> {
    return await profileDb.getDiscordIntegrationSettings(userId)
  }

  async getDiscordIntegrationSettingsForContractor(
    contractorId: string,
  ): Promise<DiscordIntegrationSettings> {
    const contractor = await contractorDb.getContractor({
      contractor_id: contractorId,
    })

    return {
      official_server_id: contractor.official_server_id?.toString() || null,
      discord_thread_channel_id:
        contractor.discord_thread_channel_id?.toString() || null,
    }
  }

  async fetchGuild(guildId: string): Promise<APIGuild> {
    return (await this.rest.get(Routes.guild(guildId))) as APIGuild
  }

  async fetchChannel(channelId: string): Promise<APITextChannel> {
    return (await this.rest.get(Routes.channel(channelId))) as APITextChannel
  }

  async createInvite(
    channelId: string,
    options: DiscordInviteOptions = {},
  ): Promise<string | null> {
    try {
      logger.debug(`Creating Discord invite for channel ${channelId}`)

      const invite = (await this.rest.post(Routes.channelInvites(channelId), {
        body: {
          max_age: options.max_age ?? 3600, // 1 hour (3600 seconds)
          max_uses: options.max_uses ?? 0, // 0 = unlimited uses
          temporary: options.temporary ?? false, // false = permanent membership
          unique: options.unique ?? true, // true = create unique invite
        } as RESTPostAPIChannelInviteJSONBody,
      })) as APIInvite

      logger.debug(`Successfully created Discord invite: ${invite.code}`)
      return invite.code
    } catch (error) {
      logger.error(
        `Failed to create Discord invite for channel ${channelId}: ${error}`,
      )
      return null
    }
  }
}

/**
 * Singleton instance of DiscordService.
 * This is the service that should be imported and used throughout the application.
 */
const discordServiceInstance = new RestDiscordService()
export const discordService: DiscordService = discordServiceInstance

/**
 * Export Discord REST client for backward compatibility.
 * Some files (knex-db.ts, discord-queue-consumer.ts) still use the REST client directly.
 * TODO: Refactor these to use DiscordService methods instead.
 */
export const rest = discordServiceInstance.rest
