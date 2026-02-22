/**
 * Offers Controller
 * Handles offer session management and negotiation
 */

import {
  Controller,
  Get,
  Put,
  Post,
  Route,
  Path,
  Body,
  Query,
  Security,
  Middlewares,
  Request,
  Response,
  SuccessResponse,
} from "tsoa"
import { BaseController, NotFoundError, ValidationErrorClass, ForbiddenError, ConflictError, UnauthorizedError } from "./base.controller.js"
import {
  OfferSessionResponse,
  UpdateOfferSessionRequest,
  CreateThreadRequest,
  CreateThreadResponse,
  OfferSearchQuery,
  OfferSearchResponse,
  MergeOffersRequest,
  MergeOffersResponse,
  AcceptOfferResponse,
  OfferSuccessResponse,
} from "../models/offers.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../models/common.models.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as offerDb from "../routes/v1/offers/database.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import * as marketDb from "../routes/v1/market/database.js"
import * as serviceDb from "../routes/v1/services/database.js"
import * as chatDb from "../routes/v1/chats/database.js"
import {
  serializeOfferSession,
  serializeOfferSessionStubOptimized,
} from "../routes/v1/offers/serializers.js"
import { initiateOrder } from "../routes/v1/orders/helpers.js"
import { verify_listings } from "../routes/v1/market/helpers.js"
import {
  convert_offer_search_query,
  search_offer_sessions_optimized,
  mergeOfferSessions,
} from "../routes/v1/offers/helpers.js"
import { is_member, has_permission } from "../routes/v1/util/permissions.js"
import { notificationService } from "../../services/notifications/notification.service.js"
import { discordService } from "../../services/discord/discord.service.js"
import { sendSystemMessage } from "../routes/v1/chats/helpers.js"
import { auditLogService } from "../../services/audit-log/audit-log.service.js"
import { OfferMergeError } from "../routes/v1/offers/errors.js"
import { DBOfferSession } from "../../clients/database/db-models.js"
import type { Request as ExpressRequest } from "express"

interface AuthenticatedRequest extends ExpressRequest {
  user?: any
  offer_session?: DBOfferSession
  most_recent_offer?: any
  offer_sessions?: DBOfferSession[]
}

/**
 * Controller for offer session management
 */
