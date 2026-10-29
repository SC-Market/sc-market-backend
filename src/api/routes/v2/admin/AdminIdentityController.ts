/**
 * Admin -> Identity: find an account by username, display name, Discord id,
 * Spectrum id or user id, see its identities, and fix identity conflicts
 * (services/identity-admin; drafts/scmarket-identity-admin.md).
 *
 * Site admins only (tsoa-auth admin gate + requireAdmin), browser sessions
 * only (tsoa-auth SESSION_ONLY_PREFIXES). Every change needs a reason and a
 * fresh two-factor step-up (10 min) whatever ADMIN_MFA_ENFORCE says, writes an
 * audit_logs row in the same transaction, and notifies the user.
 */

import { Body, Get, Path, Post, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { BusinessLogicError } from "../../v1/util/errors.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import { assertStrictStepUp } from "../../../util/step-up.js"
import {
  fixSpectrum,
  getIdentityDetail,
  isUuid,
  releaseUsername,
  searchIdentities,
  setAccountActive,
  unlinkDiscord,
  type ActionResult,
  type IdentityActionKind,
  type IdentityDetail,
  type IdentitySearchRow,
} from "../../../../services/identity-admin/identity-admin.service.js"
import { notifyIdentityChanged } from "../../../../services/identity-admin/notify.js"

export interface IdentitySearchResponse {
  users: IdentitySearchRow[]
}

export interface IdentityActionRequest {
  /**
   * Why (kept in the audit log, never shown to the user).
   * @minLength 5
   * @maxLength 500
   */
  reason: string
}

export interface UnlinkDiscordRequest extends IdentityActionRequest {
  /** Unlink even though Discord is the account's only login method. */
  allow_no_login?: boolean
}

export interface SpectrumFixRequest extends IdentityActionRequest {
  /** clear: remove the Spectrum id (and RSI verification); set: write spectrum_user_id. */
  mode: "clear" | "set"
  /**
   * Required for "set". Digits only; refused if another account holds it.
   * @pattern ^[0-9]{1,20}$
   */
  spectrum_user_id?: string
}

export interface IdentityActionResponse {
  audit_log_id: string
  kind: IdentityActionKind
  user: IdentityDetail
}

@Route("admin/identity")
@Tags("Admin")
export class AdminIdentityController extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  private actor() {
    return { user_id: this.getUserId() }
  }

  private requireUserId(userId: string): void {
    if (!isUuid(userId)) throw new BusinessLogicError(ErrorCode.NOT_FOUND, "Account not found")
  }

  /** Admin + strict step-up, for every change. */
  private async authorizeChange(request: ExpressRequest, userId: string): Promise<void> {
    this.request = request
    this.requireAdmin()
    this.requireUserId(userId)
    await assertStrictStepUp(request, "Set up two-factor authentication before changing account identities")
  }

  private async finish(result: ActionResult, userId: string): Promise<IdentityActionResponse> {
    await notifyIdentityChanged(userId, this.getUserId(), result)
    this.setHeader("Cache-Control", "no-store")
    return { audit_log_id: result.audit_log_id, kind: result.kind, user: await getIdentityDetail(userId) }
  }

  /**
   * Search accounts by user id, Discord id, Spectrum id (exact), username
   * (prefix) or display name (substring). At most 25.
   * @summary Search account identities
   */
  @Security("loggedin")
  @Get("users")
  public async searchIdentityUsers(
    @Request() request: ExpressRequest,
    @Query() q: string,
  ): Promise<IdentitySearchResponse> {
    this.request = request
    this.requireAdmin()
    this.setHeader("Cache-Control", "no-store")
    return { users: await searchIdentities(q) }
  }

  /**
   * An account's identity fields, linked logins, deletion state, active
   * sessions and recent identity changes.
   * @summary Get an account's identities
   */
  @Security("loggedin")
  @Get("users/{user_id}")
  public async getIdentityUser(
    @Request() request: ExpressRequest,
    @Path() user_id: string,
  ): Promise<IdentityDetail> {
    this.request = request
    this.requireAdmin()
    this.requireUserId(user_id)
    this.setHeader("Cache-Control", "no-store")
    return getIdentityDetail(user_id)
  }

  /**
   * Rename the account to a free placeholder username so its current handle
   * is released. Needs a fresh two-factor step-up.
   * @summary Release an account's username
   */
  @Security("loggedin")
  @Post("users/{user_id}/release-username")
  public async releaseIdentityUsername(
    @Request() request: ExpressRequest,
    @Path() user_id: string,
    @Body() body: IdentityActionRequest,
  ): Promise<IdentityActionResponse> {
    await this.authorizeChange(request, user_id)
    return this.finish(await releaseUsername(this.actor(), user_id, body.reason), user_id)
  }

  /**
   * Unlink the account's Discord (provider and legacy column). Needs a fresh
   * two-factor step-up.
   * @summary Unlink an account's Discord
   */
  @Security("loggedin")
  @Post("users/{user_id}/unlink-discord")
  public async unlinkIdentityDiscord(
    @Request() request: ExpressRequest,
    @Path() user_id: string,
    @Body() body: UnlinkDiscordRequest,
  ): Promise<IdentityActionResponse> {
    await this.authorizeChange(request, user_id)
    return this.finish(
      await unlinkDiscord(this.actor(), user_id, body.reason, body.allow_no_login === true),
      user_id,
    )
  }

  /**
   * Clear or set the account's Spectrum id. Never moves an id from another
   * account. Needs a fresh two-factor step-up.
   * @summary Fix an account's Spectrum link
   */
  @Security("loggedin")
  @Post("users/{user_id}/spectrum")
  public async fixIdentitySpectrum(
    @Request() request: ExpressRequest,
    @Path() user_id: string,
    @Body() body: SpectrumFixRequest,
  ): Promise<IdentityActionResponse> {
    await this.authorizeChange(request, user_id)
    if (body.mode === "set" && !body.spectrum_user_id) {
      throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "spectrum_user_id is required to set it")
    }
    const fix =
      body.mode === "set"
        ? { mode: "set" as const, spectrum_user_id: body.spectrum_user_id! }
        : { mode: "clear" as const }
    return this.finish(await fixSpectrum(this.actor(), user_id, body.reason, fix), user_id)
  }

  /**
   * Deactivate the account and end its sessions. Needs a fresh two-factor
   * step-up.
   * @summary Deactivate an account
   */
  @Security("loggedin")
  @Post("users/{user_id}/deactivate")
  public async deactivateIdentityUser(
    @Request() request: ExpressRequest,
    @Path() user_id: string,
    @Body() body: IdentityActionRequest,
  ): Promise<IdentityActionResponse> {
    await this.authorizeChange(request, user_id)
    return this.finish(await setAccountActive(this.actor(), user_id, body.reason, false), user_id)
  }

  /**
   * Reactivate a deactivated account. Needs a fresh two-factor step-up.
   * @summary Reactivate an account
   */
  @Security("loggedin")
  @Post("users/{user_id}/reactivate")
  public async reactivateIdentityUser(
    @Request() request: ExpressRequest,
    @Path() user_id: string,
    @Body() body: IdentityActionRequest,
  ): Promise<IdentityActionResponse> {
    await this.authorizeChange(request, user_id)
    return this.finish(await setAccountActive(this.actor(), user_id, body.reason, true), user_id)
  }
}
