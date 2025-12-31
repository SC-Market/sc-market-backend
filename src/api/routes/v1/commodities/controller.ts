import { RequestHandler } from "express"
import logger from "../../../../logger/logger.js"
import { fetchCommodities } from "../../../../services/uex/uex.service.js"

export const commodity_get_root: RequestHandler = async function (req, res) {
  try {
    const commodities = await fetchCommodities()
    res.json(commodities)
  } catch (error) {
    logger.error("Error in commodity_get_root", { error })
    res.status(500).json({
      error: "Failed to fetch commodities",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    })
  }
}
