import { NextFunction, Request, Response } from "express"
import { User } from "../routes/v1/api-models.js"
import { getKnex } from "../../clients/database/knex-db.js"
import * as marketDb from "../routes/v1/market/database.js"

export async function trackActivity(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (req.isAuthenticated()) {
      const user = req.user as User
      const knex = getKnex()
      await Promise.all([
        marketDb.upsertDailyActivity(user.user_id),
        knex("accounts")
          .where({ user_id: user.user_id })
          .update({ last_seen: knex.fn.now() }),
      ])
    }
  } finally {
    next()
  }
}
