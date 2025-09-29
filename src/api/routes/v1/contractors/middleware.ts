import { NextFunction, Request, Response } from "express"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { has_permission, is_member } from "../util/permissions.js"
import { DBContractorRole } from "../../../../clients/database/db-models.js"
import { createErrorResponse } from "../util/response.js"
import logger from "../../../../logger/logger.js"

export async function valid_contractor(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const spectrum_id = req.params["spectrum_id"]
  try {
    req.contractor = await database.getContractor({ spectrum_id })
    next()
  } catch {
    res.status(400).json(createErrorResponse({ error: "Invalid contractor" }))
    return
  }
}

export async function org_authorized(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.isAuthenticated()) {
    const user = req.user as User
    if (user.banned) {
      res
        .status(418)
        .json(createErrorResponse({ error: "Internal server error" }))
      return
    }

    const spectrum_id = req.params["spectrum_id"]
    let contractor
    try {
      contractor = await database.getContractor({ spectrum_id })
    } catch (e) {
      res.status(400).json(createErrorResponse({ error: "Invalid contractor" }))
      return
    }

    if (!(await is_member(contractor.contractor_id, user.user_id))) {
      res.status(403).json(createErrorResponse({ error: "Unauthorized" }))
      return
    } else {
      req.contractor = contractor
      next()
    }
  } else {
    res.status(401).json(createErrorResponse({ error: "Unauthenticated" }))
    return
  }
}

export function org_permission(permission_name: keyof DBContractorRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    logger.debug("Checking organization permission", {
      permission: permission_name,
    })
    if (req.isAuthenticated()) {
      const user = req.user as User
      logger.debug("User authenticated for permission check", {
        username: user.username,
        userId: user.user_id,
      })
      if (user.banned) {
        logger.warn("Banned user attempted to access contractor resource", {
          username: user.username,
        })
        res
          .status(418)
          .json(createErrorResponse({ error: "Internal server error" }))
        return
      }

      const spectrum_id = req.params["spectrum_id"]
      logger.debug("Looking up contractor for permission check", {
        spectrum_id,
      })
      let contractor
      try {
        contractor = await database.getContractor({ spectrum_id })
        logger.debug("Found contractor for permission check", {
          contractorName: contractor.name,
          contractorId: contractor.contractor_id,
        })
      } catch (e) {
        logger.error("Error finding contractor for permission check", {
          spectrum_id,
          error: e instanceof Error ? e.message : String(e),
        })
        res
          .status(400)
          .json(createErrorResponse({ error: "Invalid contractor" }))
        return
      }

      const hasPermission = await has_permission(
        contractor.contractor_id,
        user.user_id,
        permission_name,
      )
      logger.debug("Permission check completed", {
        permission: permission_name,
        hasPermission,
        contractorName: contractor.name,
      })

      if (!hasPermission) {
        logger.warn("User lacks required permission", {
          username: user.username,
          permission: permission_name,
          contractorName: contractor.name,
        })
        res.status(403).json(createErrorResponse({ error: "Unauthorized" }))
        return
      }

      req.contractor = contractor
      logger.debug("Permission granted, proceeding to route handler")
      next()
    } else {
      logger.warn(
        "Unauthenticated user attempted to access contractor resource",
      )
      res.status(401).json(createErrorResponse({ error: "Unauthenticated" }))
    }
  }
}

export function validate_optional_spectrum_id(path: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const spectrum_id = req.query[path] as string
    if (!spectrum_id) {
      return next()
    }

    let contractor
    try {
      contractor = await database.getContractor({ spectrum_id })
    } catch {
      res
        .status(404)
        .json(
          createErrorResponse({ error: "Contractor not found", contractor }),
        )
      return
    }

    if (!req.contractors) {
      req.contractors = new Map<string, User>()
    }
    req.contractors.set(path, contractor)
    next()
  }
}
