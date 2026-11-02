/**
 * A shop's place in the public storefront directory
 * (services/storefront/directory.ts): "Show in the public storefront
 * directory" in the shop's settings. The directory lists orgs; an org shop's
 * setting decides whether it counts towards its org's entry.
 */
import { Body, Get, Path, Put, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { canManageShop, getShopById } from "../../../../services/shops/shop-permissions.service.js"
import {
  getShopDirectoryStatus,
  setDirectoryShown,
  type StorefrontDirectoryStatus,
} from "../../../../services/storefront/directory.js"
import type { StorefrontDirectoryRequest } from "../contractors/OrgStorefrontV2Controller.js"
import { isUuid } from "../util/short-slug.js"

@Route("shops")
@Tags("Shops")
export class ShopStorefrontV2Controller extends BaseController {
  private async managedShop(shopId: string) {
    if (!isUuid(shopId)) this.throwNotFound("Shop", shopId)
    const shop = await getShopById(shopId)
    if (!shop || shop.status === "archived") this.throwNotFound("Shop", shopId)
    await this.requireTokenOrgAccess(shop.owner_contractor_id)
    if (!(await canManageShop(shop, this.getUserId()))) {
      this.throwForbidden("Only the shop's managers can change its storefront settings")
    }
    return shop
  }

  /**
   * Whether the shop is in the public storefront directory, and why. For the
   * shop's managers (owner, or Manage Market in its org).
   *
   * @summary Get a shop's storefront directory status
   */
  @Get("{shopId}/storefront/directory")
  @Security("loggedin")
  public async getShopStorefrontDirectory(
    @Path() shopId: string,
    @Request() request?: ExpressRequest,
  ): Promise<StorefrontDirectoryStatus> {
    if (request) this.request = request
    const shop = await this.managedShop(shopId)
    this.setHeader("Cache-Control", "private, no-store")
    return getShopDirectoryStatus(shop)
  }

  /**
   * Turn "Show in the public storefront directory" on or off for the shop.
   * A shop of a members-only org can't be turned on (400). Personal shops
   * have no such setting (the directory lists orgs): 400.
   *
   * @summary Set whether a shop is in the storefront directory
   */
  @Put("{shopId}/storefront/directory")
  @Security("loggedin")
  public async setShopStorefrontDirectory(
    @Path() shopId: string,
    @Body() body: StorefrontDirectoryRequest,
    @Request() request?: ExpressRequest,
  ): Promise<StorefrontDirectoryStatus> {
    if (request) this.request = request
    const shop = await this.managedShop(shopId)
    if (!shop.owner_contractor_id) {
      this.throwValidationError("Personal shops aren't listed in the storefront directory", [
        { field: "show_in_directory", message: "Personal shops have no directory setting" },
      ])
    }
    if (typeof body?.show_in_directory !== "boolean") {
      this.throwValidationError("show_in_directory must be true or false", [
        { field: "show_in_directory", message: "Must be true or false" },
      ])
    }
    const current = await getShopDirectoryStatus(shop)
    if (body.show_in_directory && !current.can_change) {
      this.throwValidationError("Members-only storefronts aren't listed in the public directory", [
        { field: "show_in_directory", message: "Members-only storefronts aren't listed" },
      ])
    }
    await setDirectoryShown({ shop_id: shop.shop_id }, body.show_in_directory, this.getUserId())
    this.setHeader("Cache-Control", "private, no-store")
    return getShopDirectoryStatus(shop)
  }
}
