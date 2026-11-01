/**
 * Org storefronts (drafts/whitelabel-overhaul-plan.md): the branded
 * storefront unlock status shown in the org's settings.
 */
import { Get, Path, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { is_member } from "../../v1/util/permissions.js"
import {
  getOrgBrandingStatus,
  type OrgBrandingStatus,
} from "../../../../services/storefront/branding.js"

export interface OrgStorefrontStatusResponse {
  spectrum_id: string
  /** Whether branding is unlocked, why, and what is still missing. */
  branding: OrgBrandingStatus
}

interface StorefrontOrgRow {
  contractor_id: string
  spectrum_id: string
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
        "archived",
        "is_test",
      )
    if (!org || org.archived) this.throwNotFound("Contractor", spectrum_id)
    return org
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
