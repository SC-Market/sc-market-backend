/**
 * Wiki Controller
 * Handles Star Citizen wiki search operations
 */

import {
  Controller,
  Get,
  Route,
  Path,
  Middlewares,
  Response,
  SuccessResponse,
} from "tsoa"
import { BaseController, ValidationErrorClass } from "./base.controller.js"
import {
  WikiImageSearchResult,
  WikiItemSearchResult,
  WikiImageSearchResponse,
  WikiItemSearchResponse,
} from "../models/wiki.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
} from "../models/common.models.js"
import { tsoaReadRateLimit } from "../middleware/tsoa-ratelimit.js"
import logger from "../../logger/logger.js"

@Route("api/v1/wiki")
export class WikiController extends BaseController {
  /**
   * Search wiki images
   * @summary Search for images in the Star Citizen wiki
   */
  @Get("imagesearch/{query}")
  @Middlewares(tsoaReadRateLimit)
  @SuccessResponse(200, "Image search results retrieved successfully")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async searchWikiImages(
    @Path() query: string,
  ): Promise<WikiImageSearchResponse> {
    try {
      if (query.length < 3) {
        throw new ValidationErrorClass("Query must be at least 3 characters long")
      }

      const { pages } = await this.wikiImageSearch(query)
      const result = await Promise.all(
        pages
          .filter((p) => p.thumbnail)
          .map(async (p) => ({
            ...p,
            images: await this.wikiImageDetails(p.thumbnail!.url),
          })),
      )

      return this.success(result)
    } catch (error) {
      // For wiki searches, return empty results on error instead of throwing
      if (error instanceof ValidationErrorClass) {
        return this.handleError(error, "searchWikiImages")
      }
      
      this.logError("searchWikiImages", error)
      return this.success([])
    }
  }

  /**
   * Search wiki items
   * @summary Search for items and pages in the Star Citizen wiki
   */
  @Get("itemsearch/{query}")
  @Middlewares(tsoaReadRateLimit)
  @SuccessResponse(200, "Item search results retrieved successfully")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async searchWikiItems(
    @Path() query: string,
  ): Promise<WikiItemSearchResponse> {
    try {
      if (query.length < 3) {
        throw new ValidationErrorClass("Query must be at least 3 characters long")
      }

      const result = await this.wikiItemSearch(query)
      return this.success(result)
    } catch (error) {
      return this.handleError(error, "searchWikiItems")
    }
  }

  /**
   * Search wiki images via external API
   */
  private async wikiImageSearch(
    query: string,
  ): Promise<{ pages: WikiImageSearchResult[] }> {
    const resp = await fetch(
      "https://scw.czen.me/rest.php/v1/search/title?" +
        new URLSearchParams({
          q: query,
          limit: "10",
        }),
    )

    return await resp.json()
  }

  /**
   * Search wiki items via external API
   */
  private async wikiItemSearch(query: string): Promise<WikiItemSearchResult> {
    const resp = await fetch(
      "https://starcitizen.tools/api.php?" +
        new URLSearchParams({
          action: "query",
          prop: "info|pageimages|categories|extracts",
          gsrsearch: query,
          gsrlimit: "50",
          generator: "search",
          format: "json",
          gexchars: "500",
          inprop: "url",
          cllimit: "max",
          explaintext: "true",
        }),
    )
    return await resp.json()
  }

  /**
   * Get wiki image details via external API
   */
  private async wikiImageDetails(url: string): Promise<any> {
    try {
      // Extract filename from URL
      // https://media.starcitizen.tools/thumb/0/02/Demeco_-_on_grey_background_-_Left.jpg/200px-Demeco_-_on_grey_background_-_Left.jpg
      const filename = url.split("/")[6]

      const resp = await fetch(
        "https://starcitizen.tools/api.php?" +
          new URLSearchParams({
            action: "query",
            prop: "imageinfo",
            titles: `File:${filename}`,
            format: "json",
            iiprop: "url",
            iiurlwidth: "200",
          }),
      )
      return await resp.json()
    } catch (e) {
      return {}
    }
  }
}
