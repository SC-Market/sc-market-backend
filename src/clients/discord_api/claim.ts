import express from "express"
import { getKnex } from "../../clients/database/knex-db.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"
import { has_permission, is_member } from "../../api/routes/v1/util/permissions.js"
import logger from "../../logger/logger.js"

const knex = () => getKnex()

export const claimRouter = express.Router()

// POST /claim/order — called by the bot when a user clicks "Claim Order"
claimRouter.post("/order", async (req, res) => {
  try {
    const { order_id, discord_id } = req.body
    if (!order_id || !discord_id) {
      res.status(400).json({ error: "order_id and discord_id are required" })
      return
    }

    const user = await profileDb.getUserByDiscordId(discord_id)
    if (!user) {
      res.json({ success: false, error: "Your Discord account is not linked to an SC Market account" })
      return
    }

    const order = await orderDb.getOrder({ order_id })
    if (!order) { res.json({ success: false, error: "This order no longer exists" }); return }
    if (order.status === "cancelled" || order.status === "fulfilled") { res.json({ success: false, error: "This order is no longer available" }); return }
    if (order.assigned_id) { res.json({ success: false, error: "This order has already been claimed" }); return }
    if (!order.contractor_id) { res.json({ success: false, error: "This order cannot be claimed (no organization)" }); return }
    if (!(await is_member(order.contractor_id, user.user_id))) { res.json({ success: false, error: "You are not a member of this organization" }); return }
    if (!(await has_permission(order.contractor_id, user.user_id, "claim_orders"))) { res.json({ success: false, error: "You don't have permission to claim orders for this organization" }); return }

    await knex()("orders").where({ order_id }).update({ assigned_id: user.user_id })
    logger.info(`Order ${order_id} claimed by ${user.username} via Discord`)
    res.json({ success: true, display_name: user.display_name })
  } catch (err) {
    logger.error("Failed to process order claim", { error: err })
    res.status(500).json({ error: "Internal error" })
  }
})

// POST /claim/offer — called by the bot when a user clicks "Claim Offer"
claimRouter.post("/offer", async (req, res) => {
  try {
    const { session_id, discord_id } = req.body
    if (!session_id || !discord_id) {
      res.status(400).json({ error: "session_id and discord_id are required" })
      return
    }

    const user = await profileDb.getUserByDiscordId(discord_id)
    if (!user) {
      res.json({ success: false, error: "Your Discord account is not linked to an SC Market account" })
      return
    }

    const session = await knex()("offer_sessions").where({ id: session_id }).first()
    if (!session) { res.json({ success: false, error: "This offer no longer exists" }); return }
    if (session.status === "rejected" || session.status === "cancelled") { res.json({ success: false, error: "This offer is no longer available" }); return }
    if (session.assigned_id) { res.json({ success: false, error: "This offer has already been claimed" }); return }
    if (!session.contractor_id) { res.json({ success: false, error: "This offer cannot be claimed (no organization)" }); return }
    if (!(await is_member(session.contractor_id, user.user_id))) { res.json({ success: false, error: "You are not a member of this organization" }); return }
    if (!(await has_permission(session.contractor_id, user.user_id, "claim_orders"))) { res.json({ success: false, error: "You don't have permission to claim offers for this organization" }); return }

    await knex()("offer_sessions").where({ id: session_id }).update({ assigned_id: user.user_id })
    logger.info(`Offer ${session_id} claimed by ${user.username} via Discord`)
    res.json({ success: true, display_name: user.display_name })
  } catch (err) {
    logger.error("Failed to process offer claim", { error: err })
    res.status(500).json({ error: "Internal error" })
  }
})
