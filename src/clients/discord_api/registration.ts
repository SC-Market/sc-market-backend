import express from "express"
import { createRequire } from "node:module"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import * as marketDb from "../../api/routes/v1/market/database.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"
import logger from "../../logger/logger.js"

const require = createRequire(import.meta.url)
const Bugsnag = require("@bugsnag/js") as {
  notify: (
    error: Error,
    onError?: (event: {
      addMetadata: (section: string, values: Record<string, unknown>) => void
    }) => void,
  ) => void
}

export const registrationRouter = express.Router()

registrationRouter.post("/contractor/:spectrum_id", async (req, res) => {
  try {
    const spectrum_id = req.params["spectrum_id"]
    const { channel_id, server_id, discord_id } = req.body as {
      channel_id?: string
      server_id?: string
      discord_id?: string
    }

    if (!discord_id) {
      res.status(400).json({ error: "discord_id is required" })
      return
    }

    let user
    try {
      user = await profileDb.getUserByDiscordId(discord_id)
      if (!user) {
        res.status(403).json({
          error:
            "You are not registered. Please sign up on [SC Market](https://sc-market.space/)",
        })
        return
      }
      marketDb.upsertDailyActivity(user.user_id)
    } catch (e) {
      res.status(403).json({
        error:
          "You are not registered. Please sign up on [SC Market](https://sc-market.space/)",
      })
      return
    }

    let contractor
    try {
      contractor = await contractorDb.getContractor({
        spectrum_id: spectrum_id,
      })
    } catch (e) {
      res.status(400).json({ error: "Invalid contractor Spectrum ID" })
      return
    }

    if (
      !(await has_permission(
        contractor.contractor_id,
        user.user_id,
        "manage_webhooks",
      ))
    ) {
      logger.warn("Permission denied for contractor registration", {
        contractor_id: contractor.contractor_id,
        user_id: user.user_id,
      })
      res.status(403).json({
        error:
          "You do not have permission to register on behalf of this contractor",
      })
      return
    }

    if (server_id) {
      await contractorDb.updateContractor(
        { spectrum_id: spectrum_id },
        { official_server_id: server_id },
      )
    }

    if (channel_id) {
      await contractorDb.updateContractor(
        { spectrum_id: spectrum_id },
        { discord_thread_channel_id: channel_id },
      )
    }

    res.json({ result: "Success" })
  } catch (e) {
    logger.error("Error in contractor registration", { error: e })
    if (process.env.NODE_ENV !== "development") {
      Bugsnag.notify(e instanceof Error ? e : new Error(String(e)), (event) => {
        event.addMetadata("discord_registration", {
          route: "contractor",
          spectrum_id: req.params["spectrum_id"],
        })
      })
    }
    res.status(500).json({
      error:
        "An unexpected error occurred while registering. Please try again or contact support.",
    })
  }
})

registrationRouter.post("/user", async (req, res) => {
  try {
    const { channel_id, server_id, discord_id } = req.body as {
      channel_id?: string
      server_id?: string
      discord_id?: string
    }

    if (!discord_id) {
      res.status(400).json({ error: "discord_id is required" })
      return
    }

    let user
    try {
      user = await profileDb.getUserByDiscordId(discord_id)
      if (!user) {
        res.status(403).json({
          error:
            "You are not registered. Please sign up on [SC Market](https://sc-market.space/)",
        })
        return
      }
      marketDb.upsertDailyActivity(user.user_id)
    } catch (e) {
      res.status(403).json({
        error:
          "You are not registered. Please sign up on [SC Market](https://sc-market.space/)",
      })
      return
    }

    // Update Discord integration settings using new system
    // Also update old columns for backward compatibility during transition
    const currentIntegration = await profileDb.getUserIntegration(
      user.user_id,
      "discord",
    )
    const currentSettings = currentIntegration?.settings || {}

    const newSettings = {
      ...currentSettings,
      ...(server_id && { official_server_id: server_id }),
      ...(channel_id && { discord_thread_channel_id: channel_id }),
    }

    await profileDb.upsertIntegration(user.user_id, {
      integration_type: "discord",
      settings: newSettings,
      enabled: true,
    })

    // Also update old columns for backward compatibility
    const updateData: {
      official_server_id?: string
      discord_thread_channel_id?: string
    } = {}
    if (server_id) updateData.official_server_id = server_id
    if (channel_id) updateData.discord_thread_channel_id = channel_id

    if (Object.keys(updateData).length > 0) {
      await profileDb.updateUser({ user_id: user.user_id }, updateData)
    }

    res.json({ result: "Success" })
  } catch (e) {
    logger.error("Error in user registration", { error: e })
    if (process.env.NODE_ENV !== "development") {
      Bugsnag.notify(e instanceof Error ? e : new Error(String(e)), (event) => {
        event.addMetadata("discord_registration", { route: "user" })
      })
    }
    res.status(500).json({
      error:
        "An unexpected error occurred while registering. Please try again or contact support.",
    })
  }
})
