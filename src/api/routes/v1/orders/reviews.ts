import { Request, RequestHandler, Response } from "express"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  createOrderReviewNotification,
  createOrderReviewRevisionNotification,
} from "../util/notifications.js"
import { has_permission } from "../util/permissions.js"
import { createResponse, createErrorResponse } from "../util/response.js"
import { DBOrder, DBReview } from "../../../../clients/database/db-models.js"
import logger from "../../../../logger/logger.js"

export async function requestReviewRevision(req: Request, res: Response) {
  const { order_id, review_id } = req.params
  const { message } = req.body
  const user = req.user as User

  try {
    // Validate message length if provided
    if (message && message.length > 500) {
      logger.warn("Message too long for revision request", {
        review_id,
        message_length: message.length,
      })
      return res.status(400).json(
        createErrorResponse({
          error: "Message cannot exceed 500 characters",
        }),
      )
    }

    logger.info("Review revision requested", {
      review_id,
      order_id,
      user_id: user.user_id,
      has_message: !!message,
    })

    // Get review and verify it exists
    const review = await database.getOrderReview({ review_id })
    if (!review) {
      logger.warn("Review not found for revision request", { review_id })
      return res
        .status(404)
        .json(createErrorResponse({ error: "Review not found" }))
    }

    // Verify user is the recipient of the review
    const order = await database.getOrder({ order_id })
    const isRecipient =
      (review.role === "customer" && order.customer_id === user.user_id) ||
      (review.role === "contractor" && order.assigned_id === user.user_id)

    if (!isRecipient) {
      logger.warn("User not authorized to request revision", {
        user_id: user.user_id,
        review_role: review.role,
        order_customer_id: order.customer_id,
        order_assigned_id: order.assigned_id,
      })
      return res.status(403).json(
        createErrorResponse({
          error: "You can only request revisions for reviews you received",
        }),
      )
    }

    // Check if revision already requested
    if (review.revision_requested) {
      logger.warn("Revision already requested for review", { review_id })
      return res.status(409).json(
        createErrorResponse({
          error: "Revision already requested for this review",
        }),
      )
    }

    // Request revision
    const updatedReview = await database.requestReviewRevision(
      review_id,
      user.user_id,
      message,
    )

    // Send notification to review author
    await createOrderReviewRevisionNotification(updatedReview, user)

    logger.info("Review revision requested successfully", {
      review_id,
      revision_requested_at: updatedReview.revision_requested_at,
    })

    res.json(
      createResponse({
        review_id: updatedReview.review_id,
        revision_requested: updatedReview.revision_requested,
        revision_requested_at: updatedReview.revision_requested_at,
        revision_message: updatedReview.revision_message,
      }),
    )
  } catch (error: unknown) {
    logger.error("Error requesting review revision", {
      error: error instanceof Error ? error.message : String(error),
      review_id,
      order_id,
      user_id: user.user_id,
    })
    res
      .status(500)
      .json(createErrorResponse({ error: "Internal server error" }))
  }
}

