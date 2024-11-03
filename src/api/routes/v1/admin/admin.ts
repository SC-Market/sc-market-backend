import express from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { adminAuthorized } from "../../../middleware/auth.js"
import { createResponse } from "../util/response.js"

export const adminRouter = express.Router()

adminRouter.get("/activity", adminAuthorized, async (req, res) => {
  const daily = await database.getDailyActivity()
  const weekly = await database.getWeeklyActivity()
  const monthly = await database.getMonthlyActivity()
  res.status(200).json(createResponse({ daily, weekly, monthly }))
  return
})
