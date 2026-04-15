import express from "express"
import {
  InteractionType,
  InteractionResponseType,
  MessageComponentTypes,
  ButtonStyleTypes,
  verifyKeyMiddleware,
} from "discord-interactions"
import { getKnex } from "../../clients/database/knex-db.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"
import { has_permission, is_member } from "../../api/routes/v1/util/permissions.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

const knex = () => getKnex()
const DISCORD_PUBLIC_KEY = env.DISCORD_PUBLIC_KEY || ""

export const interactionsRouter = express.Router()

// discord-interactions middleware handles raw body parsing + ed25519 verification
interactionsRouter.post("/", verifyKeyMiddleware(DISCORD_PUBLIC_KEY), async (req, res) => {
  const { type, data, member } = req.body

  if (type === InteractionType.PING) {
    res.json({ type: InteractionResponseType.PONG })
    return
  }

  if (type === InteractionType.MESSAGE_COMPONENT) {
    const customId = data?.custom_id as string
    if (customId?.startsWith("claim_order:")) {
      await handleClaimOrder(customId.split(":")[1], member, res)
      return
    }
    if (customId?.startsWith("claim_offer:")) {
      await handleClaimOffer(customId.split(":")[1], member, res)
      return
    }
    res.json(ephemeral("Unknown button"))
    return
  }

  res.json(ephemeral("Unsupported interaction"))
})

function ephemeral(content: string) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: 64 },
  }
}

function claimedResponse(label: string, customId: string) {
  return {
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      components: [{
        type: MessageComponentTypes.ACTION_ROW,
        components: [{
          type: MessageComponentTypes.BUTTON,
          style: ButtonStyleTypes.SECONDARY,
          label,
          custom_id: customId,
          disabled: true,
        }],
      }],
    },
  }
}

async function resolveUser(member: any, res: express.Response): Promise<any | null> {
  const discordId = member?.user?.id
  if (!discordId) {
    res.json(ephemeral("❌ Could not identify your Discord account"))
    return null
  }
  const user = await profileDb.getUserByDiscordId(discordId)
  if (!user) {
    res.json(ephemeral("❌ Your Discord account is not linked to an SC Market account"))
    return null
  }
  return user
}

async function checkClaimPermission(
  contractorId: string | null,
  userId: string,
  res: express.Response,
): Promise<boolean> {
  if (!contractorId) {
    res.json(ephemeral("❌ Cannot be claimed (no organization)"))
    return false
  }
  if (!(await is_member(contractorId, userId))) {
    res.json(ephemeral("❌ You are not a member of this organization"))
    return false
  }
  if (!(await has_permission(contractorId, userId, "claim_orders"))) {
    res.json(ephemeral("❌ You don't have permission to claim orders for this organization"))
    return false
  }
  return true
}

async function handleClaimOrder(orderId: string, member: any, res: express.Response) {
  try {
    const user = await resolveUser(member, res)
    if (!user) return

    const order = await orderDb.getOrder({ order_id: orderId })
    if (!order) { res.json(ephemeral("❌ This order no longer exists")); return }
    if (order.status === "cancelled" || order.status === "fulfilled") { res.json(ephemeral("❌ This order is no longer available")); return }
    if (order.assigned_id) { res.json(ephemeral("❌ This order has already been claimed")); return }
    if (!(await checkClaimPermission(order.contractor_id, user.user_id, res))) return

    await knex()("orders").where({ order_id: orderId }).update({ assigned_id: user.user_id })
    res.json(claimedResponse(`Claimed by ${user.display_name}`, `claim_order:${orderId}`))
    logger.info(`Order ${orderId} claimed by ${user.username} via Discord`)
  } catch (err) {
    logger.error("Failed to handle claim order", { error: err, orderId })
    res.json(ephemeral("❌ An error occurred while claiming this order"))
  }
}

async function handleClaimOffer(sessionId: string, member: any, res: express.Response) {
  try {
    const user = await resolveUser(member, res)
    if (!user) return

    const session = await knex()("offer_sessions").where({ id: sessionId }).first()
    if (!session) { res.json(ephemeral("❌ This offer no longer exists")); return }
    if (session.status === "rejected" || session.status === "cancelled") { res.json(ephemeral("❌ This offer is no longer available")); return }
    if (session.assigned_id) { res.json(ephemeral("❌ This offer has already been claimed")); return }
    if (!(await checkClaimPermission(session.contractor_id, user.user_id, res))) return

    await knex()("offer_sessions").where({ id: sessionId }).update({ assigned_id: user.user_id })
    res.json(claimedResponse(`Claimed by ${user.display_name}`, `claim_offer:${sessionId}`))
    logger.info(`Offer ${sessionId} claimed by ${user.username} via Discord`)
  } catch (err) {
    logger.error("Failed to handle claim offer", { error: err, sessionId })
    res.json(ephemeral("❌ An error occurred while claiming this offer"))
  }
}
