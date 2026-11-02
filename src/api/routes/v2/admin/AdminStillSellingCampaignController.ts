/**
 * Admin › Market › "Still selling?" campaign (services/dm-campaigns/still-selling.service.ts):
 * the dry run (who it would reach, a sample DM), Send and Stop, and live
 * progress. Site admins only. Sending needs the kill switch
 * (STILL_SELLING_CAMPAIGN_ENABLED=true) and a fresh two-factor check, and is
 * capped at the count the admin confirmed.
 */
import { Body, Get, Post, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import {
  BATCH_PAUSE_MS,
  BATCH_SIZE,
  CAMPAIGN,
  INACTIVE_DAYS,
  KILL_SWITCH_ENV,
  STALE_DAYS,
  campaignEnabled,
  campaignProgress,
  eligibleRecipients,
  requestStop,
  runState,
  sampleMessage,
  startCampaign,
} from "../../../../services/dm-campaigns/still-selling.service.js"
import { campaignLocale } from "../../../../services/dm-campaigns/still-selling-message.js"
import type {
  StillSellingDryRun,
  StillSellingLocale,
  StillSellingSendRequest,
  StillSellingSendResponse,
} from "../types/still-selling.types.js"

@Route("admin/dm-campaigns/still-selling")
@Tags("Admin")
export class AdminStillSellingCampaignController extends BaseController {
  /**
   * Dry run: how many people the campaign would DM now and how many stale
   * listings that covers, one sample DM with fake data, whether the kill
   * switch is on, and the results so far. Sends nothing.
   *
   * @summary "Still selling?" campaign dry run and progress
   * @param locale Language of the sample DM (default English)
   */
  @Get("")
  @Security("loggedin")
  public async getStillSellingCampaign(
    @Request() request: ExpressRequest,
    @Query() locale?: StillSellingLocale,
  ): Promise<StillSellingDryRun> {
    this.request = request
    this.requireAdmin()
    this.setHeader("Cache-Control", "private, no-store")
    const recipients = await eligibleRecipients()
    const listings = new Set(recipients.flatMap((r) => r.listing_ids))
    return {
      campaign: CAMPAIGN,
      kill_switch_env: KILL_SWITCH_ENV,
      enabled: campaignEnabled(),
      recipients: recipients.length,
      listings: listings.size,
      sample: sampleMessage(campaignLocale(locale)),
      progress: await campaignProgress(),
      run: runState(),
      batch_size: BATCH_SIZE,
      batch_pause_seconds: BATCH_PAUSE_MS / 1000,
      stale_days: STALE_DAYS,
      inactive_days: INACTIVE_DAYS,
    }
  }

  /**
   * Start sending, in the background, to at most `expected_recipients`
   * people (the dry run's count). Refused (409) when the kill switch is off,
   * a send is already running, no one is left, or more people are eligible
   * now than were confirmed (run the dry run again).
   *
   * @summary Send the "Still selling?" campaign
   */
  @Post("send")
  @Security("loggedin")
  public async sendStillSellingCampaign(
    @Request() request: ExpressRequest,
    @Body() body: StillSellingSendRequest,
  ): Promise<StillSellingSendResponse> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    const expected = Number(body?.expected_recipients)
    if (!Number.isInteger(expected) || expected < 1) {
      this.throwValidationError(
        "expected_recipients must be a positive integer",
        [
          {
            field: "expected_recipients",
            message: "Confirm the recipient count from the dry run",
          },
        ],
      )
    }
    const result = await startCampaign(expected)
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        disabled: `Sending is off: set ${KILL_SWITCH_ENV}=true to enable it`,
        running: "A send is already running",
        nothing_to_send: "No one is left to send to",
        count_changed: `More people are eligible now (${result.recipients}) than confirmed (${expected}); run the dry run again`,
      }
      this.throwConflict(messages[result.reason], {
        reason: result.reason,
        recipients: result.recipients,
      })
    }
    return { run: result.state }
  }

  /**
   * Stop a running send after the DM in flight. Nothing already sent is
   * undone; pressing Send again continues with whoever is left.
   *
   * @summary Stop the "Still selling?" campaign send
   */
  @Post("stop")
  @Security("loggedin")
  public async stopStillSellingCampaign(
    @Request() request: ExpressRequest,
  ): Promise<StillSellingSendResponse> {
    this.request = request
    this.requireAdmin()
    return { run: requestStop() }
  }
}
