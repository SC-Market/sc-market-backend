/**
 * Admin › Premium › Storefront enquiries: the branded storefront enquiries
 * orgs and shops sent (services/storefront/enquiries.ts), and their status.
 * Site admins only (tsoa-auth admin gate + requireAdmin). Granting the
 * subdomain itself stays the Premium grant (v1 admin/premium).
 */
import { Body, Get, Patch, Path, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { isUuid } from "../util/short-slug.js"
import {
  EnquiryReopenConflictError,
  ENQUIRY_STATUSES,
  listEnquiriesForAdmin,
  updateEnquiryAsAdmin,
  type AdminEnquiryPage,
  type AdminStorefrontEnquiry,
  type EnquiryStatus,
} from "../../../../services/storefront/enquiries.js"
import { notifySubmitterOfDecision } from "../../../../services/storefront/enquiry-notify.js"

export interface UpdateStorefrontEnquiryRequest {
  status?: EnquiryStatus
  /**
   * Staff-only note (never shown to the org or shop). Empty clears it.
   * @maxLength 1000
   */
  staff_note?: string | null
}

@Route("admin/storefront-enquiries")
@Tags("Admin")
export class AdminStorefrontEnquiriesController extends BaseController {
  /**
   * Branded storefront enquiries, open ones first, then newest. With the
   * submitter's username and, when they chose Discord, their linked Discord.
   *
   * @summary List storefront enquiries
   */
  @Get("")
  @Security("loggedin")
  public async listStorefrontEnquiries(
    @Request() request: ExpressRequest,
    @Query() status?: EnquiryStatus,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<AdminEnquiryPage> {
    this.request = request
    this.requireAdmin()
    if (status !== undefined && !ENQUIRY_STATUSES.includes(status)) {
      this.throwValidationError("Unknown status", [{ field: "status", message: "Unknown status" }])
    }
    const p = Math.max(1, Math.floor(Number(page ?? 1)) || 1)
    const size = Math.min(100, Math.max(1, Math.floor(Number(page_size ?? 25)) || 25))
    this.setHeader("Cache-Control", "no-store")
    return listEnquiriesForAdmin({ status, page: p, pageSize: size })
  }

  /**
   * Change an enquiry's status (open, in progress, completed, declined) or
   * its staff note. Reopening fails with 409 while the org or shop has
   * another open enquiry. Setting completed (accepted) or declined notifies
   * the person who sent the enquiry, once per decision, by their preferences.
   *
   * @summary Update a storefront enquiry
   */
  @Patch("{enquiry_id}")
  @Security("loggedin")
  public async updateStorefrontEnquiry(
    @Request() request: ExpressRequest,
    @Path() enquiry_id: string,
    @Body() body: UpdateStorefrontEnquiryRequest,
  ): Promise<AdminStorefrontEnquiry> {
    this.request = request
    this.requireAdmin()
    if (!isUuid(enquiry_id)) this.throwNotFound("Storefront enquiry", enquiry_id)
    if (body.status !== undefined && !ENQUIRY_STATUSES.includes(body.status)) {
      this.throwValidationError("Unknown status", [{ field: "status", message: "Unknown status" }])
    }
    const note = typeof body.staff_note === "string" ? body.staff_note.trim() : body.staff_note
    if (typeof note === "string" && note.length > 1000) {
      this.throwValidationError("The note can be at most 1000 characters", [
        { field: "staff_note", message: "At most 1000 characters" },
      ])
    }
    if (body.status === undefined && note === undefined) {
      this.throwValidationError("Nothing to update", [{ field: "status", message: "Give a status or a note" }])
    }
    let updated: AdminStorefrontEnquiry | null
    try {
      updated = await updateEnquiryAsAdmin(enquiry_id, { status: body.status, staff_note: note }, this.getUserId())
    } catch (err) {
      if (err instanceof EnquiryReopenConflictError) this.throwConflict(err.message)
      throw err
    }
    if (!updated) this.throwNotFound("Storefront enquiry", enquiry_id)
    // Accepted (completed) or declined: tell the person who sent it (once per
    // decision; best effort, never fails the update).
    if (body.status !== undefined) await notifySubmitterOfDecision(updated, this.getUserId())
    this.setHeader("Cache-Control", "no-store")
    return updated
  }
}
