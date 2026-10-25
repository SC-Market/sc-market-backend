import express from "express"
import { getKnex } from "../../clients/database/knex-db.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import { has_permission, is_member } from "../../api/routes/v1/util/permissions.js"
import { DBOrderAlertSubscription } from "../../clients/database/db-models.js"
import logger from "../../logger/logger.js"

const knex = () => getKnex()

export const subscriptionRouter = express.Router()

// POST /alert-subscriptions — create subscription
subscriptionRouter.post("/", async (req, res) => {
  try {
    const { channel_id, guild_id, spectrum_id, discord_id } = req.body as {
      channel_id?: string
      guild_id?: string
      spectrum_id?: string
      discord_id?: string
    }

    if (!channel_id || !guild_id || !discord_id) {
      res.status(400).json({ error: "channel_id, guild_id, and discord_id are required" })
      return
    }

    // Resolve Discord user to SC Market account
    const user = await profileDb.getUserByDiscordId(discord_id)
    if (!user) {
      res.status(404).json({ error: "No SC Market account linked to this Discord user" })
      return
    }

    let contractorId: string | null = null
    let userId: string | null = null

    if (spectrum_id) {
      // Org subscription
      const contractor = await contractorDb.getContractor({ spectrum_id })
      if (!contractor) {
        res.status(404).json({ error: "Organization not found" })
        return
      }
      if (!(await is_member(contractor.contractor_id, user.user_id))) {
        res.status(403).json({ error: "You are not a member of this organization" })
        return
      }
      contractorId = contractor.contractor_id
    } else {
      // Personal subscription
      userId = user.user_id
    }

    // Check if channel already has a subscription
    const existing = await knex()<DBOrderAlertSubscription>("order_alert_subscriptions")
      .where({ channel_id })
      .first()

    if (existing) {
      // Update existing
      await knex()("order_alert_subscriptions")
        .where({ channel_id })
        .update({
          guild_id,
          contractor_id: contractorId,
          user_id: userId,
          created_by_discord_id: discord_id,
        })
    } else {
      await knex()("order_alert_subscriptions").insert({
        channel_id,
        guild_id,
        contractor_id: contractorId,
        user_id: userId,
        created_by_discord_id: discord_id,
      })
    }

    const result = await knex()<DBOrderAlertSubscription>("order_alert_subscriptions")
      .where({ channel_id })
      .first()

    res.json({ data: result })
  } catch (err) {
    logger.error("Failed to create alert subscription", { error: err })
    res.status(500).json({ error: "Failed to create subscription" })
  }
})

// Org roles that may remove an org's alert subscription even if someone else
// created it. Site admins pass via has_permission.
const ORG_UNSUBSCRIBE_PERMISSIONS = ["manage_orders", "manage_webhooks"] as const

/**
 * Whether the Discord user may remove `sub`: they created it, or (with a
 * linked SC Market account) they own the personal subscription, are a site
 * admin, or hold a management permission in the subscribed org.
 */
async function canRemoveSubscription(
  sub: DBOrderAlertSubscription,
  discord_id: string,
): Promise<boolean> {
  if (sub.created_by_discord_id === discord_id) return true

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) return false

  if (sub.contractor_id) {
    for (const permission of ORG_UNSUBSCRIBE_PERMISSIONS) {
      if (await has_permission(sub.contractor_id, user.user_id, permission)) {
        return true
      }
    }
    return false
  }

  return sub.user_id === user.user_id || user.role === "admin"
}

// DELETE /alert-subscriptions/:channel_id  body: { discord_id }
subscriptionRouter.delete("/:channel_id", async (req, res) => {
  try {
    const { discord_id } = (req.body ?? {}) as { discord_id?: unknown }
    // Bots that predate this check send no discord_id; reject rather than
    // deleting on channel_id alone.
    if (typeof discord_id !== "string" || !discord_id) {
      res.status(400).json({ error: "discord_id is required" })
      return
    }

    const sub = await knex()<DBOrderAlertSubscription>("order_alert_subscriptions")
      .where({ channel_id: req.params.channel_id })
      .first()

    if (!sub) {
      res.status(404).json({ error: "No subscription found for this channel" })
      return
    }

    if (!(await canRemoveSubscription(sub, discord_id))) {
      res.status(403).json({
        error:
          "Only the subscription's creator or an organization manager can remove this subscription",
      })
      return
    }

    await knex()("order_alert_subscriptions").where({ id: sub.id }).del()
    res.json({ data: { message: "Subscription removed" } })
  } catch (err) {
    logger.error("Failed to delete alert subscription", { error: err })
    res.status(500).json({ error: "Failed to delete subscription" })
  }
})

// GET /alert-subscriptions/:channel_id
subscriptionRouter.get("/:channel_id", async (req, res) => {
  try {
    const sub = await knex()<DBOrderAlertSubscription>("order_alert_subscriptions")
      .where({ channel_id: req.params.channel_id })
      .first()

    if (!sub) {
      res.status(404).json({ error: "No subscription found" })
      return
    }
    res.json({ data: sub })
  } catch (err) {
    logger.error("Failed to get alert subscription", { error: err })
    res.status(500).json({ error: "Failed to get subscription" })
  }
})
