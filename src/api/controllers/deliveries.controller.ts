/**
 * Deliveries Controller
 * Handles delivery management
 */

import {
  Controller,
  Get,
  Post,
  Route,
  Body,
  Security,
  Middlewares,
  Request,
  Response,
  SuccessResponse,
} from "tsoa"
import { BaseController, NotFoundError, ValidationErrorClass, ForbiddenError, ConflictError, UnauthorizedError } from "./base.controller.js"
import {
  CreateDeliveryRequest,
  DeliveryResponse,
  CreateDeliveryResponse,
} from "../models/deliveries.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
} from "../models/common.models.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as deliveryDb from "../routes/v1/deliveries/database.js"
import * as shipDb from "../routes/v1/ships/database.js"
import * as orderDb from "../routes/v1/orders/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import { has_permission } from "../routes/v1/util/permissions.js"
import type { Request as ExpressRequest } from "express"

interface AuthenticatedRequest extends ExpressRequest {
  user?: any
}

/**
 * Controller for delivery management
 */
@Route("api/v1")
export class DeliveriesController extends BaseController {
  /**
   * Create a new delivery
   * @summary Create delivery for an order
   */
  @Post("delivery/create")
  @Security("sessionAuth")
  @Security("bearerAuth", ["orders:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden - Not allowed to create delivery")
  @Response<ValidationErrorResponse>(400, "Validation error")
  @SuccessResponse(200, "Delivery created successfully")
  public async createDelivery(
    @Body() body: CreateDeliveryRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<CreateDeliveryResponse> {
    const user = this.getUser(request)

    const { start, end, order_id, ship_id } = body

    if (!start || !end || !order_id || !ship_id) {
      throw new ValidationErrorClass("Missing required fields")
    }

    const contractors = await contractorDb.getUserContractors({
      user_id: user.user_id,
    })
    const order = await orderDb.getOrder({ order_id })

    let contractor
    let manageOrders = false
    if (order.contractor_id) {
      contractor = contractors.find(
        (c) => c.contractor_id === order.contractor_id,
      )
      if (contractor) {
        manageOrders = await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_market",
        )
      }
    }

    const unrelated = !(order.assigned_id === user.user_id || manageOrders)

    if (unrelated) {
      throw new ForbiddenError(
        "You are not allowed to create a delivery for this order",
      )
    }

    const ship = await shipDb.getShip({ ship_id })

    if (!ship || ship.owner !== user.user_id) {
      throw new ForbiddenError(
        "You are not allowed to create a delivery for this ship",
      )
    }

    await deliveryDb.createDelivery({
      departure: start,
      destination: end,
      order_id: order_id,
      ship_id: ship_id,
      progress: 0,
      status: "pending",
    })

    return { result: "Success" }
  }

  /**
   * Get user's deliveries
   * @summary Get deliveries for current user
   */
  @Get("deliveries/mine")
  @Security("sessionAuth")
  @Security("bearerAuth", ["orders:read"])
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  public async getMyDeliveries(
    @Request() request: AuthenticatedRequest,
  ): Promise<DeliveryResponse[]> {
    const user = this.getUser(request)
    const deliveries = await deliveryDb.getDeliveries({
      customer_id: user.user_id,
    })

    return await Promise.all(
      deliveries.map(async (delivery: any) => ({
        ...delivery,
        order: await orderDb.getOrder({ order_id: delivery.order_id }),
        ship: await shipDb.getShip({ ship_id: delivery.ship_id }),
      })),
    )
  }
}
