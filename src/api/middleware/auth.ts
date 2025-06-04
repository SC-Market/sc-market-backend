import { NextFunction, Request, Response } from "express"
import { User } from "../routes/v1/api-models.js"

export function pageAuthentication(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.isAuthenticated()) {
    next()
  } else {
    res.redirect("/auth/discord")
  }
}

export async function guestAuthorized(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.isAuthenticated()) {
    next()
  } else {
    res.status(401).send({ error: "Unauthenticated" })
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(err)
  }

  res.status(err.status || 500).json({
    message: err.message,
    errors: err.errors,
    validationErrors: err.validationErrors,
  })
}

export async function userAuthorized(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (req.isAuthenticated()) {
      const user = req.user as User
      if (user.banned) {
        return res.status(418).json({ error: "Internal server error" })
      }
      if (user.role === "user" || user.role === "admin") {
        return next()
      } else {
        return res.status(403).send({ error: "Unauthorized" })
      }
    } else {
      return res.status(401).send({ error: "Unauthenticated" })
    }
  } catch (e) {
    console.error(e)
    return res.status(400)
  }
}

export async function verifiedUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.isAuthenticated()) {
    const user = req.user as User
    if (user.banned) {
      return res.status(418).json({ error: "Internal server error" })
    }
    if (!user.rsi_confirmed) {
      return res.status(401).send({ error: "Your account is not verified." })
    } else {
      next()
    }
  } else {
    res.status(401).send({ error: "Unauthenticated" })
  }
}

export function adminAuthorized(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.isAuthenticated()) {
    const user = req.user as User
    if (user.banned) {
      res.status(418).json({ error: "Internal server error" })
      return
    }
    if (user.role === "admin") {
      next()
    } else {
      res.status(403).send({ error: "Unauthorized" })
      return
    }
  } else {
    res.status(401).send({ error: "Unauthenticated" })
  }
}

// Don't try to make this file depend on `database` or everything will break
