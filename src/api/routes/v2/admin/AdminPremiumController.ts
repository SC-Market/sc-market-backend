/**
 * Admin › Premium: org premium tiers (white label) and their custom domains.
 * Orgs are addressed by Spectrum ID; contractor_id never leaves the server.
 * Moved from v1 /api/admin/premium (same validation and audit records).
 * Site admins only (tsoa-auth admin gate + requireAdmin); grants, domain
 * changes and revocations need an MFA step-up. Rate limits are registered in
 * api-router.ts.
 */
import {
  Body,
  Delete,
  Get,
  Patch,
  Path,
  Put,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import { involvesTestParty } from "../../../../services/test-accounts/isolation.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"
import {
  invalidateCustomDomainCache,
  normalizeCustomDomain,
} from "../../../util/allowed-origins.js"

export type PremiumTierName = "white_label"

const VALID_TIERS: readonly PremiumTierName[] = ["white_label"]

export interface OrgPremiumTier {
  id: string
  spectrum_id: string
  contractor_name: string
  tier: PremiumTierName
  custom_domain: string | null
  /** user_id of the admin who granted it. */
  granted_by: string
  granted_at: string
  revoked_at: string | null
}

export interface OrgPremiumTierPage {
  items: OrgPremiumTier[]
  total: number
  page: number
  page_size: number
}

export interface SetOrgPremiumRequest {
  tier: PremiumTierName
  /** Omit to keep the current domain; null or "" clears it. */
  custom_domain?: string | null
}

export interface SetOrgPremiumDomainRequest {
  /** null or "" clears it. */
  custom_domain?: string | null
}

export interface RevokeOrgPremiumResponse {
  message: string
}

interface PremiumRow {
  id: string
  tier: PremiumTierName
  custom_domain: string | null
  granted_by: string
  granted_at: Date
  revoked_at: Date | null
  contractor_name: string
  spectrum_id: string
}

const PREMIUM_COLUMNS = [
  "org_premium_tiers.id",
  "org_premium_tiers.tier",
  "org_premium_tiers.custom_domain",
  "org_premium_tiers.granted_by",
  "org_premium_tiers.granted_at",
  "org_premium_tiers.revoked_at",
  "contractors.name as contractor_name",
  "contractors.spectrum_id",
]

function toApi(row: PremiumRow): OrgPremiumTier {
  return {
    id: row.id,
    spectrum_id: row.spectrum_id,
    contractor_name: row.contractor_name,
    tier: row.tier,
    custom_domain: row.custom_domain,
    granted_by: row.granted_by,
    granted_at:
      row.granted_at instanceof Date
        ? row.granted_at.toISOString()
        : String(row.granted_at),
    revoked_at:
      row.revoked_at instanceof Date
        ? row.revoked_at.toISOString()
        : row.revoked_at === null
          ? null
          : String(row.revoked_at),
  }
}

function premiumQuery() {
  return getKnex()("org_premium_tiers").join(
    "contractors",
    "contractors.contractor_id",
    "org_premium_tiers.contractor_id",
  )
}

function isDomainTaken(err: unknown): boolean {
  return (
    (err as { constraint?: string } | null)?.constraint ===
    "org_premium_tiers_custom_domain_key"
  )
}

@Route("admin/premium")
@Tags("Admin")
export class AdminPremiumController extends BaseController {
  /**
   * Every org premium tier, newest grant first (revoked ones included).
   * @summary List org premium tiers
   * @param page 1-based page
   * @param page_size 1–100, default 20
   */
  @Get("")
  @Security("loggedin")
  public async listOrgPremiumTiers(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<OrgPremiumTierPage> {
    this.request = request
    this.requireAdmin()
    const p = Math.max(1, Math.floor(Number(page)) || 1)
    const size = Math.min(100, Math.max(1, Math.floor(Number(page_size)) || 20))
    const [rows, countRow] = await Promise.all([
      premiumQuery()
        .select(PREMIUM_COLUMNS)
        .orderBy("org_premium_tiers.granted_at", "desc")
        .limit(size)
        .offset((p - 1) * size),
      getKnex()("org_premium_tiers").count("* as count").first(),
    ])
    return {
      items: (rows as PremiumRow[]).map(toApi),
      total: Number(countRow?.count ?? 0),
      page: p,
      page_size: size,
    }
  }

  /**
   * @summary Get an org's premium tier
   */
  @Get("{spectrum_id}")
  @Security("loggedin")
  public async getOrgPremiumTier(
    @Request() request: ExpressRequest,
    @Path() spectrum_id: string,
  ): Promise<OrgPremiumTier> {
    this.request = request
    this.requireAdmin()
    const contractorId = await this.contractorIdFor(spectrum_id)
    const row = await this.premiumRow(contractorId)
    if (!row) this.throwNotFound("Premium tier", spectrum_id)
    return toApi(row)
  }

  /**
   * Grant or update an org's premium tier (re-grants a revoked one). Test
   * orgs can't have one. Needs an MFA step-up.
   * @summary Set an org's premium tier
   */
  @Put("{spectrum_id}")
  @Security("loggedin")
  public async setOrgPremiumTier(
    @Request() request: ExpressRequest,
    @Path() spectrum_id: string,
    @Body() body: SetOrgPremiumRequest,
  ): Promise<OrgPremiumTier> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    const { tier, custom_domain } = body
    if (!VALID_TIERS.includes(tier)) {
      this.throwValidationError(
        `Invalid tier. Must be one of: ${VALID_TIERS.join(", ")}`,
        [{ field: "tier", message: "Unknown tier" }],
      )
    }
    const domain = this.normalizedDomain(custom_domain)
    const contractorId = await this.contractorIdFor(spectrum_id)
    await this.refuseTestOrg(contractorId)

    const knex = getKnex()
    const update: Record<string, unknown> = {
      tier,
      granted_by: this.getUserId(),
      granted_at: new Date(),
      revoked_at: null,
    }
    if (custom_domain !== undefined) update.custom_domain = domain || null
    try {
      const existing = await knex("org_premium_tiers")
        .where({ contractor_id: contractorId })
        .first()
      if (existing) {
        await knex("org_premium_tiers")
          .where({ contractor_id: contractorId })
          .update(update)
      } else {
        await knex("org_premium_tiers").insert({
          contractor_id: contractorId,
          ...update,
        })
      }
    } catch (err) {
      if (isDomainTaken(err))
        this.throwConflict("Domain is already in use by another organization")
      throw err
    }

    const row = await this.premiumRow(contractorId)
    await auditLogService.record({
      action: "premium_tier_granted",
      actorId: this.getUserId(),
      subjectType: "contractor",
      subjectId: contractorId,
      metadata: { tier, custom_domain: domain ?? null },
    })
    invalidateCustomDomainCache()
    if (!row) this.throwNotFound("Premium tier", spectrum_id)
    return toApi(row)
  }

  /**
   * Change only the custom domain of an org's active premium tier. Needs an
   * MFA step-up.
   * @summary Set an org's custom domain
   */
  @Patch("{spectrum_id}/domain")
  @Security("loggedin")
  public async setOrgPremiumDomain(
    @Request() request: ExpressRequest,
    @Path() spectrum_id: string,
    @Body() body: SetOrgPremiumDomainRequest,
  ): Promise<OrgPremiumTier> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    const domain = this.normalizedDomain(body.custom_domain)
    const contractorId = await this.contractorIdFor(spectrum_id)
    await this.refuseTestOrg(contractorId)

    let updated: number
    try {
      updated = await getKnex()("org_premium_tiers")
        .where({ contractor_id: contractorId })
        .whereNull("revoked_at")
        .update({ custom_domain: domain || null })
    } catch (err) {
      if (isDomainTaken(err))
        this.throwConflict("Domain is already in use by another organization")
      throw err
    }
    if (!updated) this.throwNotFound("Active premium tier", spectrum_id)

    const row = await this.premiumRow(contractorId)
    await auditLogService.record({
      action: "premium_domain_updated",
      actorId: this.getUserId(),
      subjectType: "contractor",
      subjectId: contractorId,
      metadata: { custom_domain: domain ?? null },
    })
    invalidateCustomDomainCache()
    if (!row) this.throwNotFound("Premium tier", spectrum_id)
    return toApi(row)
  }

  /**
   * Revoke an org's premium tier. Its custom domain is cleared too, so a
   * later re-grant can't bring an old domain back into CORS. Needs an MFA
   * step-up.
   * @summary Revoke an org's premium tier
   */
  @Delete("{spectrum_id}")
  @Security("loggedin")
  public async revokeOrgPremiumTier(
    @Request() request: ExpressRequest,
    @Path() spectrum_id: string,
  ): Promise<RevokeOrgPremiumResponse> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    const contractorId = await this.contractorIdFor(spectrum_id)
    const updated = await getKnex()("org_premium_tiers")
      .where({ contractor_id: contractorId })
      .whereNull("revoked_at")
      .update({ revoked_at: new Date(), custom_domain: null })
    if (!updated) this.throwNotFound("Active premium tier", spectrum_id)
    await auditLogService.record({
      action: "premium_tier_revoked",
      actorId: this.getUserId(),
      subjectType: "contractor",
      subjectId: contractorId,
    })
    invalidateCustomDomainCache()
    return { message: "Premium tier revoked" }
  }

  private async contractorIdFor(spectrumId: string): Promise<string> {
    const row: { contractor_id: string } | undefined = await getKnex()(
      "contractors",
    )
      .where({ spectrum_id: spectrumId })
      .first("contractor_id")
    if (!row) this.throwNotFound("Contractor", spectrumId)
    return row.contractor_id
  }

  private async premiumRow(
    contractorId: string,
  ): Promise<PremiumRow | undefined> {
    return premiumQuery()
      .where("org_premium_tiers.contractor_id", contractorId)
      .first(PREMIUM_COLUMNS)
  }

  /** Test orgs never get premium features or a custom domain. */
  private async refuseTestOrg(contractorId: string): Promise<void> {
    if (await involvesTestParty({ contractors: [contractorId] })) {
      this.throwBusinessError(
        ErrorCode.FORBIDDEN,
        "Test orgs cannot have premium features or custom domains",
      )
    }
  }

  /** undefined: leave as is; null/"": clear; otherwise the normalized domain. */
  private normalizedDomain(
    custom_domain: string | null | undefined,
  ): string | null | undefined {
    if (!custom_domain) return custom_domain
    const checked = normalizeCustomDomain(custom_domain)
    if (!checked.ok) {
      this.throwValidationError(checked.reason, [
        { field: "custom_domain", message: checked.reason },
      ])
    }
    return checked.domain
  }
}
