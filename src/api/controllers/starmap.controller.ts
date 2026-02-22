import { Controller, Get, Route, Path, Response, Middlewares, Query } from "tsoa"
import { BaseController } from "./base.controller.js"
import {
  RouteResponse,
  ObjectResponse,
  SearchResponse,
} from "../models/starmap.models.js"
import { ErrorResponse } from "../models/common.models.js"
import { tsoaReadRateLimit } from "../middleware/tsoa-ratelimit.js"

/**
 * Controller for starmap-related endpoints
 * 
 * Provides access to Star Citizen starmap data from Roberts Space Industries API
 */
@Route("api/v1/starmap")
export class StarmapController extends BaseController {
  /**
   * Get route between locations
   * 
   * Calculates a route between two starmap locations using the RSI API.
   * 
   * @summary Get route between two locations
   * @param from Starting location identifier
   * @param to Destination location identifier
   * @param ship_size Ship size category (S, M, L) - defaults to L
   * @returns Route data
   */
  @Get("route/{from}/{to}")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getRoute(
    @Path() from: string,
    @Path() to: string,
    @Query() ship_size?: string
  ): Promise<RouteResponse> {
    try {
      const route = await this.fetchRoute(from, to, ship_size)
      return { data: route }
    } catch (error) {
      this.logError("getRoute", error, { from, to, ship_size })
      this.handleError(error, "getRoute")
    }
  }

  /**
   * Get celestial object
   * 
   * Retrieves information about a specific celestial object by its identifier.
   * 
   * @summary Get celestial object information
   * @param identifier Celestial object identifier
   * @returns Object data
   */
  @Get("route/{identifier}")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getObject(@Path() identifier: string): Promise<ObjectResponse> {
    try {
      const obj = await this.fetchObject(identifier)
      return { data: obj }
    } catch (error) {
      this.logError("getObject", error, { identifier })
      this.handleError(error, "getObject")
    }
  }

  /**
   * Search starmap
   * 
   * Searches for locations in the starmap by query string.
   * 
   * @summary Search for starmap locations
   * @param query Search query string
   * @returns Search results
   */
  @Get("search/{query}")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async search(@Path() query: string): Promise<SearchResponse> {
    try {
      const results = await this.fetchSearch(query)
      return { data: results }
    } catch (error) {
      this.logError("search", error, { query })
      this.handleError(error, "search")
    }
  }

  /**
   * Fetch route from RSI API
   */
  private async fetchRoute(
    from: string,
    to: string,
    ship_size?: string
  ): Promise<any> {
    const resp = await fetch(
      "https://robertsspaceindustries.com/api/starmap/routes/find",
      {
        headers: {
          accept: "application/json, text/javascript, */*; q=0.01",
          "accept-language": "en-US,en;q=0.9,fr;q=0.8",
          "content-type": "application/json; charset=UTF-8",
          cookie: "Rsi-Token=",
        },
        body: JSON.stringify({
          departure: from,
          destination: to,
          ship_size: ship_size || "L",
        }),
        method: "POST",
      }
    )
    const js = (await resp.json()) as { data: any }
    return js.data
  }

  /**
   * Fetch object from RSI API
   */
  private async fetchObject(identifier: string): Promise<any> {
    const resp = await fetch(
      `https://robertsspaceindustries.com/api/starmap/celestial-objects/${identifier}`,
      {
        headers: {
          accept: "application/json, text/javascript, */*; q=0.01",
          "accept-language": "en-US,en;q=0.9,fr;q=0.8",
          "content-type": "application/json; charset=UTF-8",
          cookie: "Rsi-Token=",
        },
        method: "POST",
      }
    )
    const js = (await resp.json()) as any
    return js.data.resultset
  }

  /**
   * Fetch search results from RSI API
   */
  private async fetchSearch(query: string): Promise<any> {
    const resp = await fetch(
      "https://robertsspaceindustries.com/api/starmap/find",
      {
        headers: {
          accept: "application/json, text/javascript, */*; q=0.01",
          "accept-language": "en-US,en;q=0.9,fr;q=0.8",
          "content-type": "application/json; charset=UTF-8",
          cookie: "Rsi-Token=",
        },
        body: JSON.stringify({
          query: query,
        }),
        method: "POST",
      }
    )
    const js = (await resp.json()) as any
    return js.data
  }
}
