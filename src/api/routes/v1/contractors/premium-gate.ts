import type { NextFunction, Request, Response } from "express"
import { getKnex } from "../../../../clients/database/knex-db.js"
import type { DBOrgPremiumTier } from "../../../../clients/database/db-models.js"
import {
  createErrorResponse,
  createForbiddenErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { getOrgBrandingStatus } from "../../../../services/storefront/branding.js"

/** The org's active (not revoked) premium tier row, if any. */
export async function getActivePremium(
  contractorId: string,
): Promise<DBOrgPremiumTier | null> {
  const row = await getKnex()<DBOrgPremiumTier>("org_premium_tiers")
    .where({ contractor_id: contractorId })
    .whereNull("revoked_at")
    .first()
  return row ?? null
}

export function hasWhiteLabelTier(
  premium: Pick<DBOrgPremiumTier, "tier"> | null,
): boolean {
  return !!premium && premium.tier === "white_label"
}

/**
 * Express middleware for white-label write endpoints (theme, site settings,
 * sidebar): 403 unless req.contractor has an active white_label tier. Mount
 * it after valid_contractor/org_permission, which set req.contractor.
 */
export function whiteLabelTierGuard(
  lookup: (contractorId: string) => Promise<Pick<DBOrgPremiumTier, "tier"> | null> = getActivePremium,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const premium = await lookup(req.contractor!.contractor_id)
      if (!hasWhiteLabelTier(premium)) {
        res
          .status(403)
          .json(createForbiddenErrorResponse("Organization does not have white_label premium tier"))
        return
      }
      next()
    } catch {
      res
        .status(500)
        .json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to check premium tier"))
    }
  }
}

export const requireWhiteLabelTier = whiteLabelTierGuard()

type GuardedOrg = { contractor_id: string; spectrum_id: string; is_test?: boolean | null }

/**
 * Express middleware for the branding write endpoints (theme, site settings,
 * sidebar): 403 unless req.contractor's branding is unlocked, by a staff
 * grant or by the unlock criteria (services/storefront/branding.ts). Mount
 * it after valid_contractor/org_permission, which set req.contractor.
 */
export function brandingGuard(
  isUnlocked: (org: GuardedOrg) => Promise<boolean> = async (org) =>
    (await getOrgBrandingStatus(org)).unlocked,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await isUnlocked(req.contractor as GuardedOrg))) {
        res
          .status(403)
          .json(createForbiddenErrorResponse("Branding is not unlocked for this organization"))
        return
      }
      next()
    } catch {
      res
        .status(500)
        .json(createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to check branding"))
    }
  }
}

export const requireBrandingUnlocked = brandingGuard()
