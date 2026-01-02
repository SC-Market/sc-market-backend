import { RequestHandler } from "express"
import logger from "../../../../logger/logger.js"
import { fetchCommodities } from "../../../../services/uex/uex.service.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"

export const commodity_get_root: RequestHandler = async function (req, res) {
  try {
    const commodities = await fetchCommodities()
    res.json(createResponse(commodities))
  } catch (error) {
    logger.error("Error in commodity_get_root", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to fetch commodities",
        {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      ),
    )
  }
}
