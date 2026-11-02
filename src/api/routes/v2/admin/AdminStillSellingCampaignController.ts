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
import { ErrorCode } from "../../v1/util/error-codes.js"
import {
  BATCH_PAUSE_MS,
  BATCH_SIZE,
  CAMPAIGN,
  INACTIVE_DAYS,
  KILL_SWITCH_ENV,
  MAX_RECIPIENTS_ENV,
  maxRecipients,
  summarize,
  STALE_DAYS,
  campaignEnabled,
  campaignProgress,
  eligibleRecipients,
  requestStop,
  runState,
  TEST_DMS_PER_HOUR,
  sampleMessage,
  sendTestDm,
  startCampaign,
} from "../../../../services/dm-campaigns/still-selling.service.js"
import { feedbackSummary } from "../../../../services/dm-campaigns/still-selling-feedback.js"
import { campaignLocale } from "../../../../services/dm-campaigns/still-selling-message.js"
import type {
  StillSellingDryRun,
  StillSellingLocale,
  StillSellingSendRequest,
  StillSellingSendResponse,
  StillSellingTestRequest,
  StillSellingTestResponse,
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
    const summary = summarize(await eligibleRecipients(), maxRecipients())
    return {
      campaign: CAMPAIGN,
      kill_switch_env: KILL_SWITCH_ENV,
      enabled: campaignEnabled(),
      recipients: summary.recipients,
      sellers: summary.sellers,
      listings: summary.listings,
      listing_age: summary.listing_age,
      max_recipients: summary.cap,
      max_recipients_env: MAX_RECIPIENTS_ENV,
      over_cap: summary.over_cap,
      top_recipients: summary.top,
      feedback: await feedbackSummary(CAMPAIGN),
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
        over_cap: `${result.recipients} people are eligible, more than the cap of ${result.cap} (${MAX_RECIPIENTS_ENV}); check the eligibility before raising it`,
        count_changed: `More people are eligible now (${result.recipients}) than confirmed (${expected}); run the dry run again`,
      }
      this.throwConflict(messages[result.reason], {
        reason: result.reason,
        recipients: result.recipients,
        cap: result.cap,
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

  /**
   * Send the campaign DM to yourself (the requesting admin) and no one else:
   * same text, language and buttons, test links that change nothing, a
   * "Test message" footer. Uses your own live listing counts, or sample
   * numbers if you have none. Works while the campaign switch is off (it can
   * only reach you); never creates or uses a campaign recipient row. At most
   * 5 per hour.
   *
   * @summary Send the "Still selling?" test DM to me
   */
  @Post("test")
  @Security("loggedin")
  public async sendStillSellingTestDm(
    @Request() request: ExpressRequest,
    @Body() body: StillSellingTestRequest,
  ): Promise<StillSellingTestResponse> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    const result = await sendTestDm(this.getUserId(), {
      locale: body?.locale ?? null,
    })
    if (!result.ok) {
      if (result.reason === "rate_limited") {
        this.setStatus(429)
        this.throwBusinessError(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          `At most ${TEST_DMS_PER_HOUR} test DMs per hour`,
        )
      }
      if (result.reason === "no_discord") {
        this.throwConflict("Link your Discord account to receive the test DM", {
          reason: "no_discord",
        })
      }
      this.throwConflict(
        `Discord refused the DM: ${result.error ?? "unknown error"}`,
        {
          reason: "failed",
        },
      )
    }
    return { sample: result.sample, message: result.message }
  }
}
