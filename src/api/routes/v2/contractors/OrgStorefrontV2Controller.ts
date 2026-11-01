/**
 * Org storefronts (drafts/whitelabel-overhaul-plan.md): an org's public
 * storefront (its home page, embeds, the Storefronts hub) and the branded
 * storefront unlock status shown in the org's settings.
 */
import { Get, Middlewares, Path, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { is_member } from "../../v1/util/permissions.js"
import { tsoaReadRateLimit } from "../../../middleware/tsoa-ratelimit.js"
import { canViewTestEntity } from "../../../../services/test-accounts/isolation.js"
import {
  listStorefrontCards,
  loadOrgStorefront,
  type OrgStorefront,
  type StorefrontCard,
} from "../../../../services/storefront/storefront.js"
import {
  getOrgBrandingStatus,
  type OrgBrandingStatus,
} from "../../../../services/storefront/branding.js"

export interface StorefrontsResponse {
  /** Showcase orgs first, then by completed orders. At most 60. */
  storefronts: StorefrontCard[]
}

export interface OrgStorefrontStatusResponse {
  spectrum_id: string
  /** Whether branding is unlocked, why, and what is still missing. */
  branding: OrgBrandingStatus
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
   * listing, showcase orgs first, then by completed orders. Read-only and
   * anonymous; the frontend prerenders it at build time.
   *
   * @summary List org storefronts
   */
  @Get("storefronts")
  @Middlewares(tsoaReadRateLimit)
  public async getStorefronts(): Promise<StorefrontsResponse> {
    this.setHeader("Cache-Control", "public, max-age=300")
    return { storefronts: await listStorefrontCards() }
  }

  /**
   * An org's public storefront: trust stats rolled up from its shops
   * (completed orders, reviews, response time, members, active listings and
   * services), its shops, up to 6 services, whether it is RSI-verified, and
   * its SC Orgs recruiting card when SC Orgs has the org (a cached lookup
   * that fails open: no card). Read-only and anonymous; its featured
   * listings are `GET /listings/search?org=<spectrum_id>`.
   *
   * @summary Get an org's storefront
   */
  @Get("{spectrum_id}/storefront")
  @Middlewares(tsoaReadRateLimit)
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
   * criteria are still missing.
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
    return {
      spectrum_id: org.spectrum_id,
      branding: await getOrgBrandingStatus(org),
    }
  }
}
