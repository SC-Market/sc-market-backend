import express from "express"
import { verify } from "node:crypto"
import { getKnex } from "../../clients/database/knex-db.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"
import { has_permission, is_member } from "../../api/routes/v1/util/permissions.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

const knex = () => getKnex()

// Discord interaction types
const INTERACTION_PING = 1
const INTERACTION_MESSAGE_COMPONENT = 3

// Discord interaction response types
const RESPONSE_PONG = 1
const RESPONSE_CHANNEL_MESSAGE = 4
const RESPONSE_UPDATE_MESSAGE = 7

// Discord component types
const COMPONENT_ACTION_ROW = 1
const COMPONENT_BUTTON = 2

// Discord button styles
const BUTTON_SECONDARY = 2

// Message flags
const FLAG_EPHEMERAL = 64

const DISCORD_PUBLIC_KEY = env.DISCORD_PUBLIC_KEY || ""

/**
 * Verify Discord interaction signature using ed25519.
 * Node 18+ supports ed25519 natively via crypto.verify.
 */
function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): boolean {
  try {
    // Build the ed25519 public key in DER format
    // Ed25519 DER SPKI prefix (30 2a 30 05 06 03 2b 65 70 03 21 00) + 32-byte key
    const derPrefix = Buffer.from("302a300506032b6570032100", "hex")
    const keyBytes = Buffer.from(publicKeyHex, "hex")
    const derKey = Buffer.concat([derPrefix, keyBytes])

    return verify(
      null,
      Buffer.from(timestamp + body),
      { key: derKey, format: "der", type: "spki" },
      Buffer.from(signatureHex, "hex"),
    )
  } catch (err) {
    logger.error("Ed25519 verification error", { error: err })
    return false
  }
}

export const interactionsRouter = express.Router()

interactionsRouter.post("/", async (req: any, res) => {
  const signature = req.headers["x-signature-ed25519"] as string
  const timestamp = req.headers["x-signature-timestamp"] as string
  // Body is a raw Buffer from express.raw()
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body)

  if (!signature || !timestamp || !DISCORD_PUBLIC_KEY) {
    res.status(401).json({ error: "Invalid request" })
    return
  }

  if (!verifyDiscordSignature(DISCORD_PUBLIC_KEY, signature, timestamp, rawBody)) {
    res.status(401).json({ error: "Invalid signature" })
    return
  }

  const body = JSON.parse(rawBody)
  const { type, data, member } = body

  // Handle PING
  if (type === INTERACTION_PING) {
    res.json({ type: RESPONSE_PONG })
    return
  }

  // Handle button clicks
  if (type === INTERACTION_MESSAGE_COMPONENT) {
    const customId = data?.custom_id as string
    if (!customId) {
      res.json(ephemeral("Unknown interaction"))
      return
    }

    if (customId.startsWith("claim_order:")) {
      await handleClaimOrder(customId.split(":")[1], member, res)
      return
    }

    if (customId.startsWith("claim_offer:")) {
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
    type: RESPONSE_CHANNEL_MESSAGE,
    data: { content, flags: FLAG_EPHEMERAL },
  }
}

async function handleClaimOrder(orderId: string, member: any, res: express.Response) {
  try {
    const discordId = member?.user?.id
    if (!discordId) {
      res.json(ephemeral("❌ Could not identify your Discord account"))
      return
    }

    // Resolve Discord user to SC Market account
    const user = await profileDb.getUserByDiscordId(discordId)
    if (!user) {
      res.json(ephemeral("❌ Your Discord account is not linked to an SC Market account"))
      return
    }

    // Fetch the order
    const order = await orderDb.getOrder({ order_id: orderId })
    if (!order) {
      res.json(ephemeral("❌ This order no longer exists"))
      return
    }

    if (order.status === "cancelled" || order.status === "fulfilled") {
      res.json(ephemeral("❌ This order is no longer available"))
      return
    }

    if (order.assigned_id) {
      res.json(ephemeral("❌ This order has already been claimed"))
      return
    }

    if (!order.contractor_id) {
      res.json(ephemeral("❌ This order cannot be claimed (no organization)"))
      return
    }

    // Check membership and permission
    if (!(await is_member(order.contractor_id, user.user_id))) {
      res.json(ephemeral("❌ You are not a member of this organization"))
      return
    }

    if (!(await has_permission(order.contractor_id, user.user_id, "claim_orders"))) {
      res.json(ephemeral("❌ You don't have permission to claim orders for this organization"))
      return
    }

    // Assign the order
    await knex()("orders")
      .where({ order_id: orderId })
      .update({ assigned_id: user.user_id })

    // Respond: update the original message to show claimed + disable button
    res.json({
      type: RESPONSE_UPDATE_MESSAGE,
      data: {
        components: [{
          type: COMPONENT_ACTION_ROW,
          components: [{
            type: COMPONENT_BUTTON,
            style: BUTTON_SECONDARY,
            label: `Claimed by ${user.display_name}`,
            custom_id: `claim_order:${orderId}`,
            disabled: true,
          }],
        }],
      },
    })

    // Fire assignment notification asynchronously (don't block the response)
    logger.info(`Order ${orderId} claimed by ${user.username} via Discord`)
  } catch (err) {
    logger.error("Failed to handle claim order interaction", { error: err, orderId })
    res.json(ephemeral("❌ An error occurred while claiming this order"))
  }
}

async function handleClaimOffer(sessionId: string, member: any, res: express.Response) {
  try {
    const discordId = member?.user?.id
    if (!discordId) {
      res.json(ephemeral("❌ Could not identify your Discord account"))
      return
    }

    const user = await profileDb.getUserByDiscordId(discordId)
    if (!user) {
      res.json(ephemeral("❌ Your Discord account is not linked to an SC Market account"))
      return
    }

    // Fetch the offer session
    const session = await knex()("offer_sessions").where({ id: sessionId }).first()
    if (!session) {
      res.json(ephemeral("❌ This offer no longer exists"))
      return
    }

    if (session.status === "rejected" || session.status === "cancelled") {
      res.json(ephemeral("❌ This offer is no longer available"))
      return
    }

    if (session.assigned_id) {
      res.json(ephemeral("❌ This offer has already been claimed"))
      return
    }

    if (!session.contractor_id) {
      res.json(ephemeral("❌ This offer cannot be claimed (no organization)"))
      return
    }

    if (!(await is_member(session.contractor_id, user.user_id))) {
      res.json(ephemeral("❌ You are not a member of this organization"))
      return
    }

    if (!(await has_permission(session.contractor_id, user.user_id, "claim_orders"))) {
      res.json(ephemeral("❌ You don't have permission to claim offers for this organization"))
      return
    }

    // Assign the offer session
    await knex()("offer_sessions")
      .where({ id: sessionId })
      .update({ assigned_id: user.user_id })

    res.json({
      type: RESPONSE_UPDATE_MESSAGE,
      data: {
        components: [{
          type: COMPONENT_ACTION_ROW,
          components: [{
            type: COMPONENT_BUTTON,
            style: BUTTON_SECONDARY,
            label: `Claimed by ${user.display_name}`,
            custom_id: `claim_offer:${sessionId}`,
            disabled: true,
          }],
        }],
      },
    })

    logger.info(`Offer ${sessionId} claimed by ${user.username} via Discord`)
  } catch (err) {
    logger.error("Failed to handle claim offer interaction", { error: err, sessionId })
    res.json(ephemeral("❌ An error occurred while claiming this offer"))
  }
}
