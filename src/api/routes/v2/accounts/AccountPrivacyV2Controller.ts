import { Get, Put, Route, Tags, Request, Body, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import * as profileDb from "../../v1/profiles/database.js"
import logger from "../../../../logger/logger.js"
import {
  refreshShopActivityStats,
  shopsFedByUser,
} from "../../../../services/seller-activity/seller-activity.service.js"

export interface AccountPrivacySettings {
  /**
   * Hide my online status: buyers never see when you were last active (on
   * your shops' listings, cards and shop page, or on an org's shop you help
   * run).
   */
  hide_online_status: boolean
}

export interface UpdateAccountPrivacyRequest {
  hide_online_status: boolean
}

@Route("accounts/privacy")
@Tags("Account Privacy V2")
export class AccountPrivacyV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /** @summary Get my privacy settings */
  @Security("loggedin")
  @Get()
  public async getAccountPrivacy(
    @Request() request: ExpressRequest,
  ): Promise<AccountPrivacySettings> {
    this.request = request
    const settings = await profileDb.getUserSettings(this.getUserId())
    return { hide_online_status: !!settings.hide_online_status }
  }

  /** @summary Update my privacy settings */
  @Security("loggedin")
  @Put()
  public async updateAccountPrivacy(
    @Body() body: UpdateAccountPrivacyRequest,
    @Request() request: ExpressRequest,
  ): Promise<AccountPrivacySettings> {
    this.request = request
    const userId = this.getUserId()
    if (typeof body.hide_online_status !== "boolean") {
      this.throwValidationError("hide_online_status must be a boolean", [
        { field: "hide_online_status", message: "Must be true or false" },
      ])
    }
    await profileDb.getUserSettings(userId) // creates the row if missing
    await profileDb.updateUserSettings(userId, { hide_online_status: body.hide_online_status })

    // Apply it to the shops this user's activity feeds now, not at the next
    // scheduled refresh.
    try {
      const shops = await shopsFedByUser(userId)
      if (shops.length) await refreshShopActivityStats(shops)
    } catch (error) {
      logger.warn("Failed to refresh shop activity after a privacy change", {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return { hide_online_status: body.hide_online_status }
  }
}
