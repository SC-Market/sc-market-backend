import { NextFunction, Request, Response } from "express"
import { database } from "../../clients/database/knex-db.js"
import { User } from "../routes/v1/api-models.js"

export function rate_limit(points: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as User
    const key = user?.user_id ? user.user_id : req.ip
    next()
    database.ratelimiter
      .consume(key!, points!)
      .then(() => {
        next()
      })
      .catch((_) => {
        // res.status(429).send('Too Many Requests');
        next()
      })
  }
}
