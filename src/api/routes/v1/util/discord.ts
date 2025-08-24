import { REST } from "@discordjs/rest"
import {
  APIChannel,
  APIGuild,
  APITextChannel,
  RESTPostAPIChannelMessageJSONBody,
  Routes,
} from "discord-api-types/v10"
import {
  DBOfferSession,
  DBOrder,
  DBUser,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  generateAssignedMessage,
  generateOfferStatusUpdateMessage,
  generateStatusUpdateMessage,
} from "./webhooks.js"
import logger from "../../../../logger/logger.js"
import { env } from "../../../../config/env.js"
import { sendMessage } from "../../../../clients/aws/sqs.js"

export const rest = new REST({ version: "10" }).setToken(
  env.DISCORD_API_KEY || "missing",
)

export async function sendDM(
  user_id: string,
  message: RESTPostAPIChannelMessageJSONBody,
) {
  try {
    const channel: APIChannel = (await rest.post(Routes.userChannels(), {
      body: {
        recipient_id: user_id,
      },
    })) as APIChannel

    await rest.post(Routes.channelMessages(channel.id), {
      body: message,
    })
  } catch (error) {
    logger.error(`Failed to send DM ${error}`)
  }
}

export async function notifyBot(
  endpoint: string,
  body: any,
): Promise<BotThreadCreateResponse> {
  const url = `${env.DISCORD_BOT_URL}/${endpoint}`

  try {
    const resp = await fetch(url, {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
      method: "POST",
    })

    if (!resp.ok) {
      logger.debug(
        `Discord bot service returned ${resp.status}: ${resp.statusText}`,
      )
      throw new Error(`Discord bot service error: ${resp.status}`)
    }

    return resp.json()
  } catch (error) {
    logger.debug(`Failed to communicate with Discord bot service: ${error}`)
    return {
      result: {
        failed: true,
        message: "Discord bot service unavailable",
      },
    }
  }
}

export interface BotThreadCreateResponse {
  result: {
    message?: string
    failed: boolean
  }
}