export async function updateOrderReview(req: Request, res: Response) {
  const { order_id, review_id } = req.params
  const { content, rating } = req.body
  const user = req.user as User

  try {
    logger.info("Review update requested", {
      review_id,
      order_id,
      user_id: user.user_id,
    })

    // Get review and verify it exists
    const review = await database.getOrderReview({ review_id })
    if (!review) {
      logger.warn("Review not found for update", { review_id })
      return res
        .status(404)
        .json(createErrorResponse({ error: "Review not found" }))
    }

    // Check if revision was requested
    if (!review.revision_requested) {
      logger.warn("Attempt to edit review without revision request", {
        review_id,
      })
      return res.status(400).json(
        createErrorResponse({
          error: "Review can only be edited after revision request",
        }),
      )
    }

    // Check permissions
    const canEdit = await canEditReview(review, user)
    if (!canEdit) {
      logger.warn("User not authorized to edit review", {
        user_id: user.user_id,
        review_user_author: review.user_author,
        review_contractor_author: review.contractor_author,
      })
      return res.status(403).json(
        createErrorResponse({
          error: "You don't have permission to edit this review",
        }),
      )
    }

    // Validate input
    if (!content || content.length < 10 || content.length > 2000) {
      logger.warn("Invalid content length for review update", {
        content_length: content?.length || 0,
      })
      return res.status(400).json(
        createErrorResponse({
          error: "Content must be between 10 and 2000 characters",
        }),
      )
    }

    if (!rating || rating < 1 || rating > 5 || rating % 1 !== 0) {
      logger.warn("Invalid rating for review update", { rating })
      return res.status(400).json(
        createErrorResponse({
          error: "Rating must be a whole number between 1 and 5",
        }),
      )
    }

    // Update review
    const updatedReview = await database.updateOrderReview(review_id, {
      content: content.trim(),
      rating,
      revision_requested: false, // Mark revision as resolved
      last_modified_at: new Date(),
    })

    logger.info("Review updated successfully", {
      review_id,
      last_modified_at: updatedReview.last_modified_at,
    })

    res.json(
      createResponse({
        review_id: updatedReview.review_id,
        last_modified_at: updatedReview.last_modified_at,
        revision_requested: updatedReview.revision_requested,
      }),
    )
  } catch (error: unknown) {
    logger.error("Error updating review", {
      error: error instanceof Error ? error.message : String(error),
      review_id,
      order_id,
      user_id: user.user_id,
    })
    res
      .status(500)
      .json(createErrorResponse({ error: "Internal server error" }))
  }
}

async function canEditReview(review: DBReview, user: User): Promise<boolean> {
  // Individual user can edit their own review
  if (review.user_author === user.user_id) {
    return true
  }

  // Organization member can edit org review if they have permission
  if (review.contractor_author) {
    const order = await database.getOrder({ order_id: review.order_id })
    if (order.contractor_id) {
      // Check if the contractor_author matches the order's contractor
      const contractor = await database.getContractor({
        contractor_id: order.contractor_id,
      })
      if (contractor.spectrum_id === review.contractor_author) {
        return await has_permission(
          order.contractor_id,
          user.user_id,
          "manage_orders",
        )
      }
    }
  }

  return false
}

export const post_order_review: RequestHandler = async (req, res, next) => {
  const order_id = req.params["order_id"]
  let order: DBOrder
  try {
    order = await database.getOrder({ order_id: order_id })
  } catch (e) {
    res.status(404).json({ message: "Invalid order" })
    return
  }
  const user = req.user as User

  const {
    content,
    rating,
    role,
  }: {
    content: string
    rating: number
    role: string
  } = req.body

  if (!["customer", "contractor"].includes(role)) {
    res.status(400).json({ message: "Invalid role" })
    return
  }

  const amCustomer = order.customer_id === user.user_id
  const amContractor =
    order.assigned_id === user.user_id ||
    (order.contractor_id &&
      (await has_permission(
        order.contractor_id,
        user.user_id,
        "manage_orders",
      )))

  if (role === "customer" && !amCustomer) {
    res
      .status(403)
      .json({ message: "You are not authorized to review this order!" })
    return
  }
  if (role === "contractor" && !amContractor) {
    res
      .status(403)
      .json({ message: "You are not authorized to review this order!" })
    return
  }

  if (!content) {
    res.status(400).json({ message: "Message content cannot be empty!" })
    return
  }

  if (!rating || rating > 5 || rating < 1 || rating % 1 !== 0) {
    res
      .status(400)
      .json({ message: "Rating must be a whole number between 1 and 5" })
    return
  }

  const existing = await database.getOrderReview({
    order_id: order.order_id,
    role: role as "customer" | "contractor",
  })
  if (existing) {
    res
      .status(409)
      .json({ message: "A review has already been left on this order" })
    return
  }

  const review = await database.createOrderReview({
    order_id: order.order_id,
    content: content,
    user_author: user.user_id,
    rating: rating,
    role: role as "customer" | "contractor",
  })

  await createOrderReviewNotification(review[0])

  res.status(200).json(createResponse({ result: "Success" }))
}
