import { NextFunction, Request, Response } from "express"
import { User } from "../routes/v1/api-models.js"
import { getKnex } from "../../clients/database/knex-db.js"
import * as marketDb from "../routes/v1/market/database.js"
import logger from "../../logger/logger.js"

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
        // Test accounts don't count as active users (services/test-accounts).
        user.is_test ? Promise.resolve() : marketDb.upsertDailyActivity(user.user_id),
        knex("accounts")
          .where({ user_id: user.user_id })
          .update({ last_seen: knex.fn.now() }),
      ])
    }
  } catch (error) {
    // Activity tracking is best-effort. Express 4 doesn't catch rejections from
    // async middleware, so an unhandled DB error here would crash the process.
    logger.warn("Failed to track user activity", { error })
  } finally {
    next()
  }
}
