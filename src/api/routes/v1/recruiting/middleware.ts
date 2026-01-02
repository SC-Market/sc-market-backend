import { NextFunction, Request, Response } from "express"
import {
  createErrorResponse,
  createUnauthorizedErrorResponse,
  createForbiddenErrorResponse,
  createNotFoundErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"
import { User } from "../api-models.js"
import { has_permission } from "../util/permissions.js"
import * as recruitingDb from "./database.js"
import * as contractorDb from "../contractors/database.js"

export async function valid_recruiting_post(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const post_id = req.params["post_id"]

  if (!post_id) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Missing post_id parameter",
        ),
      )
    return
  }

  try {
    const post = await recruitingDb.getRecruitingPost({ post_id })

    if (!post) {
      res
        .status(404)
        .json(createNotFoundErrorResponse("Recruiting post", post_id))
      return
    }

    req.recruiting_post = post
    next()
  } catch (error) {
    logger.error("Failed to validate recruiting post", {
      post_id,
      error: error instanceof Error ? error.message : String(error),
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
    return
  }
}

export async function valid_recruiting_post_by_contractor(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const spectrum_id = req.params["spectrum_id"]

  if (!spectrum_id) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Missing spectrum_id parameter",
        ),
      )
    return
  }

  try {
    // First get the contractor
    const contractor = await contractorDb.getContractor({ spectrum_id })

    if (!contractor) {
      res
        .status(404)
        .json(createNotFoundErrorResponse("Contractor", spectrum_id))
      return
    }

    // Then get the recruiting post for this contractor
    const post = await recruitingDb.getRecruitingPost({
      contractor_id: contractor.contractor_id,
    })

    if (!post) {
      res
        .status(404)
        .json(
          createNotFoundErrorResponse(
            "Recruiting post",
            `contractor: ${spectrum_id}`,
          ),
        )
      return
    }

    req.recruiting_post = post
    req.contractor = contractor
    next()
  } catch (error) {
    logger.error("Failed to validate recruiting post by contractor", {
      spectrum_id,
      error: error instanceof Error ? error.message : String(error),
    })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
    return
  }
}
export async function contractorRecruiting(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.isAuthenticated()) {
    const {
      contractor: spectrum_id,
    }: {
      contractor: string
    } = req.body

    const user = req.user as User

    let contractor
    try {
      contractor = await contractorDb.getContractor({ spectrum_id })
    } catch (e) {
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

    req.contractor = contractor

    const success = await has_permission(
      contractor.contractor_id,
      user.user_id,
      "manage_recruiting",
    )
    if (!success) {
      res
        .status(403)
        .json(
          createForbiddenErrorResponse(
            "Missing permissions to manage recruiting",
          ),
        )
      return
    }

    next()
  } else {
    res
      .status(401)
      .json(createUnauthorizedErrorResponse("Unauthenticated"))
  }
}
