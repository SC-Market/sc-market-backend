/**
 * Admin › Market › Seller reachability: how many sellers with listings up can
 * be reached, per last-seen bucket and channel (services/seller-reachability).
 * Counts only, no user or org is named. Site admins only (tsoa-auth admin
 * gate + requireAdmin).
 */
import { Get, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getSellerReachability } from "../../../../services/seller-reachability/seller-reachability.service.js"
import type { SellerReachabilityReport } from "../types/seller-reachability.types.js"

@Route("admin/seller-reachability")
@Tags("Admin")
export class AdminSellerReachabilityController extends BaseController {
  /**
   * Sellers with publicly listed listings, bucketed by when they were last
   * seen, and how many of them (and their listings) Discord DM, email and
   * push can reach. Counts only.
   *
   * @summary Seller reachability report
   */
  @Get("")
  @Security("loggedin")
  public async getSellerReachability(
    @Request() request: ExpressRequest,
  ): Promise<SellerReachabilityReport> {
    this.request = request
    this.requireAdmin()
    this.setHeader("Cache-Control", "private, no-store")
    return getSellerReachability()
  }
}
