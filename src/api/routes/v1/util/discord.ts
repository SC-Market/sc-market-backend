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
  generateNewOfferMessage,
  generateOfferStatusUpdateMessage,
  generateStatusUpdateMessage,
} from "./webhooks.js"
import logger from "../../../../logger/logger.js"
import { env } from "../../../../config/env.js"

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
    throw new Error("Failed to parse bot response")
  }

  return resp.json()
}

export interface BotThreadCreateResponse {
  result: {
    invite_code: string
    thread?: { thread_id: string }
    message?: string
    failed: boolean
  }
}
export async function createThread(
  object: DBOfferSession | DBOrder,
): Promise<BotThreadCreateResponse> {
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
  // const discord_invite = contractor ? contractor.discord_invite : assigned?.discord_invite

  const body = {
    server_id: server_id,
    channel_id: channel_id,
    members: [assigned?.discord_id, customer?.discord_id].filter((o) => o),
    order: object,
    customer_discord_id: customer?.discord_id,
  }

  return await notifyBot("order_placed", body)
}

export async function createOfferThread(session: DBOfferSession): Promise<{
  result: {
    invite_code: string
    thread?: { thread_id: string }
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

  try {
    await rest.post(
      Routes.channelMessages(bot_response.result.thread!.thread_id),
      {
        body: await generateNewOfferMessage(session, customer, assigned),
      },
    )
  } catch (error) {
    console.error(bot_response, error)
  }

  return bot_response
}

export async function assignToThread(order: DBOrder, user: DBUser) {
  if (order.thread_id) {
    try {
      await rest.put(Routes.threadMembers(order.thread_id, user.discord_id), {})
    } catch (error) {
      console.error(error)
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
      console.error(error)
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
    console.error(error)
  }

  if (["fulfilled", "cancelled"].includes(newStatus)) {
    try {
      await rest.patch(Routes.channel(order.thread_id), {
        body: { archived: true },
      })
    } catch (error) {
      console.error(error)
    }
  }

  return
}

export async function manageOfferStatusUpdateDiscord(
  offer: DBOfferSession,
  newStatus: string,
) {
  if (!offer.thread_id) {
    return
  }

  try {
    await rest.post(Routes.channelMessages(offer.thread_id), {
      body: await generateOfferStatusUpdateMessage(offer, newStatus),
    })
  } catch (error) {
    console.error(error)
  }

  if (["Rejected"].includes(newStatus)) {
    try {
      await rest.patch(Routes.channel(offer.thread_id), {
        body: { archived: true },
      })
    } catch (error) {
      console.error(error)
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
    console.error(error)
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
    console.error(error)
  }

  try {
    await rest.put(
      Routes.threadMembers(order.thread_id, assigned.discord_id),
      {},
    )
  } catch (error) {
    console.error(error)
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
