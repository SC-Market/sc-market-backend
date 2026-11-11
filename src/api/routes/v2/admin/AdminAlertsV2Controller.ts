/**
 * Admin alerts: announcements sent to a set of users on the channels the
 * admin picks (in-app always). List, create (which sends it), read, edit,
 * delete, and the audience preview shown before sending. Moved from v1
 * /api/admin/alerts (same validation). Site admins only (tsoa-auth admin gate
 * + requireAdmin).
 */
import {
  Body,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import * as adminDb from "../../v1/admin/database.js"
import * as contractorDb from "../../v1/contractors/database.js"
import { isUuid } from "../util/short-slug.js"
import type {
  AdminAlertChannel,
  DBAdminAlert,
} from "../../../../clients/database/db-models.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"
import {
  ALERT_TARGET_TYPES,
  formatAlertForApi,
  parseAlertChannels,
  type AdminAlert,
  type AdminAlertTargetType,
} from "../../../../services/admin/admin-alerts.js"
import logger from "../../../../logger/logger.js"

export type { AdminAlertTargetType }

export interface AdminAlertAudiencePreview {
  /** Users the alert would reach (the posting admin excluded). */
  recipients: number
  /** Of those, how many have a verified email (email reach). */
  verified_emails: number
  /** Of those, how many have Discord linked (Discord DM reach). */
  discord_linked: number
}

export interface AdminAlertsPage {
  alerts: AdminAlert[]
  pagination: {
    /** 0-based */
    page: number
    page_size: number
    total: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}

export interface AdminAlertCreateRequest {
  /** @maxLength 200 */
  title: string
  /** Markdown. */
  content: string
  /** An absolute URL the alert links to. */
  link?: string | null
  target_type: AdminAlertTargetType
  /** Required when target_type is specific_org. */
  target_spectrum_id?: string | null
  /**
   * Delivery channels. in_app is always added. Default: in_app and push.
   * Chosen channels ignore user opt-outs except email, which respects the
   * user's email opt-outs and unsubscribes; others never send.
   */
  channels?: AdminAlertChannel[]
  /** Required (true) to email all users. */
  confirm_email_all_users?: boolean
}

export interface AdminAlertUpdateRequest {
  /** @maxLength 200 */
  title?: string
  content?: string
  link?: string | null
  target_type?: AdminAlertTargetType
  /** Required when target_type is specific_org; null clears the org. */
  target_spectrum_id?: string | null
  active?: boolean
}

export interface AdminAlertDeleteResponse {
  success: boolean
  message: string
}

function isValidLink(link: string): boolean {
  try {
    new URL(link)
    return true
  } catch {
    return false
  }
}

@Route("admin/alerts")
@Tags("Admin")
export class AdminAlertsV2Controller extends BaseController {
  /**
   * Alerts, newest first.
   * @summary List admin alerts
   * @param page 0-based page
   * @param pageSize 1–100, default 20
   */
  @Get("")
  @Security("loggedin")
  public async listAdminAlerts(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() pageSize?: number,
    @Query() target_type?: AdminAlertTargetType,
    @Query() active?: boolean,
  ): Promise<AdminAlertsPage> {
    this.request = request
    this.requireAdmin()
    const p = Math.max(0, Math.floor(Number(page)) || 0)
    const size = Math.min(100, Math.max(1, Math.floor(Number(pageSize)) || 20))
    const where: Partial<Pick<DBAdminAlert, "target_type" | "active">> = {}
    if (target_type) where.target_type = target_type
    if (active !== undefined) where.active = active
    const result = await adminDb.getAdminAlertsPaginated(p, size, where)
    return {
      alerts: await Promise.all(result.alerts.map(formatAlertForApi)),
      pagination: result.pagination,
    }
  }

  /**
   * Create an alert and send it to its audience on its channels.
   * @summary Create and send an admin alert
   */
  @Post("")
  @Security("loggedin")
  public async createAdminAlert(
    @Request() request: ExpressRequest,
    @Body() body: AdminAlertCreateRequest,
  ): Promise<AdminAlert> {
    this.request = request
    this.requireAdmin()
    const { title, content, link, target_type, target_spectrum_id } = body
    const channelsResult = parseAlertChannels(body.channels)
    if ("error" in channelsResult) {
      this.throwValidationError(channelsResult.error, [
        { field: "channels", message: channelsResult.error },
      ])
    }
    const channels = channelsResult.channels
    if (
      target_type === "all_users" &&
      channels.includes("email") &&
      body.confirm_email_all_users !== true
    ) {
      this.throwValidationError(
        "Emailing all users needs confirm_email_all_users: true",
        [
          {
            field: "confirm_email_all_users",
            message: "Confirm emailing all users",
          },
        ],
      )
    }
    if (!title || !content || !target_type) {
      this.throwValidationError(
        "Title, content, and target_type are required",
        [
          {
            field: !title ? "title" : !content ? "content" : "target_type",
            message: "Required",
          },
        ],
      )
    }
    if (target_type === "specific_org" && !target_spectrum_id) {
      this.throwValidationError(
        "target_spectrum_id is required when target_type is specific_org",
        [{ field: "target_spectrum_id", message: "Pick an org" }],
      )
    }
    if (link && !isValidLink(link)) {
      this.throwValidationError("Invalid link format. Must be a valid URL.", [
        { field: "link", message: "Must be a valid URL" },
      ])
    }
    const target_contractor_id = target_spectrum_id
      ? await this.contractorIdFor(target_spectrum_id)
      : null

    const alert = await adminDb.createAdminAlert({
      title,
      content,
      link: link ?? null,
      target_type,
      target_contractor_id,
      created_by: this.getUserId(),
      active: true,
      channels,
    })
    await notificationService.createAdminAlertNotification(alert)
    logger.info("Admin alert created successfully", {
      alertId: alert.alert_id,
      createdBy: alert.created_by,
      targetType: target_type,
    })
    return formatAlertForApi(alert)
  }

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
        this.throwValidationError(
          "target_spectrum_id is required for specific_org",
          [{ field: "target_spectrum_id", message: "Pick an org" }],
        )
      }
      try {
        contractorId = (
          await contractorDb.getContractor({ spectrum_id: target_spectrum_id })
        ).contractor_id
      } catch {
        this.throwValidationError("Invalid target_spectrum_id", [
          {
            field: "target_spectrum_id",
            message: "No org with that Spectrum ID",
          },
        ])
      }
    }
    return adminDb.getAlertAudienceCounts(
      target_type,
      contractorId,
      this.getUserId(),
    )
  }

  /**
   * @summary Get an admin alert
   */
  @Get("{alert_id}")
  @Security("loggedin")
  public async getAdminAlert(
    @Request() request: ExpressRequest,
    @Path() alert_id: string,
  ): Promise<AdminAlert> {
    this.request = request
    this.requireAdmin()
    if (!isUuid(alert_id)) this.throwNotFound("Admin alert", alert_id)
    const [alert] = await adminDb.getAdminAlerts({ alert_id })
    if (!alert) this.throwNotFound("Admin alert", alert_id)
    return formatAlertForApi(alert)
  }

  /**
   * Edit an alert's text, link, target or active flag. Editing does not
   * send it again.
   * @summary Update an admin alert
   */
  @Patch("{alert_id}")
  @Security("loggedin")
  public async updateAdminAlert(
    @Request() request: ExpressRequest,
    @Path() alert_id: string,
    @Body() body: AdminAlertUpdateRequest,
  ): Promise<AdminAlert> {
    this.request = request
    this.requireAdmin()
    if (!isUuid(alert_id)) this.throwNotFound("Admin alert", alert_id)
    if (body.link && !isValidLink(body.link)) {
      this.throwValidationError("Invalid link format. Must be a valid URL.", [
        { field: "link", message: "Must be a valid URL" },
      ])
    }
    if (body.target_type && !ALERT_TARGET_TYPES.includes(body.target_type)) {
      this.throwValidationError(
        "Invalid target_type. Must be one of: " + ALERT_TARGET_TYPES.join(", "),
        [{ field: "target_type", message: "Unknown target type" }],
      )
    }
    if (body.target_type === "specific_org" && !body.target_spectrum_id) {
      this.throwValidationError(
        "target_spectrum_id is required when target_type is specific_org",
        [{ field: "target_spectrum_id", message: "Pick an org" }],
      )
    }

    const updates: Partial<DBAdminAlert> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.content !== undefined) updates.content = body.content
    if (body.link !== undefined) updates.link = body.link
    if (body.target_type !== undefined) updates.target_type = body.target_type
    if (body.active !== undefined) updates.active = body.active
    if (body.target_spectrum_id) {
      updates.target_contractor_id = await this.contractorIdFor(
        body.target_spectrum_id,
      )
    } else if (body.target_spectrum_id === null) {
      updates.target_contractor_id = null
    }
    if (Object.keys(updates).length === 0) {
      this.throwValidationError("Nothing to update", [
        { field: "title", message: "Give a field to change" },
      ])
    }

    const updated = await adminDb.updateAdminAlert(alert_id, updates)
    if (!updated) this.throwNotFound("Admin alert", alert_id)
    logger.info("Admin alert updated successfully", {
      alertId: alert_id,
      updatedFields: Object.keys(updates),
    })
    return formatAlertForApi(updated)
  }

  /**
   * Delete an alert. Notifications already delivered stay.
   * @summary Delete an admin alert
   */
  @Delete("{alert_id}")
  @Security("loggedin")
  public async deleteAdminAlert(
    @Request() request: ExpressRequest,
    @Path() alert_id: string,
  ): Promise<AdminAlertDeleteResponse> {
    this.request = request
    this.requireAdmin()
    if (!isUuid(alert_id)) this.throwNotFound("Admin alert", alert_id)
    const deleted = await adminDb.deleteAdminAlert(alert_id)
    if (!deleted) this.throwNotFound("Admin alert", alert_id)
    logger.info("Admin alert deleted successfully", { alertId: alert_id })
    return { success: true, message: "Admin alert deleted successfully" }
  }

  private async contractorIdFor(spectrumId: string): Promise<string> {
    try {
      return (await contractorDb.getContractor({ spectrum_id: spectrumId }))
        .contractor_id
    } catch {
      this.throwValidationError("Invalid target_spectrum_id", [
        {
          field: "target_spectrum_id",
          message: "No org with that Spectrum ID",
        },
      ])
    }
  }
}
