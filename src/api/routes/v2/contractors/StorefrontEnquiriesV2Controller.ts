/**
 * Branded storefront enquiries (services/storefront/enquiries.ts): an org's
 * officers (Manage Org Details) or a shop's managers ask SC Market staff for
 * a branded storefront on <name>.sc-market.space, and see how it's going.
 * Staff handle them in Admin › Premium (AdminStorefrontEnquiriesController).
 */
import { Body, Get, Post, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { has_permission } from "../../v1/util/permissions.js"
import { canManageShop, getShopById } from "../../../../services/shops/shop-permissions.service.js"
import { isUuid } from "../util/short-slug.js"
import {
  checkSubdomain,
  createEnquiry,
  ENQUIRY_MESSAGE_MAX,
  latestEnquiry,
  OpenEnquiryExistsError,
  subdomainTaken,
  type EnquiryContactMethod,
  type EnquiryTarget,
  type EnquiryTargetType,
  type StorefrontEnquiry,
} from "../../../../services/storefront/enquiries.js"
import { notifyAdminsOfEnquiry } from "../../../../services/storefront/enquiry-notify.js"

export interface CreateStorefrontEnquiryRequest {
  /** "org" or "shop". */
  target_type: EnquiryTargetType
  /** The org's spectrum ID, or the shop's ID. */
  target_id: string
  /**
   * The subdomain wanted: `<name>.sc-market.space` (the suffix may be left
   * out). One label: lower-case letters, digits and hyphens, 2–63 characters.
   * @maxLength 100
   */
  requested_subdomain: string
  /**
   * What you'd like (staff only). Up to 1000 characters.
   * @maxLength 1000
   */
  message?: string
  /** How staff should reach you: the Discord linked to your profile, or a message on SC Market. */
  contact_method: EnquiryContactMethod
}

export interface StorefrontEnquiryResponse {
  /** The latest enquiry for the org or shop (any status), null if none. */
  enquiry: StorefrontEnquiry | null
}

@Route("storefront-enquiries")
@Tags("Contractors")
export class StorefrontEnquiriesV2Controller extends BaseController {
  /**
   * The org or shop, when the caller may enquire for it: Manage Org Details
   * in the org, or managing the shop (its owner, or Manage Market in its org).
   */
  private async authorizedTarget(type: unknown, id: unknown): Promise<EnquiryTarget> {
    if (type !== "org" && type !== "shop") {
      this.throwValidationError("target_type must be org or shop", [
        { field: "target_type", message: "Must be org or shop" },
      ])
    }
    if (typeof id !== "string" || id.trim() === "") {
      this.throwValidationError("target_id is required", [{ field: "target_id", message: "Required" }])
    }
    const userId = this.getUserId()
    if (type === "org") {
      const org = await getKnex()("contractors")
        .where({ spectrum_id: id })
        .first<{ contractor_id: string; spectrum_id: string; name: string; archived: boolean; is_test: boolean | null } | undefined>(
          "contractor_id",
          "spectrum_id",
          "name",
          "archived",
          "is_test",
        )
      if (!org || org.archived) this.throwNotFound("Contractor", id)
      await this.requireTokenOrgAccess(org.contractor_id)
      if (!(await has_permission(org.contractor_id, userId, "manage_org_details"))) {
        this.throwForbidden("Manage Org Details is needed to enquire about the org's storefront")
      }
      return { type, id: org.contractor_id, handle: org.spectrum_id, name: org.name, is_test: !!org.is_test }
    }
    if (!isUuid(id)) this.throwNotFound("Shop", id)
    const shop = await getShopById(id)
    if (!shop || shop.status === "archived") this.throwNotFound("Shop", id)
    await this.requireTokenOrgAccess(shop.owner_contractor_id)
    if (!(await canManageShop(shop, userId))) {
      this.throwForbidden("Only the shop's managers can enquire about its storefront")
    }
    return { type, id: shop.shop_id, handle: shop.slug, name: shop.name, is_test: !!shop.is_test }
  }

  /**
   * Ask SC Market staff for a branded storefront on a subdomain of
   * sc-market.space, for an org (Manage Org Details) or a shop (its
   * managers). One open enquiry per org or shop (409 while one is open).
   * Site admins get an in-app notification; a test org or shop notifies
   * nobody.
   *
   * @summary Enquire about a branded storefront
   */
  @Post("")
  @Security("loggedin")
  public async createStorefrontEnquiry(
    @Body() body: CreateStorefrontEnquiryRequest,
    @Request() request?: ExpressRequest,
  ): Promise<StorefrontEnquiryResponse> {
    if (request) this.request = request
    const target = await this.authorizedTarget(body?.target_type, body?.target_id)

    if (body.contact_method !== "discord" && body.contact_method !== "site_message") {
      this.throwValidationError("contact_method must be discord or site_message", [
        { field: "contact_method", message: "Must be discord or site_message" },
      ])
    }
    const message = (body.message ?? "").trim()
    if (message.length > ENQUIRY_MESSAGE_MAX) {
      this.throwValidationError(`The message can be at most ${ENQUIRY_MESSAGE_MAX} characters`, [
        { field: "message", message: `At most ${ENQUIRY_MESSAGE_MAX} characters` },
      ])
    }
    const sub = checkSubdomain(String(body.requested_subdomain ?? ""))
    if (!sub.ok) {
      this.throwValidationError(sub.reason, [{ field: "requested_subdomain", message: sub.reason }])
    }
    if (await subdomainTaken(sub.subdomain)) {
      this.throwValidationError("That subdomain is already in use", [
        { field: "requested_subdomain", message: "Already in use" },
      ])
    }
    if (body.contact_method === "discord") {
      const linked = await getKnex()("account_providers")
        .where({ user_id: this.getUserId(), provider_type: "discord" })
        .first("provider_id")
      if (!linked) {
        this.throwValidationError("Link a Discord account to your profile first, or choose a message on SC Market", [
          { field: "contact_method", message: "No Discord account linked" },
        ])
      }
    }

    let enquiry: StorefrontEnquiry
    try {
      enquiry = await createEnquiry(
        target,
        { requested_subdomain: sub.subdomain, message, contact_method: body.contact_method },
        this.getUserId(),
      )
    } catch (err) {
      if (err instanceof OpenEnquiryExistsError) {
        this.throwConflict("This storefront already has an open enquiry", {
          enquiry_id: err.existing?.enquiry_id ?? null,
        })
      }
      throw err
    }
    await notifyAdminsOfEnquiry(enquiry, target, this.getUserId())
    this.setHeader("Cache-Control", "no-store")
    return { enquiry }
  }

  /**
   * The latest branded storefront enquiry for an org or a shop, with its
   * status, for those who may enquire for it.
   *
   * @summary Get an org's or shop's storefront enquiry
   */
  @Get("")
  @Security("loggedin")
  public async getStorefrontEnquiry(
    @Query() target_type: EnquiryTargetType,
    @Query() target_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<StorefrontEnquiryResponse> {
    if (request) this.request = request
    const target = await this.authorizedTarget(target_type, target_id)
    this.setHeader("Cache-Control", "private, no-store")
    return { enquiry: await latestEnquiry(target) }
  }
}
