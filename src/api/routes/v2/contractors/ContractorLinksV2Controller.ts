/**
 * Sister-site links of an org's public page: its SC Orgs community page,
 * when SC Orgs has the same RSI spectrum ID. Public, no auth; the lookup is
 * cached and fails open (no link), see clients/sc-orgs/sc-orgs.ts.
 */
import { Get, Path, Request, Route, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { canViewTestEntity } from "../../../../services/test-accounts/isolation.js"
import { scOrgsClient } from "../../../../clients/sc-orgs/sc-orgs.js"

export interface ContractorSisterLinksResponse {
  /** The org's SC Orgs community page (https://sc-orgs.space/communities/<SID>), or null. */
  sc_orgs_url: string | null
}

@Route("contractors")
@Tags("Contractors")
export class ContractorLinksV2Controller extends BaseController {
  /**
   * Sister-site links of an org (by spectrum ID): its SC Orgs community
   * page, if SC Orgs has the same org. A failed lookup is just no link.
   *
   * @summary Get an org's sister-site links
   */
  @Get("{spectrum_id}/links")
  public async getContractorSisterLinks(
    @Path() spectrum_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<ContractorSisterLinksResponse> {
    if (request) this.request = request
    const contractor = await getKnex()("contractors")
      .where({ spectrum_id })
      .first("spectrum_id", "archived", "is_test")
    if (
      !contractor ||
      contractor.archived ||
      (contractor.is_test && !canViewTestEntity(request?.user))
    )
      this.throwNotFound("Contractor", spectrum_id)
    // Test orgs never link out: SC Orgs can't have them.
    if (contractor.is_test) return { sc_orgs_url: null }
    return {
      sc_orgs_url: await scOrgsClient.communityUrl(contractor.spectrum_id),
    }
  }
}
