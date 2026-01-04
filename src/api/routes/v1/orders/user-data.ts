import { Request, Response } from "express"
import { User } from "../api-models.js"
import { getUserOrderData } from "./helpers.js"
import { createResponse } from "../util/response.js"
import logger from "../../../../logger/logger.js"

export async function getUserOrderDataController(req: Request, res: Response) {
  const { include_trends } = req.query
  const user = req.user as User

  try {
    // Parse query parameters
    const includeTrends =
      include_trends === "true" || include_trends === undefined

    logger.debug("Getting user order data", {
      user_id: user.user_id,
      include_trends: includeTrends,
    })

    // Get comprehensive user order data
    const data = await getUserOrderData(user.user_id, {
      include_trends: includeTrends,
    })

    logger.debug("User order data retrieved successfully", {
      user_id: user.user_id,
      total_orders: data.metrics.total_orders,
      total_value: data.metrics.total_value,
    })

    res.json(createResponse(data))
  } catch (error) {
    logger.error("Error getting user order data", {
      user_id: user.user_id,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    res.status(500).json(
      createResponse({
        error: "Failed to retrieve user order data",
      }),
    )
  }
}
