import { NextFunction, Request, Response } from "express"
import { createErrorResponse } from "../util/response.js"
import { User } from "../api-models.js"
import * as profileDb from "./database.js"

export function validate_optional_username(path: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const username = req.query[path] as string
    if (!username) {
      next()
      return
    }

    let user
    try {
      user = await profileDb.getUser({ username })
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

export function validate_optional_username_body(path: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const username = req.body[path] as string
    if (!username) {
      next()
      return
    }

    let user
    try {
      user = await profileDb.getUser({ username })
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

export function validate_username(path: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check params first, then fall back to query
    const username = req.params[path] as string

    if (!username) {
      res.status(400).json(createErrorResponse({ error: `Missing ${path}` }))
      return
    }

    let user
    try {
      user = await profileDb.getUser({ username })
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
