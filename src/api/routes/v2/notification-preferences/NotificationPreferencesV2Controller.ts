import { Body, Get, Put, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import * as contractorDb from "../../v1/contractors/database.js"
import {
  getMatrix,
  getOrgMute,
  PreferenceUpdateError,
  setOrgMute,
  setPreferences,
} from "../../../../services/notify/preference-matrix.js"
import type {
  NotificationPreferenceScope,
  NotificationPreferencesResponse,
  UpdateNotificationOrgMuteRequest,
  UpdateNotificationPreferencesRequest,
} from "../types/notification-preferences.types.js"

/**
 * Notification preferences as one matrix (categories x channels, per-event
 * overrides). Reads and writes the same settings as the Push and Email
 * preference endpoints and the price alert toggles.
 */
@Route("notification-preferences")
@Tags("Notifications")
export class NotificationPreferencesV2Controller extends BaseController {
  /**
   * Get the current user's notification preferences for one scope
   * @summary Get notification preferences
   * @param contractor_id An org the user belongs to; omit for personal notifications
   */
  @Security("loggedin")
  @Get()
  public async getNotificationPreferences(
    @Request() request: ExpressRequest,
    @Query() contractor_id?: string,
  ): Promise<NotificationPreferencesResponse> {
    this.request = request
    const userId = this.getUserId()
    const scopes = await this.scopes(userId)
    const scope = this.checkScope(scopes, contractor_id ?? null)
    return this.response(userId, scope, scopes)
  }

  /**
   * Update notification preferences for one scope
   * @summary Update notification preferences
   */
  @Security("loggedin")
  @Put()
  public async updateNotificationPreferences(
    @Body() body: UpdateNotificationPreferencesRequest,
    @Request() request: ExpressRequest,
  ): Promise<NotificationPreferencesResponse> {
    this.request = request
    const userId = this.getUserId()
    const scopes = await this.scopes(userId)
    const scope = this.checkScope(scopes, body.contractor_id ?? null)
    if (!Array.isArray(body.updates) || body.updates.length === 0 || body.updates.length > 200) {
      this.throwValidationError("updates must list 1-200 changes", [
        { field: "updates", message: "updates must list 1-200 changes" },
      ])
    }
    try {
      await setPreferences(userId, scope, body.updates)
    } catch (err) {
      if (err instanceof PreferenceUpdateError) {
        this.throwValidationError(err.message, [{ field: "updates", message: err.message }])
      }
      throw err
    }
    return this.response(userId, scope, scopes)
  }

  /**
   * Mute or unmute one org's notifications: push, email and Discord DM stop
   * for its events; in-app notifications are still listed, and mandatory
   * alerts still arrive.
   * @summary Mute an org's notifications
   */
  @Security("loggedin")
  @Put("mute")
  public async updateNotificationOrgMute(
    @Body() body: UpdateNotificationOrgMuteRequest,
    @Request() request: ExpressRequest,
  ): Promise<NotificationPreferencesResponse> {
    this.request = request
    const userId = this.getUserId()
    const scopes = await this.scopes(userId)
    const scope = this.checkScope(scopes, body.contractor_id ?? null)
    if (!scope) {
      this.throwValidationError("contractor_id is required", [
        { field: "contractor_id", message: "Pick an org to mute" },
      ])
    }
    const until = body.until ? new Date(body.until) : null
    if (until && Number.isNaN(until.getTime())) {
      this.throwValidationError("until must be an ISO time", [{ field: "until", message: "Invalid time" }])
    }
    try {
      await setOrgMute(userId, scope!, !!body.muted, until)
    } catch (err) {
      if (err instanceof PreferenceUpdateError) {
        this.throwValidationError(err.message, [{ field: "until", message: err.message }])
      }
      throw err
    }
    return this.response(userId, scope, scopes)
  }

  private async response(
    userId: string,
    scope: string | null,
    scopes: NotificationPreferenceScope[],
  ): Promise<NotificationPreferencesResponse> {
    return {
      contractor_id: scope,
      scopes,
      categories: (await getMatrix(userId, scope)) as NotificationPreferencesResponse["categories"],
      ...(scope ? { mute: await getOrgMute(userId, scope) } : {}),
    }
  }

  private async scopes(userId: string): Promise<NotificationPreferenceScope[]> {
    const orgs = await contractorDb.getUserContractors({ "contractor_members.user_id": userId })
    return [
      { contractor_id: null, name: "Personal", spectrum_id: null },
      ...orgs.map((o) => ({ contractor_id: o.contractor_id, name: o.name, spectrum_id: o.spectrum_id })),
    ]
  }

  private checkScope(scopes: NotificationPreferenceScope[], contractorId: string | null): string | null {
    if (contractorId === null) return null
    if (!scopes.some((s) => s.contractor_id === contractorId)) {
      this.throwForbidden("You are not a member of this organization")
    }
    return contractorId
  }
}
