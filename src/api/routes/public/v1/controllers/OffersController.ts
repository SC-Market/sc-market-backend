import {
  Controller,
  Get,
  Path,
  Post,
  Query,
  Request,
  Response,
  Route,
  Security,
  Tags,
} from "tsoa"
import type { Request as ExpressRequest } from "express"
import type { DBOfferSession } from "../../../../../clients/database/db-models.js"
import { OffersV2Controller } from "../../../v2/offers/OffersV2Controller.js"
import type {
  GetOfferSessionV2Response,
  SearchOffersV2Response,
} from "../../../v2/types/offers.types.js"
import * as offerDb from "../../../v1/offers/database.js"
import {
  can_respond_to_offer_helper,
  userRelatedToOffer,
} from "../../../v1/offers/helpers.js"
import {
  acceptOfferSession,
  rejectOfferSession,
} from "../../../v1/offers/controller.js"
import { auditLogService } from "../../../../../services/audit-log/audit-log.service.js"
import {
  actingUser,
  DEFAULT_PAGE_SIZE,
  hidingForbidden,
  offerInGrant,
} from "../access.js"
import { notFound, PublicApiError, type PublicErrorBody } from "../errors.js"
import type {
  OfferAcceptResult,
  OfferDeclineResult,
  PublicData,
} from "../types.js"

/**
 * The offer the user may answer now: reachable, related, still open, and
 * their turn (the same rule as the site's accept/reject buttons).
 */
async function answerableOffer(request: ExpressRequest, offerId: string) {
  const user = actingUser(request)
  const session: DBOfferSession = await offerInGrant(request, offerId)
  if (!(await userRelatedToOffer(session, user))) throw notFound("Offer")
  if (session.status !== "active") {
    throw new PublicApiError(409, "CONFLICT", "This offer is closed")
  }
  const mostRecent = await offerDb.getMostRecentOrderOffer(session.id)
  if (
    !mostRecent ||
    !(await can_respond_to_offer_helper(session, mostRecent, user))
  ) {
    throw new PublicApiError(
      403,
      "FORBIDDEN",
      "It is not your turn to answer this offer",
    )
  }
  return { user, session, mostRecent }
}

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

  /**
   * Accept the most recent offer of the session; creates the order. Only
   * when it is the user's turn: the seller side answers the customer's
   * offer, the customer answers a counter-offer.
   *
   * @summary Accept offer
   * @param offerId Offer session UUID
   */
  @Post("{offerId}/accept")
  @Security("apiToken", ["offers:write"])
  @Response<PublicErrorBody>(403, "Not the user's turn, or not allowed")
  @Response<PublicErrorBody>(404, "Not found, or not reachable with this token")
  @Response<PublicErrorBody>(409, "The offer is closed")
  public async acceptOffer(
    @Path() offerId: string,
    @Request() request: ExpressRequest,
  ): Promise<PublicData<OfferAcceptResult>> {
    const { user, session, mostRecent } = await answerableOffer(
      request,
      offerId,
    )
    const order = await acceptOfferSession(session, mostRecent, user)
    await auditLogService.record({
      action: "public_api.offer_accepted",
      actorId: user.user_id,
      subjectType: "offer_session",
      subjectId: session.id,
      metadata: {
        via_api_token_id: request.publicApiToken!.id,
        order_id: order.order_id,
      },
    })
    return { data: { offer_id: session.id, order_id: order.order_id } }
  }

  /**
   * Decline the most recent offer of the session; closes it. Same turn rule
   * as accept.
   *
   * @summary Decline offer
   * @param offerId Offer session UUID
   */
  @Post("{offerId}/decline")
  @Security("apiToken", ["offers:write"])
  @Response<PublicErrorBody>(403, "Not the user's turn, or not allowed")
  @Response<PublicErrorBody>(404, "Not found, or not reachable with this token")
  @Response<PublicErrorBody>(409, "The offer is closed")
  public async declineOffer(
    @Path() offerId: string,
    @Request() request: ExpressRequest,
  ): Promise<PublicData<OfferDeclineResult>> {
    const { user, session, mostRecent } = await answerableOffer(
      request,
      offerId,
    )
    await rejectOfferSession(session, mostRecent, user, false)
    await auditLogService.record({
      action: "public_api.offer_declined",
      actorId: user.user_id,
      subjectType: "offer_session",
      subjectId: session.id,
      metadata: { via_api_token_id: request.publicApiToken!.id },
    })
    return { data: { offer_id: session.id, status: "rejected" } }
  }
}
