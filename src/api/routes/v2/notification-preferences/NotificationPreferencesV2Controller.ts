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
import { discordDmStateSql, USER_INSTALL_COUNTS_AS_DM_REACHABLE } from "../../../../services/discord/dm-reachability.js"
import { userInstallAvailable, userInstallUrl } from "../../../../services/discord/app-install.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import type {
  DiscordReachabilityResponse,
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

  /**
   * Whether SC Market can reach you by Discord DM (linked, your last DM was
   * not refused, you share a server with the bot), and the link to add the
   * SC Market app to your own Discord account when that is possible. Your
   * own state only.
   * @summary Get your Discord DM reachability
   */
  @Security("loggedin")
  @Get("discord-reachability")
  public async getDiscordReachability(
    @Request() request: ExpressRequest,
  ): Promise<DiscordReachabilityResponse> {
    this.request = request
    const userId = this.getUserId()
    this.setHeader("Cache-Control", "private, no-store")
    const state = discordDmStateSql("u.user_id")
    const [result, available] = await Promise.all([
      getKnex().raw(
        `SELECT dm.discord_linked, dm.dm_reachable, dm.shares_server, dm.user_installed
         FROM (SELECT ?::uuid AS user_id) u CROSS JOIN LATERAL (${state.sql}) dm`,
        [userId, ...state.bindings],
      ),
      userInstallAvailable(),
    ])
    const row = (result?.rows?.[0] ?? {}) as Partial<Record<"discord_linked" | "dm_reachable" | "shares_server" | "user_installed", boolean>>
    return {
      discord_linked: !!row.discord_linked,
      dm_reachable: !!row.dm_reachable,
      shares_server: !!row.shares_server,
      user_installed: !!row.user_installed,
      user_install_counts_as_dm: USER_INSTALL_COUNTS_AS_DM_REACHABLE,
      user_install_available: available,
      user_install_url: available ? userInstallUrl() : null,
    }
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
