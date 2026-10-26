import { Body, Get, Put, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import {
  getChannelPreferences,
  setChannelPreferences,
} from "../../../../services/notifications/channel-preferences.js"
import { PRICE_ALERT_ACTION } from "../../../../services/watchlist/watchlist.service.js"
import type {
  PriceAlertPreferences,
  UpdatePriceAlertPreferencesRequest,
} from "../types/price-alerts.types.js"

/**
 * Where watchlist price alerts are delivered. Push and email share storage
 * with Settings -> Push / Email (the `price_alert` notification type there).
 */
@Route("price-alerts")
@Tags("Price Alerts")
export class PriceAlertsV2Controller extends BaseController {
  /**
   * Get the current user's price alert channel preferences
   * @summary Get price alert preferences
   */
  @Security("loggedin")
  @Get("preferences")
  public async getPriceAlertPreferences(
    @Request() request: ExpressRequest,
  ): Promise<PriceAlertPreferences> {
    this.request = request
    return getChannelPreferences(this.getUserId(), PRICE_ALERT_ACTION)
  }

  /**
   * Update the current user's price alert channel preferences
   * @summary Update price alert preferences
   */
  @Security("loggedin")
  @Put("preferences")
  public async updatePriceAlertPreferences(
    @Body() body: UpdatePriceAlertPreferencesRequest,
    @Request() request: ExpressRequest,
  ): Promise<PriceAlertPreferences> {
    this.request = request
    return setChannelPreferences(this.getUserId(), PRICE_ALERT_ACTION, body)
  }
}
