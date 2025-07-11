import { NextFunction, Request, Response } from "express"
import { database } from "../../clients/database/knex-db.js"
import { User } from "../routes/v1/api-models.js"

export function rate_limit(points: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as User
    const key = user?.user_id ? user.user_id : req.ip

    database.ratelimiter
      .consume(key!, points!)
      .then(() => {
        next()
      })
      .catch(() => {
        // res.status(429).json('Too Many Requests');
        next()
      })
  }
}
