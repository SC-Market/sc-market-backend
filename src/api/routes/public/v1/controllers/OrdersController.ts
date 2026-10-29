import {
  Body,
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
import { OrdersV2Controller } from "../../../v2/orders/OrdersV2Controller.js"
import type {
  GetOrderDetailResponse,
  GetOrdersResponse,
} from "../../../v2/types/orders.types.js"
import {
  applyOrderStatusChange,
  OrderStatusChangeError,
} from "../../../v1/orders/helpers.js"
import { userRelatedToOrder } from "../../../v1/orders/middleware.js"
import { auditLogService } from "../../../../../services/audit-log/audit-log.service.js"
import {
  actingUser,
  DEFAULT_PAGE_SIZE,
  hidingForbidden,
  orderInGrant,
  reachableShop,
} from "../access.js"
import { notFound, PublicApiError, type PublicErrorBody } from "../errors.js"
import type {
  OrderStatusChangeBody,
  OrderStatusChangeResult,
  PublicData,
} from "../types.js"

@Route("orders")
@Tags("Orders")
@Response<PublicErrorBody>(401, "Missing, invalid, expired or revoked token")
@Response<PublicErrorBody>(
  403,
  "The token lacks the required scope (INSUFFICIENT_SCOPE)",
)
@Response<PublicErrorBody>(429, "Rate limit exceeded")
export class OrdersController extends Controller {
  /**
   * Orders the user is party to: placed by them (buyer), or of a shop whose
   * orders they handle in an org the token was granted (seller).
   *
   * @summary List orders
   * @param role buyer: orders the user placed; seller: orders of their shops or assigned to them. Omitted: both.
   * @param status Only orders with this status
   * @param shop Only orders of this shop (UUID or slug; must be reachable)
   * @param updated_since Only orders created or fulfilled at or after this time
   * @param page Page number, from 1
   * @param page_size Results per page, 1-100 (default 25)
   */
  @Get("")
  @Security("apiToken", ["orders:read"])
  @Response<PublicErrorBody>(
    404,
    "The shop filter names a shop the token doesn't reach",
  )
  public async listOrders(
    @Request() request: ExpressRequest,
    @Query() role?: "buyer" | "seller",
    @Query() status?: "not-started" | "in-progress" | "fulfilled" | "cancelled",
    @Query() shop?: string,
    @Query() updated_since?: Date,
    @Query() sort_by?: "created_at" | "updated_at" | "total_price",
    @Query() sort_order?: "asc" | "desc",
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<PublicData<GetOrdersResponse>> {
    const shopId = shop
      ? (await reachableShop(request, shop)).shop_id
      : undefined
    const orders = await new OrdersV2Controller(request).getOrders(
      status,
      role,
      undefined,
      undefined,
      page,
      page_size ?? DEFAULT_PAGE_SIZE,
      sort_by,
      sort_order,
      request,
      shopId,
      updated_since,
    )
    return { data: orders }
  }

  /**
   * One order the user is party to, with its items.
   *
   * @summary Get order
   * @param orderId Order UUID
   */
  @Get("{orderId}")
  @Security("apiToken", ["orders:read"])
  @Response<PublicErrorBody>(404, "Not found, or not reachable with this token")
  public async getOrder(
    @Path() orderId: string,
    @Request() request: ExpressRequest,
  ): Promise<PublicData<GetOrderDetailResponse>> {
    await orderInGrant(request, orderId)
    const order = await hidingForbidden("Order", () =>
      new OrdersV2Controller(request).getOrderDetail(orderId, request),
    )
    return { data: order }
  }

  /**
   * Move an order to in-progress, fulfilled or cancelled, with the same rules
   * and notifications as on the site: the seller side (assignee, or an org
   * member with manage_orders) moves it forward; the customer may cancel.
   * Closed (fulfilled or cancelled) orders can't change: 409.
   *
   * @summary Change order status
   * @param orderId Order UUID
   */
  @Post("{orderId}/status")
  @Security("apiToken", ["orders:write"])
  @Response<PublicErrorBody>(400, "Invalid body")
  @Response<PublicErrorBody>(403, "The user may not make this change")
  @Response<PublicErrorBody>(404, "Not found, or not reachable with this token")
  @Response<PublicErrorBody>(409, "The order is closed")
  public async changeOrderStatus(
    @Path() orderId: string,
    @Body() body: OrderStatusChangeBody,
    @Request() request: ExpressRequest,
  ): Promise<PublicData<OrderStatusChangeResult>> {
    const user = actingUser(request)
    const order = await orderInGrant(request, orderId)
    if (!(await userRelatedToOrder(order, user))) throw notFound("Order")
    try {
      await applyOrderStatusChange(order, user, body.status)
    } catch (error) {
      if (error instanceof OrderStatusChangeError) {
        if (error.reason === "forbidden")
          throw new PublicApiError(403, "FORBIDDEN", error.message)
        if (error.reason === "closed")
          throw new PublicApiError(409, "CONFLICT", error.message)
        throw new PublicApiError(400, "VALIDATION_ERROR", error.message)
      }
      throw error
    }
    await auditLogService.record({
      action: "public_api.order_status_changed",
      actorId: user.user_id,
      subjectType: "order",
      subjectId: order.order_id,
      metadata: {
        via_api_token_id: request.publicApiToken!.id,
        from: order.status,
        to: body.status,
      },
    })
    return { data: { order_id: order.order_id, status: body.status } }
  }
}
