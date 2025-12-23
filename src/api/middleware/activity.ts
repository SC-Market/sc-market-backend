import { NextFunction, Request, Response } from "express"
import { User } from "../routes/v1/api-models.js"
import { database } from "../../clients/database/knex-db.js"
import * as marketDb from "../routes/v1/market/database.js"

export async function trackActivity(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (req.isAuthenticated()) {
      const user = req.user as User
      marketDb.upsertDailyActivity(user.user_id)
    }
  } finally {
    next()
  }
}
