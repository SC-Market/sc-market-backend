import { NextFunction, Request, Response } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { User } from "../api-models.js"

export async function adminOverride(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.isAuthenticated()) {
    const user = req.user as User
    if (user.role === "admin") {
      const override = req.query.admin_override as string | undefined
      if (override) {
        try {
          req.user = await database.getUser({ username: override })
          next()
        } catch {
          next()
        }
      } else {
        next()
      }
    } else {
      next()
    }
  }
}
