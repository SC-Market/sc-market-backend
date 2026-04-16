/**
 * Orders V2 Controller
 *
 * Handles V2 order display with variant information.
 * Reads from V1 orders table and enriches with V2 variant data.
 */

import {
  Controller,
  Get,
  Route,
  Tags,
  Security,
  Path,
  Query,
  Request,
} from "tsoa";
import { OrdersService } from "../../../services/market-v2/orders.service.js";
import { OrderDetailV2, GetOrdersRequest } from "../types/market-v2-types.js";

interface AuthenticatedRequest extends Express.Request {
  user: {
    userId: string;
    username: string;
    role: string;
  };
}

@Route("api/v2/orders")
@Tags("Orders V2")
export class OrdersV2Controller extends Controller {
  private ordersService: OrdersService;

  constructor() {
    super();
    this.ordersService = new OrdersService();
  }

  /**
   * Get order detail with V2 variant information
   * @summary Get order detail
   * @param orderId Order ID
   */
  @Get("{orderId}")
  @Security("jwt")
  public async getOrderDetail(
    @Path() orderId: string,
    @Request() req: AuthenticatedRequest
  ): Promise<OrderDetailV2> {
    return await this.ordersService.getOrderDetail(orderId, req.user.userId);
  }

  /**
   * Get list of orders with V2 variant information
   * @summary Get orders list
   * @param role Filter by role (buyer/seller)
   * @param status Filter by status
   * @param quality_tier Filter by quality tier
   * @param date_from Filter by date from
   * @param date_to Filter by date to
   * @param page Page number (default: 1)
   * @param page_size Page size (default: 20)
   * @param sort_by Sort by field (default: created_at)
   * @param sort_order Sort order (default: desc)
   */
  @Get()
  @Security("jwt")
  public async getOrders(
    @Request() req: AuthenticatedRequest,
    @Query() role?: 'buyer' | 'seller',
    @Query() status?: string,
    @Query() quality_tier?: number,
    @Query() date_from?: string,
    @Query() date_to?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
    @Query() sort_by?: 'created_at' | 'total_price' | 'quality_tier',
    @Query() sort_order?: 'asc' | 'desc'
  ): Promise<{
    orders: Array<{
      order_id: string;
      buyer_id: string;
      seller_id: string;
      status: string;
      total_price: string;
      created_at: Date;
      item_count: number;
      quality_tier_range: {
        min: number;
        max: number;
      };
    }>;
    total: number;
    page: number;
    page_size: number;
  }> {
    const filters: GetOrdersRequest = {
      role,
      status,
      quality_tier,
      date_from: date_from ? new Date(date_from) : undefined,
      date_to: date_to ? new Date(date_to) : undefined,
      page,
      page_size,
      sort_by,
      sort_order,
    };

    return await this.ordersService.getOrders(req.user.userId, filters);
  }
}
