/**
 * Admin alerts (V2): the audience preview shown before an alert is sent.
 * Creating alerts stays on POST /api/admin/alerts (V1).
 */
import { Get, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import * as adminDb from "../../v1/admin/database.js"
import * as contractorDb from "../../v1/contractors/database.js"

export type AdminAlertTargetType = "all_users" | "org_members" | "org_owners" | "admins_only" | "specific_org"

export interface AdminAlertAudiencePreview {
  /** Users the alert would reach (the posting admin excluded). */
  recipients: number
  /** Of those, how many have a verified email (email reach). */
  verified_emails: number
  /** Of those, how many have Discord linked (Discord DM reach). */
  discord_linked: number
}

@Route("admin/alerts")
@Tags("Admin")
export class AdminAlertsV2Controller extends BaseController {
  /**
   * How many users an alert to this target would reach, and how many of them
   * an email or a Discord DM would reach.
   * @summary Preview an admin alert's audience
   * @param target_spectrum_id The org, when target_type is specific_org
   */
  @Get("preview")
  @Security("loggedin")
  public async previewAdminAlertAudience(
    @Request() request: ExpressRequest,
    @Query() target_type: AdminAlertTargetType,
    @Query() target_spectrum_id?: string,
  ): Promise<AdminAlertAudiencePreview> {
    this.request = request
    this.requireAdmin()
    let contractorId: string | undefined
    if (target_type === "specific_org") {
      if (!target_spectrum_id) {
        this.throwValidationError("target_spectrum_id is required for specific_org", [
          { field: "target_spectrum_id", message: "Pick an org" },
        ])
      }
      try {
        contractorId = (await contractorDb.getContractor({ spectrum_id: target_spectrum_id })).contractor_id
      } catch {
        this.throwValidationError("Invalid target_spectrum_id", [
          { field: "target_spectrum_id", message: "No org with that Spectrum ID" },
        ])
      }
    }
    return adminDb.getAlertAudienceCounts(target_type, contractorId, this.getUserId())
  }
}