@Route("api/v1")
export class OffersController extends BaseController {
  /**
   * Get offer session details
   * @summary Get offer session by ID
   */
  @Get("offer/{session_id}")
  @Security("sessionAuth")
  @Security("bearerAuth", ["offers:read"])
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden - Not related to offer")
  @Response<NotFound>(404, "Offer session not found")
  public async getOfferSessions(
    @Path() session_id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<OfferSessionResponse> {
    const user = this.getUser(request)

    // Get offer session
    const sessions = await offerDb.getOfferSessions({ id: session_id })
    if (!sessions || sessions.length === 0) {
      throw new NotFoundError("Offer session not found")
    }
    const session = sessions[0]

    // Check if user is related to offer
    const isRelated =
      session.customer_id === user.user_id ||
      session.assigned_id === user.user_id ||
      (session.contractor_id &&
        (await is_member(session.contractor_id, user.user_id)))

    if (!isRelated && user.role !== "admin") {
      throw new ForbiddenError("Not related to this offer")
    }

    return await serializeOfferSession(session) as any
  }

  /**
   * Update offer session status
   * @summary Accept, reject, or counter an offer
   */
  @Put("offer/{session_id}")
  @Security("sessionAuth")
  @Security("bearerAuth", ["offers:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden - Cannot respond to offer")
  @Response<NotFound>(404, "Offer session not found")
  @Response<ValidationErrorResponse>(400, "Validation error")
  @SuccessResponse(200, "Offer updated successfully")
  public async updateOfferSession(
    @Path() session_id: string,
    @Body() body: UpdateOfferSessionRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<AcceptOfferResponse | OfferSuccessResponse> {
    const user = this.getUser(request)

    // Get offer session
    const sessions = await offerDb.getOfferSessions({ id: session_id })
    if (!sessions || sessions.length === 0) {
      throw new NotFoundError("Offer session not found")
    }
    const session = sessions[0]

    // Check if user is related to offer
    const isRelated =
      session.customer_id === user.user_id ||
      session.assigned_id === user.user_id ||
      (session.contractor_id &&
        (await is_member(session.contractor_id, user.user_id)))

    if (!isRelated && user.role !== "admin") {
      throw new ForbiddenError("Not related to this offer")
    }

    // Get most recent offer
    const offers = await offerDb.getOrderOffers({ session_id: session.id })
    const mostRecentOffer = offers.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )[0]

    if (!mostRecentOffer) {
      throw new NotFoundError("No offers found in session")
    }

    // Check if user can respond to this offer
    const canRespond =
      mostRecentOffer.actor_id !== user.user_id &&
      session.status === "active"

    if (!canRespond) {
      throw new ForbiddenError("Cannot respond to this offer")
    }

    let status = body.status
    if (status === "cancelled") {
      status = "rejected"
    }

    const nameMap = new Map([
      ["accepted" as const, "Accepted" as const],
      ["rejected" as const, "Rejected" as const],
      ["cancelled" as const, "Rejected" as const],
      ["counteroffered" as const, "Counter-Offered" as const],
    ])

    if (["accepted", "rejected"].includes(status)) {
      await offerDb.updateOfferSession(session.id, { status: "closed" })
      await offerDb.updateOrderOffer(mostRecentOffer.id, { status })

      // Send Discord embed
      await discordService.sendOfferStatusUpdate(
        session,
        nameMap.get(status)!,
        user,
      )

      // Send chat message
      try {
        const chat = await chatDb.getChat({ session_id: session.id })
        const actionBy = user ? ` by ${user.username}` : ""
        const content = `Offer status updated to **${nameMap.get(status)!}**${actionBy}`
        await sendSystemMessage(chat.chat_id, content, false)
      } catch (error) {
        this.logWarning(
          "updateOfferStatus",
          `Failed to send offer status update chat message for session ${session.id}: ${error}`,
        )
      }

      if (status === "accepted") {
        const order = await initiateOrder(session)
        return { order_id: order.order_id }
      } else {
        return { result: "Success" }
      }
    } else if (status === "counteroffered") {
      if (!body.counter_offer) {
        throw new ValidationErrorClass("Counter offer details required")
      }

      const customer = await profileDb.getUser({ user_id: session.customer_id })
      const counterOffer = body.counter_offer

      const listings = await verify_listings(
        null as any,
        counterOffer.market_listings,
        customer,
      )
      if (!listings) {
        throw new ValidationErrorClass("Invalid market listings")
      }

      if (counterOffer.service_id) {
        const service = await serviceDb.getService({
          service_id: counterOffer.service_id,
        })

        if (!service) {
          throw new ValidationErrorClass("Invalid service")
        }

        if (service.user_id && service.user_id !== session.assigned_id) {
          throw new ValidationErrorClass("Invalid service")
        }

        if (
          service.contractor_id &&
          service.contractor_id !== session.contractor_id
        ) {
          throw new ValidationErrorClass("Invalid service")
        }
      }

      // Determine if this is a seller counter offer
      const isSellerCounterOffer =
        (session.contractor_id &&
          (await has_permission(
            session.contractor_id,
            user.user_id,
            "manage_orders",
          ))) ||
        (session.assigned_id && session.assigned_id === user.user_id)

      // Validate order limits for buyer counter offers
      if (!isSellerCounterOffer) {
        const offerSize =
          listings?.reduce((sum, item) => sum + item.quantity, 0) || 0
        try {
          const { validateOrderLimits } = await import(
            "../routes/v1/orders/helpers.js"
          )
          await validateOrderLimits(
            session.contractor_id,
            session.assigned_id,
            offerSize,
            counterOffer.cost,
          )
        } catch (error) {
          throw new ValidationErrorClass(
            error instanceof Error
              ? error.message
              : "Order does not meet size or value requirements",
          )
        }
      }

      const [offer] = await offerDb.createOrderOffer({
        session_id: session.id,
        actor_id: user.user_id,
        kind: counterOffer.kind,
        cost: counterOffer.cost,
        title: counterOffer.title,
        description: counterOffer.description,
        service_id: counterOffer.service_id || undefined,
        payment_type: counterOffer.payment_type,
      })

      if (listings.length) {
        await marketDb.insertOfferMarketListing(
          listings.map((l) => ({
            listing_id: l.listing.listing.listing_id,
            quantity: l.quantity,
            offer_id: offer.id,
          })),
        )
      }

      await offerDb.updateOrderOffer(mostRecentOffer.id, {
        status: "counteroffered",
      })

      try {
        await notificationService.createOfferNotification(
          session,
          "counteroffer",
        )
        await discordService.sendOfferStatusUpdate(
          session,
          "Counter-Offered",
          user,
        )
        try {
          const chat = await chatDb.getChat({ session_id: session.id })
          const content = `Offer status updated to **Counter-Offered** by ${user.username}`
          await sendSystemMessage(chat.chat_id, content, false)
        } catch (error) {
          this.logWarning(
            "counterOffer",
            `Failed to send offer status update chat message for session ${session.id}: ${error}`,
          )
        }
      } catch (e) {
        this.logError("counterOffer", "Error in offers operation", e)
      }

      return { result: "Success" }
    }

    throw new ValidationErrorClass("Invalid status")
  }

  /**
   * Create Discord thread for offer
   * @summary Queue thread creation for offer session
   */
  @Post("offers/{session_id}/thread")
  @Security("sessionAuth")
  @Security("bearerAuth", ["offers:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden - Not related to offer")
  @Response<NotFound>(404, "Offer session not found")
  @Response<Conflict>(409, "Offer already has a thread")
  @SuccessResponse(201, "Thread creation queued")
  public async createOfferThread(
    @Path() session_id: string,
    @Body() _body: CreateThreadRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<CreateThreadResponse> {
    const user = this.getUser(request)

    // Get offer session
    const sessions = await offerDb.getOfferSessions({ id: session_id })
    if (!sessions || sessions.length === 0) {
      throw new NotFoundError("Offer session not found")
    }
    const session = sessions[0]

    // Check if user is related to offer
    const isRelated =
      session.customer_id === user.user_id ||
      session.assigned_id === user.user_id ||
      (session.contractor_id &&
        (await is_member(session.contractor_id, user.user_id)))

    if (!isRelated && user.role !== "admin") {
      throw new ForbiddenError("Not related to this offer")
    }

    if (session.thread_id) {
      throw new ConflictError("Offer already has a thread!")
    }

    const result = await discordService.queueThreadCreation(session)
    if (result.status === "failed") {
      throw new Error(result.message)
    }

    this.logInfo(
      "createThread",
      `Thread creation queued successfully for offer session ${session.id}`,
    )

    // Status set by TSOA
    return { result: "Success" }
  }

  /**
   * Search offer sessions
   * @summary Search and filter offer sessions
   */
  @Get("offers/search")
  @Security("sessionAuth")
  @Security("bearerAuth", ["offers:read"])
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden - Missing permissions")
  @Response<ValidationErrorResponse>(400, "Validation error")
  public async searchOffers(
    @Query() sort_method?: "title" | "customer_name" | "status" | "timestamp" | "contractor_name",
    @Query() status?: "to-seller" | "to-customer" | "accepted" | "rejected",
    @Query() assigned?: string,
    @Query() contractor?: string,
    @Query() customer?: string,
    @Query() index?: number,
    @Query() page_size?: number,
    @Query() reverse_sort?: boolean,
    @Query() buyer_username?: string,
    @Query() seller_username?: string,
    @Query() has_market_listings?: boolean,
    @Query() has_service?: boolean,
    @Query() cost_min?: number,
    @Query() cost_max?: number,
    @Query() date_from?: string,
    @Query() date_to?: string,
    @Request() request?: AuthenticatedRequest,
  ): Promise<OfferSearchResponse> {
    const user = this.getUser(request!)

    // Build query arguments
    const mockReq = {
      query: {
        sort_method,
        status,
        assigned,
        contractor,
        customer,
        index: index?.toString(),
        page_size: page_size?.toString(),
        reverse_sort: reverse_sort?.toString(),
        buyer_username,
        seller_username,
        has_market_listings: has_market_listings?.toString(),
        has_service: has_service?.toString(),
        cost_min: cost_min?.toString(),
        cost_max: cost_max?.toString(),
        date_from,
        date_to,
      },
    } as any

    const args = await convert_offer_search_query(mockReq)

    // Validate permissions
    if (!(args.contractor_id || args.assigned_id || args.customer_id)) {
      if (user.role !== "admin") {
        throw new ForbiddenError("Missing permissions.")
      }
    }

    if (args.contractor_id) {
      if (!(await is_member(args.contractor_id, user.user_id))) {
        throw new ForbiddenError("Missing permissions.")
      }
    }

    if (
      args.assigned_id &&
      args.assigned_id !== user.user_id &&
      !args.contractor_id
    ) {
      throw new ForbiddenError("Missing permissions.")
    }

    const result = await search_offer_sessions_optimized(args)

    const total = Object.values(result.item_counts).reduce((a, b) => a + b, 0)
    
    return {
      item_counts: {
        total,
        filtered: result.items.length,
      },
      items: await Promise.all(
        result.items.map(serializeOfferSessionStubOptimized),
      ) as any,
    }
  }

  /**
   * Merge multiple offer sessions
   * @summary Merge multiple offer sessions into one
   */
  @Post("offers/merge")
  @Security("sessionAuth")
  @Security("bearerAuth", ["offers:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden - Cannot merge offers")
  @Response<ValidationErrorResponse>(400, "Validation error")
  @Response<NotFound>(404, "Offer sessions not found")
  @SuccessResponse(200, "Offers merged successfully")
  public async mergeOffers(
    @Body() body: MergeOffersRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<MergeOffersResponse> {
    const user = this.getUser(request)
    const { offer_session_ids } = body

    if (!offer_session_ids || !Array.isArray(offer_session_ids)) {
      throw new ValidationErrorClass("offer_session_ids array is required")
    }

    if (offer_session_ids.length < 2) {
      throw new ValidationErrorClass(
        "At least 2 offer sessions are required to merge",
      )
    }

    // Get all sessions and validate
    const sessionArrays = await Promise.all(
      offer_session_ids.map((id) => offerDb.getOfferSessions({ id })),
    )
    const sessions = sessionArrays.map(arr => arr[0]).filter(Boolean)

    if (sessions.length !== offer_session_ids.length) {
      throw new NotFoundError("One or more offer sessions not found")
    }

    // Validate user can merge (must be related to all sessions)
    for (const session of sessions) {
      if (!session) continue

      const isRelated =
        session.assigned_id === user.user_id ||
        (session.contractor_id &&
          (await is_member(session.contractor_id, user.user_id)))

      if (!isRelated && user.role !== "admin") {
        throw new ForbiddenError("Cannot merge offers - not related to all offers")
      }
    }

    try {
      const customer_id = sessions[0]!.customer_id
      const customer = await profileDb.getUser({ user_id: customer_id })

      const result = await mergeOfferSessions(
        offer_session_ids,
        customer_id,
        customer.username,
      )

      // Log the merge
      await auditLogService.record({
        action: "offers.merged",
        actorId: user.user_id,
        subjectType: "offer_session",
        subjectId: result.merged_session.id,
        metadata: {
          source_offer_session_ids: offer_session_ids,
          merged_offer_session_id: result.merged_session.id,
          merged_offer_id: result.merged_offer.id,
          customer_id: customer_id,
          customer_username: customer.username,
          merged_by_contractor: true,
          combined_cost: Number(result.merged_offer.cost),
          session_count: offer_session_ids.length,
        },
      })

      return {
        result: "Success",
        merged_offer_session: await serializeOfferSession(result.merged_session) as any,
        source_offer_session_ids: result.source_session_ids,
        message: `Successfully merged ${offer_session_ids.length} offer sessions into new merged offer`,
      }
    } catch (error) {
      this.logError("Error merging offer sessions", {
        error: error instanceof Error ? error.message : String(error),
        offer_session_ids,
        customer_id: user.user_id,
      })

      if (error instanceof OfferMergeError) {
        throw new ValidationErrorClass(error.message)
      }

      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to merge offer sessions",
      )
    }
  }
}
