/**
 * Admin → Test accounts (docs/testing-with-test-accounts.md).
 *
 * Site admins only, browser sessions only (tsoa-auth SESSION_ONLY_PREFIXES),
 * main site only (custom-origin denylist covers /api/v2/admin). Creating and
 * deleting need a fresh two-factor step-up (10 min) even when
 * ADMIN_MFA_ENFORCE is off: the admin must have enrolled two-factor first.
 */

import { Body, Delete, Get, Path, Post, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { BusinessLogicError } from "../../v1/util/errors.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import { getKeyring } from "../../../../services/mfa/config.js"
import { getMfaService } from "../../../../services/mfa/instance.js"
import { stepUpSatisfied } from "../../../../services/mfa/policy.js"
import { stepUpError } from "../../../util/step-up.js"
import {
  createTestAccount,
  deleteTestAccount,
  listTestAccounts,
  type TestAccountSummary,
} from "../../../../services/test-accounts/admin.js"
import { isTestLoginEnabled } from "../../../../services/test-accounts/config.js"

export interface CreateTestAccountRequest {
  /**
   * "test" followed by a name (e.g. test-buyer). Saved with a reserved "~"
   * prefix (~test-buyer) that real usernames can't have.
   * @minLength 6
   * @maxLength 41
   */
  username: string
  /**
   * @minLength 1
   * @maxLength 100
   */
  display_name: string
}

export interface CreateTestAccountResponse {
  user_id: string
  username: string
  display_name: string
  /** otpauth:// URI of the account's authenticator. Shown once. */
  otpauth_uri: string
  /** Base32 TOTP secret, no spaces. Shown once. */
  secret: string
  /** The secret grouped by 4, for manual entry. */
  manual_key: string
  /** data: URL of an SVG QR code for otpauth_uri. */
  qr_data_url: string
}

export interface TestAccountListResponse {
  /** Whether POST /api/auth/test-login is switched on (TEST_LOGIN_ENABLED). */
  login_enabled: boolean
  accounts: TestAccountSummary[]
}

export interface DeleteTestAccountResponse {
  mode: "deleted" | "disabled"
  orgs: number
  shops: number
}

@Route("admin/test-accounts")
@Tags("Admin")
export class TestAccountsController extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Step-up that does not depend on ADMIN_MFA_ENFORCE: the server must have
   * the MFA key, the admin an authenticator, and this session a code from the
   * last 10 minutes.
   */
  private async requireStrictStepUp(): Promise<void> {
    const request = this.request!
    if (!getKeyring()) {
      throw new BusinessLogicError(
        ErrorCode.MFA_NOT_CONFIGURED,
        "Two-factor authentication is not configured on this server",
      )
    }
    const mfa = getMfaService()
    const userId = this.getUserId()
    if (!(await mfa.isEnrolled(userId))) {
      throw new BusinessLogicError(
        ErrorCode.MFA_ENROLLMENT_REQUIRED,
        "Set up two-factor authentication before managing test accounts",
      )
    }
    if (!stepUpSatisfied(request.auth, await mfa.mfaChangedAt(userId))) throw stepUpError()
  }

  private ctx() {
    const request = this.request!
    return { ip: request.ip || null, userAgent: request.headers["user-agent"]?.toString() || null }
  }

  /**
   * List test accounts.
   * @summary List test accounts
   */
  @Security("loggedin")
  @Get("")
  public async listTestAccounts(@Request() request: ExpressRequest): Promise<TestAccountListResponse> {
    this.request = request
    this.requireAdmin()
    this.setHeader("Cache-Control", "no-store")
    return { login_enabled: isTestLoginEnabled(), accounts: await listTestAccounts() }
  }

  /**
   * Create a test account with an authenticator. The secret is returned only
   * here, once. Needs a fresh two-factor step-up.
   * @summary Create a test account
   */
  @Security("loggedin")
  @Post("")
  public async createTestAccount(
    @Request() request: ExpressRequest,
    @Body() body: CreateTestAccountRequest,
  ): Promise<CreateTestAccountResponse> {
    this.request = request
    this.requireAdmin()
    await this.requireStrictStepUp()
    const created = await createTestAccount(body, this.getUserId(), this.ctx())
    this.setHeader("Cache-Control", "no-store")
    return created
  }

  /**
   * Delete a test account and its test orgs, shops, listings and orders.
   * Only accounts marked as test accounts can be deleted here. Needs a fresh
   * two-factor step-up.
   * @summary Delete a test account
   */
  @Security("loggedin")
  @Delete("{username}")
  public async deleteTestAccount(
    @Request() request: ExpressRequest,
    @Path() username: string,
  ): Promise<DeleteTestAccountResponse> {
    this.request = request
    this.requireAdmin()
    await this.requireStrictStepUp()
    return deleteTestAccount(username, this.getUserId())
  }
}
