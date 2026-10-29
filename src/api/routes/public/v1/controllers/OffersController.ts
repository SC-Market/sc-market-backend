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
import { OffersV2Controller } from "../../../v2/offers/OffersV2Controller.js"
import type {
  GetOfferSessionV2Response,
  SearchOffersV2Response,
} from "../../../v2/types/offers.types.js"
import { DEFAULT_PAGE_SIZE, hidingForbidden, offerInGrant } from "../access.js"
import type { PublicErrorBody } from "../errors.js"
import type { PublicData } from "../types.js"

@Route("offers")
@Tags("Offers")
@Response<PublicErrorBody>(401, "Missing, invalid, expired or revoked token")
@Response<PublicErrorBody>(
  403,
  "The token lacks the required scope (INSUFFICIENT_SCOPE)",
)
@Response<PublicErrorBody>(429, "Rate limit exceeded")
export class OffersController extends Controller {
  /**
   * Offer sessions the user is party to: made by them (customer), or made to
   * them or to an org the token was granted (seller).
   *
   * @summary List offers
   * @param role customer: offers the user made; seller: offers made to them or their orgs. Omitted: both.
   * @param status active (open) or closed
   * @param page Page number, from 1
   * @param page_size Results per page, 1-100 (default 25)
   */
  @Get("")
  @Security("apiToken", ["offers:read"])
  public async listOffers(
    @Request() request: ExpressRequest,
    @Query() role?: "customer" | "seller",
    @Query() status?: "active" | "closed",
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<PublicData<SearchOffersV2Response>> {
    const offers = await new OffersV2Controller(request).searchOffers(
      request,
      role,
      status,
      page,
      page_size ?? DEFAULT_PAGE_SIZE,
    )
    return { data: offers }
  }

  /**
   * One offer session with its offers, newest first.
   *
   * @summary Get offer
   * @param offerId Offer session UUID
   */
  @Get("{offerId}")
  @Security("apiToken", ["offers:read"])
  @Response<PublicErrorBody>(404, "Not found, or not reachable with this token")
  public async getOffer(
    @Path() offerId: string,
    @Request() request: ExpressRequest,
  ): Promise<PublicData<GetOfferSessionV2Response>> {
    await offerInGrant(request, offerId)
    const offer = await hidingForbidden("Offer", () =>
      new OffersV2Controller(request).getOfferSession(offerId, request),
    )
    return { data: offer }
  }
}
