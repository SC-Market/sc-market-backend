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
import { OrdersV2Controller } from "../../../v2/orders/OrdersV2Controller.js"
import type {
  GetOrderDetailResponse,
  GetOrdersResponse,
} from "../../../v2/types/orders.types.js"
import {
  DEFAULT_PAGE_SIZE,
  hidingForbidden,
  orderInGrant,
  reachableShop,
} from "../access.js"
import type { PublicErrorBody } from "../errors.js"
import type { PublicData } from "../types.js"

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
}
