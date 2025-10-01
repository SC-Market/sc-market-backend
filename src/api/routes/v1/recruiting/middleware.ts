import { NextFunction, Request, Response } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { createErrorResponse } from "../util/response.js"
import logger from "../../../../logger/logger.js"

export async function valid_recruiting_post(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const post_id = req.params["post_id"]

  if (!post_id) {
    res
      .status(400)
      .json(createErrorResponse({ message: "Missing post_id parameter" }))
    return
  }

  try {
    const post = await database.getRecruitingPost({ post_id })

    if (!post) {
      res
        .status(404)
        .json(createErrorResponse({ message: "Recruiting post not found" }))
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
      .json(createErrorResponse({ message: "Internal server error" }))
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
      .json(createErrorResponse({ message: "Missing spectrum_id parameter" }))
    return
  }

  try {
    // First get the contractor
    const contractor = await database.getContractor({ spectrum_id })

    if (!contractor) {
      res
        .status(404)
        .json(createErrorResponse({ message: "Contractor not found" }))
      return
    }

    // Then get the recruiting post for this contractor
    const post = await database.getRecruitingPost({
      contractor_id: contractor.contractor_id,
    })

    if (!post) {
      res.status(404).json(
        createErrorResponse({
          message: "No recruiting post found for this contractor",
        }),
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
      .json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}
