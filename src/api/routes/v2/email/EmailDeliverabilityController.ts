import { Get, Post, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import {
  getEmailDeliverability,
  requestReverify,
} from "../../../../services/email/deliverability.service.js"
import type {
  EmailDeliverabilityResponse,
  EmailReverifyResponse,
} from "../types/email-deliverability.types.js"

/**
 * Whether email reaches the signed-in user's address. SES bounces and spam
 * complaints mark it undeliverable; re-verifying it clears that.
 */
@Route("email")
@Tags("Email")
export class EmailDeliverabilityController extends BaseController {
  /**
   * Whether the current user's email address is marked undeliverable
   * (bounced or complained), and when SES last confirmed a delivery
   * @summary Get my email deliverability
   */
  @Security("loggedin")
  @Get("deliverability")
  public async getEmailDeliverability(
    @Request() request: ExpressRequest,
  ): Promise<EmailDeliverabilityResponse> {
    this.request = request
    return getEmailDeliverability(this.getUserId())
  }

  /**
   * Send a verification email to the current user's undeliverable address.
   * Following its link marks the address deliverable again. One per
   * 15 minutes.
   * @summary Re-verify my bounced email
   */
  @Security("loggedin")
  @Post("deliverability/reverify")
  public async reverifyEmail(
    @Request() request: ExpressRequest,
  ): Promise<EmailReverifyResponse> {
    this.request = request
    const result = await requestReverify(this.getUserId())
    if (result.ok) {
      return { sent: true, reverify_available_at: result.reverifyAvailableAt.toISOString() }
    }
    if (result.reason === "no_email") this.throwNotFound("Email address")
    if (result.reason === "not_undeliverable") {
      this.throwBusinessError(ErrorCode.VALIDATION_ERROR, "This email address is not marked undeliverable")
    }
    this.throwBusinessError(ErrorCode.RATE_LIMIT_EXCEEDED, "A verification email was sent recently", {
      reverify_available_at: result.reason === "cooldown" ? result.reverifyAvailableAt.toISOString() : null,
    })
  }
}