// New function to queue thread creation via SQS
export async function queueThreadCreation(
  object: DBOfferSession | DBOrder,
): Promise<{ status: string; message: string }> {
  const contractor = object.contractor_id
    ? await database.getContractor({ contractor_id: object.contractor_id })
    : null
  const assigned = object.assigned_id
    ? await database.getUser({ user_id: object.assigned_id })
    : null
  const customer = object.customer_id
    ? await database.getUser({ user_id: object.customer_id })
    : null

  const server_id = contractor
    ? contractor?.official_server_id
    : assigned?.official_server_id
  const channel_id = contractor
    ? contractor?.discord_thread_channel_id
    : assigned?.discord_thread_channel_id

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


  


  const messageBody = {
    type: "create_thread",
    payload: {
      server_id: server_id,
      channel_id: channel_id,
      members: [assigned?.discord_id, customer?.discord_id].filter((o) => o),
      order: object,
      customer_discord_id: customer?.discord_id,
      // Store the entity info so we can post initialization messages after thread creation
      entity_info: {
        type: "order_id" in object ? "order" : "offer_session",
        id: "order_id" in object ? object.order_id : object.id,
        customer_discord_id: customer?.discord_id,
        assigned_discord_id: assigned?.discord_id || null
      }
    },
    metadata: {
      order_id: "order_id" in object ? object.order_id : object.id,
      entity_type: "order_id" in object ? "order" : "offer_session",
      created_at: new Date().toISOString(),
    },
  }

  try {
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
export async function createThread(
  object: DBOfferSession | DBOrder,
): Promise<BotThreadCreateResponse> {
  // Use the new queue-based approach
  const result = await queueThreadCreation(object)

  if (result.status === "queued") {
    // Return a temporary response indicating the thread is queued
    // The actual thread creation will happen asynchronously via the Discord bot
    return {
      result: {
        failed: false,
        message: "Thread creation queued successfully",
      },
    }
  } else {
    // Return failure response
    return {
      result: {
        failed: true,
        message: result.message,
      },
    }
  }
}

export async function createOfferThread(session: DBOfferSession): Promise<{
  result: {
    message?: string
    failed: boolean
  }
}> {
  const assigned = session.assigned_id
    ? await database.getUser({ user_id: session.assigned_id })
    : null
  const customer = session.customer_id
    ? await database.getUser({ user_id: session.customer_id })
    : null

  const bot_response = await createThread(session)

  if (!customer) {
    return bot_response
  }

  // Since thread creation is now queued, we can't send the initial message yet
  // The Discord bot will handle this when it processes the queue
  // For now, just return the response indicating the thread is queued
  if (bot_response.result.failed) {
    logger.warn(`Offer thread creation failed: ${bot_response.result.message}`)
  } else {
    logger.info(
      `Offer thread creation queued successfully for session ${session.id}`,
    )
  }

  return bot_response
}

export async function assignToThread(order: DBOrder, user: DBUser) {
  if (order.thread_id) {
    try {
      await rest.put(Routes.threadMembers(order.thread_id, user.discord_id), {})
    } catch (error) {
      logger.debug(
        `Failed to assign user ${user.discord_id} to Discord thread ${order.thread_id}: ${error}`,
      )
    }
  }
}

export async function rename_offer_thread(
  session: DBOfferSession,
  order: DBOrder,
) {
  if (session.thread_id) {
    try {
      await rest.patch(Routes.channel(session.thread_id), {
        body: {
          name: `order-${order.order_id.substring(0, 8)}`,
        },
      })
    } catch (error) {
      logger.debug(
        `Failed to rename Discord thread ${session.thread_id}: ${error}`,
      )
    }
  }
}

export async function manageOrderStatusUpdateDiscord(
  order: DBOrder,
  newStatus: string,
) {
  if (!order.thread_id) {
    return
  }

  try {
    await rest.post(Routes.channelMessages(order.thread_id), {
      body: await generateStatusUpdateMessage(order, newStatus),
    })
  } catch (error) {
    logger.debug(
      `Failed to send status update to Discord thread ${order.thread_id}: ${error}`,
    )
  }

  if (["fulfilled", "cancelled"].includes(newStatus)) {
    try {
      await rest.patch(Routes.channel(order.thread_id), {
        body: { archived: true },
      })
    } catch (error) {
      logger.debug(
        `Failed to archive Discord thread ${order.thread_id}: ${error}`,
      )
    }
  }

  return
}

export async function manageOfferStatusUpdateDiscord(
  offer: DBOfferSession,
  newStatus: "Rejected" | "Accepted" | "Counter-Offered",
) {
  if (!offer.thread_id) {
    return
  }

  try {
    await rest.post(Routes.channelMessages(offer.thread_id), {
      body: await generateOfferStatusUpdateMessage(offer, newStatus),
    })
  } catch (error) {
    logger.debug(
      `Failed to send offer status update to Discord thread ${offer.thread_id}: ${error}`,
    )
  }

  if (["Rejected"].includes(newStatus)) {
    try {
      await rest.patch(Routes.channel(offer.thread_id), {
        body: { archived: true },
      })
    } catch (error) {
      logger.debug(
        `Failed to archive Discord thread ${offer.thread_id}: ${error}`,
      )
    }
  }

  return
}

export async function sendUserChatMessage(
  order: DBOrder | DBOfferSession,
  author: DBUser,
  content: string,
) {
  if (!order.thread_id) {
    const identifier = "order_id" in order ? order.order_id : order.id
    logger.debug(
      `No Discord thread_id available for ${identifier}, skipping message`,
    )
    return
  }

  try {
    await rest.post(Routes.channelMessages(order.thread_id), {
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
      `Failed to send Discord message to thread ${order.thread_id}: ${error}`,
    )
  }
}

export async function manageOrderAssignedDiscord(
  order: DBOrder,
  assigned: DBUser,
) {
  if (!order.thread_id) {
    return
  }

  try {
    await rest.post(Routes.channelMessages(order.thread_id), {
      body: await generateAssignedMessage(order, assigned),
    })
  } catch (error) {
    logger.debug(
      `Failed to send assigned message to Discord thread ${order.thread_id}: ${error}`,
    )
  }

  try {
    await rest.put(
      Routes.threadMembers(order.thread_id, assigned.discord_id),
      {},
    )
  } catch (error) {
    logger.debug(
      `Failed to add assigned user ${assigned.discord_id} to Discord thread ${order.thread_id}: ${error}`,
    )
  }

  return
}

export async function fetchGuild(guild_id: string): Promise<APIGuild> {
  return rest.get(Routes.guild(guild_id)) as Promise<APIGuild>
}

export async function fetchChannel(
  channel_id: string,
): Promise<APITextChannel> {
  return rest.get(Routes.channel(channel_id)) as Promise<APITextChannel>
}
