import { Controller, Get, Route, Response, Middlewares } from "tsoa"
import { BaseController } from "./base.controller.js"
import { CommoditiesResponse } from "../models/commodities.models.js"
import { ErrorResponse } from "../models/common.models.js"
import { fetchCommodities } from "../../services/uex/uex.service.js"
import { tsoaReadRateLimit } from "../middleware/tsoa-ratelimit.js"

/**
 * Controller for commodity-related endpoints
 * 
 * Provides access to commodity pricing and market data from UEX Corp
 */
@Route("api/v1/commodities")
export class CommoditiesController extends BaseController {
  /**
   * Get commodities data
   * 
   * Retrieves current commodity pricing and market data from UEX Corp API.
   * This endpoint provides information about all available commodities including
   * their prices, availability, and various properties.
   * 
   * @summary Get all commodities
   * @returns Commodities data retrieved successfully
   */
  @Get()
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getCommodities(): Promise<CommoditiesResponse> {
    try {
      const commodities = await fetchCommodities()
      return this.success(commodities)
    } catch (error) {
      this.logError("getCommodities", error)
      this.handleError(error, "getCommodities")
    }
  }
}
