import {
  Controller,
  Get,
  Path,
  Query,
  Request,
  Response,
  Route,
  Security,
  Tags,
} from "tsoa"
import type { Request as ExpressRequest } from "express"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import { ListingsV2Controller } from "../../../v2/listings/ListingsV2Controller.js"
import { StockLotsV2Controller } from "../../../v2/stock-lots/StockLotsV2Controller.js"
import type { GetListingDetailResponse } from "../../../v2/types/listings.types.js"
import type { GetStockLotsResponse } from "../../../v2/types/stock-lots.types.js"
import {
  DEFAULT_PAGE_SIZE,
  hidingForbidden,
  reachableListingShop,
} from "../access.js"
import type { PublicErrorBody } from "../errors.js"
import type { PublicData } from "../types.js"

@Route("listings")
@Tags("Listings")
@Response<PublicErrorBody>(401, "Missing, invalid, expired or revoked token")
@Response<PublicErrorBody>(
  403,
  "The token lacks the required scope (INSUFFICIENT_SCOPE)",
)
@Response<PublicErrorBody>(404, "Not found, or not reachable with this token")
@Response<PublicErrorBody>(429, "Rate limit exceeded")
export class ListingsController extends Controller {
  /**
   * One listing of a shop the token reaches, with its variants and stock
   * summary, as the seller sees it.
   *
   * @summary Get listing
   * @param listingId Listing UUID
   */
  @Get("{listingId}")
  @Security("apiToken", ["listings:read"])
  public async getListing(
    @Path() listingId: string,
    @Request() request: ExpressRequest,
  ): Promise<PublicData<GetListingDetailResponse>> {
    await reachableListingShop(request, listingId)
    const detail = await hidingForbidden("Listing", () =>
      new ListingsV2Controller(request).getListingDetail(listingId, request),
    )
    return { data: detail }
  }

  /**
   * The listing's stock lots: quantity per variant and location.
   *
   * @summary Get listing stock
   * @param listingId Listing UUID
   * @param page Page number, from 1
   * @param page_size Results per page, 1-100 (default 25)
   */
  @Get("{listingId}/stock")
  @Security("apiToken", ["stock:read"])
  public async getListingStock(
    @Path() listingId: string,
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<PublicData<GetStockLotsResponse>> {
    const shop = await reachableListingShop(request, listingId)
    // The stock-lot list covers the user's own shops, or an org's shops by
    // spectrum id (members only).
    const org = shop.owner_contractor_id
      ? await getKnex()("contractors")
          .where("contractor_id", shop.owner_contractor_id)
          .first("spectrum_id")
      : undefined
    const lots = await hidingForbidden("Listing", () =>
      new StockLotsV2Controller(request).getStockLots(
        listingId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        org?.spectrum_id,
        page,
        page_size ?? DEFAULT_PAGE_SIZE,
        request,
      ),
    )
    return { data: lots }
  }
}
