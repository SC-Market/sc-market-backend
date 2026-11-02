/**
 * Org storefronts (drafts/whitelabel-overhaul-plan.md): an org's public
 * storefront (its home page, embeds, the Storefronts hub) and the branded
 * storefront unlock status shown in the org's settings.
 */
import { Body, Get, Path, Put, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { has_permission, is_member } from "../../v1/util/permissions.js"
import { canViewTestEntity } from "../../../../services/test-accounts/isolation.js"
import { clampPagination } from "../util/pagination.js"
import {
  listStorefrontCards,
  loadOrgStorefront,
  STOREFRONTS_DEFAULT_PAGE_SIZE,
  STOREFRONTS_MAX_PAGE_SIZE,
  type OrgStorefront,
  type StorefrontCard,
} from "../../../../services/storefront/storefront.js"
import {
  getOrgBrandingStatus,
  type OrgBrandingStatus,
} from "../../../../services/storefront/branding.js"
import {
  buildChecklist,
  loadOnboardingInputs,
  type OnboardingChecklist,
} from "../../../../services/storefront/onboarding.js"
import {
  getOrgDirectoryStatus,
  setDirectoryShown,
  type StorefrontDirectoryStatus,
} from "../../../../services/storefront/directory.js"

export interface StorefrontsResponse {
  /** This page: showcase orgs first, stale orgs last, then by completed orders. */
  storefronts: StorefrontCard[]
  /** Every listed org (with `field`: every one with that field). */
  total: number
  page: number
  page_size: number
  /** Focus chips: the most common fields among all listed orgs, most common first (at most 10). */
  fields: string[]
}

export interface OrgStorefrontStatusResponse {
  spectrum_id: string
  /** Whether branding is unlocked, why, and what is still missing. */
  branding: OrgBrandingStatus
  /** The storefront onboarding checklist: verify, shop, listing, Discord, members, branding. */
  onboarding: OnboardingChecklist
  /** Whether the org is listed in the public storefront directory, and why. */
  directory: StorefrontDirectoryStatus
}

export interface StorefrontDirectoryRequest {
  /** "Show in the public storefront directory". */
  show_in_directory: boolean
}

interface StorefrontOrgRow {
  contractor_id: string
  spectrum_id: string
  name: string
  avatar: string | null
  banner: string | null
  archived: boolean
  is_test: boolean | null
}

@Route("contractors")
@Tags("Contractors")
export class OrgStorefrontV2Controller extends BaseController {
  /** The org by spectrum ID, 404 when it doesn't exist or is archived. */
  protected async storefrontOrg(spectrum_id: string): Promise<StorefrontOrgRow> {
    const org = await getKnex()("contractors")
      .where({ spectrum_id })
      .first<StorefrontOrgRow | undefined>(
        "contractor_id",
        "spectrum_id",
        "name",
        "avatar",
        "banner",
        "archived",
        "is_test",
      )
    if (!org || org.archived) this.throwNotFound("Contractor", spectrum_id)
    return org
  }

  /**
   * The Storefronts hub: RSI-verified orgs with at least one public, active
   * listing or active service (service-only orgs included), showcase orgs
   * first, then by completed orders, a page at a time (the order ends on a
   * unique key, so pages never overlap). Read-only and anonymous (rate
   * limited in api-router.ts); the frontend prerenders page 1 at build time.
   *
   * @summary List org storefronts
   * @param page Page number, from 1.
   * @param page_size Cards per page (default 24, at most 60).
   * @param field Only orgs with this field (one of `fields`).
   */
  @Get("storefronts")
  public async getStorefronts(
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() field?: string,
  ): Promise<StorefrontsResponse> {
    const pagination = clampPagination(page, page_size, {
      defaultPageSize: STOREFRONTS_DEFAULT_PAGE_SIZE,
      maxPageSize: STOREFRONTS_MAX_PAGE_SIZE,
    })
    const onlyField = field?.trim() || undefined
    this.setHeader("Cache-Control", "public, max-age=300")
    const result = await listStorefrontCards({
      limit: pagination.page_size,
      offset: pagination.offset,
      field: onlyField,
    })
    return { ...result, page: pagination.page, page_size: pagination.page_size }
  }

  /**
   * An org's public storefront: trust stats rolled up from its shops
   * (completed orders, reviews, response time, members, active listings and
   * services), its shops, up to 6 services, whether it is RSI-verified, and
   * its SC Orgs recruiting card when SC Orgs has the org (a cached lookup
   * that fails open: no card). Read-only and anonymous (rate limited in
   * api-router.ts); its featured
   * listings are `GET /listings/search?org=<spectrum_id>`.
   *
   * @summary Get an org's storefront
   */
  @Get("{spectrum_id}/storefront")
  public async getOrgStorefront(
    @Path() spectrum_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<OrgStorefront> {
    if (request) this.request = request
    const org = await this.storefrontOrg(spectrum_id)
    if (org.is_test && !canViewTestEntity(request?.user)) {
      this.throwNotFound("Contractor", spectrum_id)
    }
    this.setHeader(
      "Cache-Control",
      org.is_test ? "private, no-store" : "public, max-age=60",
    )
    return loadOrgStorefront(org)
  }

  /**
   * The org's branded storefront status, for its members: whether branding
   * (theme, logo and title on its subdomain, site and sidebar settings) is
   * unlocked, by a staff grant or by the criteria (RSI-verified, 3+ members
   * on SC Market, a listing or an order in the last 30 days), and which
   * criteria are still missing; and the onboarding checklist (verify, open
   * a shop, first listing, connect Discord, members, branding).
   *
   * @summary Get an org's storefront status (members)
   */
  @Get("{spectrum_id}/storefront/status")
  @Security("loggedin")
  public async getOrgStorefrontStatus(
    @Path() spectrum_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<OrgStorefrontStatusResponse> {
    if (request) this.request = request
    const org = await this.storefrontOrg(spectrum_id)
    if (!this.isAdmin() && !(await is_member(org.contractor_id, this.getUserId()))) {
      this.throwForbidden("Only the org's members can see its storefront status")
    }
    const [branding, onboarding, directory] = await Promise.all([
      getOrgBrandingStatus(org),
      loadOnboardingInputs(org.contractor_id),
      getOrgDirectoryStatus(org),
    ])
    this.setHeader("Cache-Control", "private, no-store")
    return {
      spectrum_id: org.spectrum_id,
      branding,
      onboarding: buildChecklist(branding, onboarding),
      directory,
    }
  }

  /**
   * Turn "Show in the public storefront directory" (the Storefronts hub and
   * the homepage row) on or off for the org. Needs Manage Org Details. A
   * members-only org (white-label site Internal with Require membership) is
   * never listed, so it can't be turned on (400). Listed also needs a public,
   * active listing in one of its shown shops.
   *
   * @summary Set whether an org is in the storefront directory
   */
  @Put("{spectrum_id}/storefront/directory")
  @Security("loggedin")
  public async setOrgStorefrontDirectory(
    @Path() spectrum_id: string,
    @Body() body: StorefrontDirectoryRequest,
    @Request() request?: ExpressRequest,
  ): Promise<StorefrontDirectoryStatus> {
    if (request) this.request = request
    const org = await this.storefrontOrg(spectrum_id)
    await this.requireTokenOrgAccess(org.contractor_id)
    if (!(await has_permission(org.contractor_id, this.getUserId(), "manage_org_details"))) {
      this.throwForbidden("Manage Org Details is needed to change the storefront directory setting")
    }
    if (typeof body?.show_in_directory !== "boolean") {
      this.throwValidationError("show_in_directory must be true or false", [
        { field: "show_in_directory", message: "Must be true or false" },
      ])
    }
    const current = await getOrgDirectoryStatus(org)
    if (body.show_in_directory && !current.can_change) {
      this.throwValidationError("Members-only storefronts aren't listed in the public directory", [
        { field: "show_in_directory", message: "Members-only storefronts aren't listed" },
      ])
    }
    await setDirectoryShown({ contractor_id: org.contractor_id }, body.show_in_directory, this.getUserId())
    this.setHeader("Cache-Control", "private, no-store")
    return getOrgDirectoryStatus(org)
  }
}
