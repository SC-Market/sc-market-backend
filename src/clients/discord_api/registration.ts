import express from "express"
import { database } from "../database/knex-db.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"

export const registrationRouter = express.Router()

registrationRouter.post("/contractor/:spectrum_id", async (req, res) => {
  try {
    const spectrum_id = req.params["spectrum_id"]
    const { channel_id, server_id, discord_id } = req.body as {
      channel_id?: string
      server_id?: string
      discord_id?: string
    }

    let user
    try {
      user = await database.getUser({ discord_id: discord_id })
      database.upsertDailyActivity(user.user_id)
    } catch (e) {
      res.status(403).json({
        error:
          "You are not registered. Please sign up on [SC Market](https://sc-market.space/)",
      })
      return
    }

    let contractor
    try {
      contractor = await database.getContractor({ spectrum_id: spectrum_id })
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
      console.log(contractor, user)
      res.status(403).json({
        error:
          "You do not have permission to register on behalf of this contractor",
      })
      return
    }

    if (server_id) {
      await database.updateContractor(
        { spectrum_id: spectrum_id },
        { official_server_id: server_id },
      )
    }

    if (channel_id) {
      await database.updateContractor(
        { spectrum_id: spectrum_id },
        { discord_thread_channel_id: channel_id },
      )
    }

    res.json({ result: "Success" })
  } catch (e) {
    console.error(e)
    return
  }
})

registrationRouter.post("/user", async (req, res) => {
  const { channel_id, server_id, discord_id } = req.body as {
    channel_id?: string
    server_id?: string
    discord_id?: string
  }

  let user
  try {
    user = await database.getUser({ discord_id: discord_id })
    database.upsertDailyActivity(user.user_id)
  } catch (e) {
    res.status(403).json({
      error:
        "You are not registered. Please sign up on [SC Market](https://sc-market.space/)",
    })
    return
  }

  if (server_id) {
    await database.updateUser(
      { user_id: user.user_id },
      { official_server_id: server_id },
    )
  }

  if (channel_id) {
    await database.updateUser(
      { user_id: user.user_id },
      { discord_thread_channel_id: channel_id },
    )
  }

  res.json({ result: "Success" })
})
