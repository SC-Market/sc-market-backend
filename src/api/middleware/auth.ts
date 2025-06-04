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
    res.status(401).json({ error: "Unauthenticated" })
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
): Promise<void> {
  try {
    if (req.isAuthenticated()) {
      const user = req.user as User
      if (user.banned) {
        res.status(418).json({ error: "Internal server error" })
        return
      }
      if (user.role === "user" || user.role === "admin") {
        return next()
      } else {
        res.status(403).json({ error: "Unauthorized" })
        return
      }
    } else {
      res.status(401).json({ error: "Unauthenticated" })
      return
    }
  } catch (e) {
    console.error(e)
    res.status(400)
    return
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
      res.status(418).json({ error: "Internal server error" })
      return
    }
    if (!user.rsi_confirmed) {
      res.status(401).json({ error: "Your account is not verified." })
      return
    } else {
      next()
    }
  } else {
    res.status(401).json({ error: "Unauthenticated" })
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
      res.status(403).json({ error: "Unauthorized" })
      return
    }
  } else {
    res.status(401).json({ error: "Unauthenticated" })
  }
}

// Don't try to make this file depend on `database` or everything will break
