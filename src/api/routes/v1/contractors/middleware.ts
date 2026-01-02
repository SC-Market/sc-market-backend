import { NextFunction, Request, Response } from "express"
import { User } from "../api-models.js"
import { has_permission, is_member } from "../util/permissions.js"
import * as contractorDb from "./database.js"
import { DBContractorRole } from "../../../../clients/database/db-models.js"
import {
  createErrorResponse,
  createUnauthorizedErrorResponse,
  createForbiddenErrorResponse,
  createConflictErrorResponse,
  createNotFoundErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"

export async function valid_contractor(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const spectrum_id = req.params["spectrum_id"]
  try {
    req.contractor = await contractorDb.getContractor({ spectrum_id })
    if (!req.contractor) {
      throw new Error("Invalid contractor")
    }
    next()
  } catch {
    res
      .status(400)
      .json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid contractor"),
      )
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
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Internal server error",
          ),
        )
      return
    }

    const spectrum_id = req.params["spectrum_id"]
    let contractor
    try {
      contractor = await contractorDb.getContractor({ spectrum_id })
    } catch (e) {
      res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid contractor"),
        )
      return
    }

    if (contractor.archived) {
      res
        .status(409)
        .json(
          createConflictErrorResponse(
            "This organization has been archived and is no longer editable.",
          ),
        )
      return
    }

    if (!(await is_member(contractor.contractor_id, user.user_id))) {
      res.status(403).json(createForbiddenErrorResponse("Unauthorized"))
      return
    } else {
      req.contractor = contractor
      next()
    }
  } else {
    res.status(401).json(createUnauthorizedErrorResponse("Unauthenticated"))
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
          .json(
            createErrorResponse(
              ErrorCode.INTERNAL_SERVER_ERROR,
              "Internal server error",
            ),
          )
        return
      }

      const spectrum_id = req.params["spectrum_id"]
      logger.debug("Looking up contractor for permission check", {
        spectrum_id,
      })
      let contractor
      try {
        contractor = await contractorDb.getContractor({ spectrum_id })
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
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Invalid contractor",
            ),
          )
        return
      }

      if (contractor.archived) {
        logger.warn("Attempt to mutate archived contractor", {
          username: user.username,
          permission: permission_name,
          contractorName: contractor.name,
        })
        res
          .status(409)
          .json(
            createConflictErrorResponse(
              "This organization has been archived and is read-only.",
            ),
          )
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
        res.status(403).json(createForbiddenErrorResponse("Unauthorized"))
        return
      }

      req.contractor = contractor
      logger.debug("Permission granted, proceeding to route handler")
      next()
    } else {
      logger.warn(
        "Unauthenticated user attempted to access contractor resource",
      )
      res.status(401).json(createUnauthorizedErrorResponse("Unauthenticated"))
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
      contractor = await contractorDb.getContractor({ spectrum_id })
    } catch {
      res
        .status(404)
        .json(createNotFoundErrorResponse("Contractor", spectrum_id))
      return
    }

    if (!req.contractors) {
      req.contractors = new Map<string, User>()
    }
    req.contractors.set(path, contractor)
    next()
  }
}
