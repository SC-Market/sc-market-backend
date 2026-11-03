/**
 * One-click relist after a game wipe (services/listing-wipe). The seller's
 * My Listings and shop Listings pages show "N listings were paused by the
 * wipe on <date>" with Relist all.
 *
 * Scope: the listings the latest such wipe paused, still paused and not
 * relisted yet, in shops the caller can manage (canManageShop: the owner, or
 * manage_market in the org). API tokens: market scope (token-scopes.ts) and
 * their org grant.
 */
import { Body, Get, Post, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  relistAll,
  relistSummary,
  type WipeRelistSummary,
} from "../../../../services/listing-wipe/listing-wipe.service.js"

export interface WipeRelistRequest {
  /** The wipe from GET /wipe-relist. */
  wipe_id: string
  /** Only this shop's listings (its Listings page); all the caller manages otherwise. */
  shop_id?: string
}

export interface WipeRelistResult {
  /** Listings put back on the market by this call (0 when run again). */
  relisted: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Route("wipe-relist")
@Tags("Listings V2")
export class WipeRelistV2Controller extends BaseController {
  /**
   * The latest wipe with listings the caller can relist, and how many; null
   * when there is nothing to relist.
   *
   * @summary Listings paused by the wipe
   * @param shop_id Only this shop (it must be one the caller manages)
   */
  @Get()
  @Security("loggedin")
  public async getWipeRelist(
    @Request() request: ExpressRequest,
    @Query() shop_id?: string,
  ): Promise<WipeRelistSummary | null> {
    this.request = request
    this.requireAuth()
    if (shop_id !== undefined && !UUID.test(shop_id)) {
      this.throwValidationError("Invalid shop_id", [
        { field: "shop_id", message: "Must be a UUID" },
      ])
    }
    return relistSummary(
      getKnex(),
      this.getUserId(),
      this.tokenOrgScope(),
      shop_id,
    )
  }

  /**
   * Relist every listing of that wipe the caller can still relist: each is
   * renewed as POST /listings/{id}/refresh does (reactivated, ranks as fresh).
   * Running it again relists nothing.
   *
   * @summary Relist all listings paused by the wipe
   */
  @Post()
  @Security("loggedin")
  public async relistWipe(
    @Request() request: ExpressRequest,
    @Body() body: WipeRelistRequest,
  ): Promise<WipeRelistResult> {
    this.request = request
    this.requireAuth()
    if (
      !UUID.test(body.wipe_id) ||
      (body.shop_id !== undefined && !UUID.test(body.shop_id))
    ) {
      this.throwValidationError("Invalid wipe_id or shop_id", [
        { field: "wipe_id", message: "Must be a UUID" },
      ])
    }
    return relistAll(
      getKnex(),
      this.getUserId(),
      this.tokenOrgScope(),
      body.wipe_id,
      body.shop_id,
    )
  }
}
