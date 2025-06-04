import { NextFunction, Request, Response } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { createErrorResponse } from "../util/response.js"
import { User } from "../api-models.js"

export function validate_optional_username(path: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const username = req.query[path] as string
    if (!username) {
      next()
      return
    }

    let user
    try {
      user = await database.getUser({ username })
    } catch {
      res
        .status(404)
        .json(createErrorResponse({ error: "User not found", username }))
      return
    }

    if (!req.users) {
      req.users = new Map<string, User>()
    }
    req.users.set(path, user)
    next()
  }
}
