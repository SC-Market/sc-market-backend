/**
 * Admin › Orders: every order on the site, and the order stats
 * (services/admin-orders). Orders involving a test buyer, seller, org or shop
 * are left out unless include_test=true. Site admins only (tsoa-auth admin
 * gate + requireAdmin).
 */
import { Get, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { clampPagination } from "../util/pagination.js"
import { adminOrderAnalytics, listAdminOrders } from "../../../../services/admin-orders/admin-orders.service.js"
import type {
  AdminOrderAnalytics,
  AdminOrderSearchStatus,
  AdminOrderSortMethod,
  AdminOrdersPage,
} from "../types/admin-orders.types.js"

@Route("admin/orders")
@Tags("Admin")
export class AdminOrdersV2Controller extends BaseController {
  /**
   * Every order on the site, newest first by default, with per-status counts
   * for the same filters. Orders involving a test buyer, seller, org or shop
   * are left out, counts included, unless include_test is true; each order
   * says whether it is a test order.
   *
   * @summary List all orders
   * @param status active: not started or in progress; past: fulfilled or cancelled
   * @param unassigned Only active orders with no assigned seller
   * @param page 1-based
   * @param buyer_username Partial match on the buyer's username
   * @param seller_username Partial match on the assigned seller's username or the org's Spectrum ID
   * @param include_test Also orders involving test accounts, orgs or shops
   */
  @Get("")
  @Security("loggedin")
  public async listAdminOrders(
    @Request() request: ExpressRequest,
    @Query() status?: AdminOrderSearchStatus,
    @Query() unassigned?: boolean,
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() sort_method?: AdminOrderSortMethod,
    @Query() reverse_sort?: boolean,
    @Query() buyer_username?: string,
    @Query() seller_username?: string,
    @Query() has_market_listings?: boolean,
    @Query() has_service?: boolean,
    @Query() include_test?: boolean,
  ): Promise<AdminOrdersPage> {
    this.request = request
    this.requireAdmin()
    const { page: p, page_size: size } = clampPagination(page, page_size, { defaultPageSize: 10 })
    this.setHeader("Cache-Control", "private, no-store")
    return listAdminOrders({
      status,
      unassigned: unassigned === true ? true : undefined,
      index: p - 1,
      page_size: size,
      sort_method: sort_method ?? "timestamp",
      reverse_sort: reverse_sort ?? true,
      buyer_username: buyer_username?.trim() || undefined,
      seller_username: seller_username?.trim() || undefined,
      has_market_listings,
      has_service,
      includeTest: include_test === true,
    })
  }

  /**
   * Daily (30 days), weekly (12 weeks) and monthly (12 months) order counts,
   * the top shops and buyers by fulfilled orders, and totals. Orders
   * involving a test buyer, seller, org or shop are left out unless
   * include_test is true.
   *
   * @summary Order stats
   * @param include_test Also count orders involving test accounts, orgs or shops
   */
  @Get("analytics")
  @Security("loggedin")
  public async getAdminOrderAnalytics(
    @Request() request: ExpressRequest,
    @Query() include_test?: boolean,
  ): Promise<AdminOrderAnalytics> {
    this.request = request
    this.requireAdmin()
    this.setHeader("Cache-Control", "private, no-store")
    return adminOrderAnalytics(include_test === true)
  }
}
