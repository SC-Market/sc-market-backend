/**
 * Branded storefront unlock (owner decision 2026-11-01, drafts/whitelabel-
 * overhaul-plan.md §A10): storefronts are free for every org, and branding
 * (theme, logo and title on the org's <sid>.sc-market.space subdomain, the
 * site and sidebar settings) unlocks by itself for an org that is
 *
 * - RSI-verified: registered on SC Market through RSI (its spectrum ID is
 *   the RSI one, not a "~" custom identifier). Test orgs never are.
 * - 3 or more members on SC Market.
 * - active: at least 1 listing or 1 order in the last 30 days.
 *
 * A staff grant (an active white_label row in org_premium_tiers, set in
 * Admin › Premium) also unlocks it, whatever the criteria say; staff still
 * provision the subdomain itself.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"

export const BRANDING_MIN_MEMBERS = 3
export const BRANDING_ACTIVITY_DAYS = 30

export type BrandingCriterionKey = "rsi_verified" | "members" | "activity"

export interface BrandingMembersCriterion {
  met: boolean
  /** Members of the org on SC Market. */
  count: number
  required: number
}

export interface BrandingActivityCriterion {
  met: boolean
  /** The org's listings created or updated in the window. */
  recent_listings: number
  /** Orders placed with the org (or its shops) in the window. */
  recent_orders: number
  window_days: number
}

export interface BrandingCriteria {
  /** Registered through RSI (not a "~" custom org, not a test org). */
  rsi_verified: boolean
  members: BrandingMembersCriterion
  activity: BrandingActivityCriterion
}

export interface OrgBrandingStatus {
  /** Branding can be used (theme, logo, title, site and sidebar settings). */
  unlocked: boolean
  /** Why it is unlocked: a staff grant or the criteria; null while locked. */
  source: "grant" | "criteria" | null
  /** The unlock criteria are met (independently of a staff grant). */
  eligible: boolean
  criteria: BrandingCriteria
  /** Criteria not met yet, in display order. Empty when eligible. */
  missing: BrandingCriterionKey[]
  /** One English sentence saying why (for logs, support and the API docs). */
  reason: string
  /** The org's subdomain, when staff have provisioned one. */
  custom_domain: string | null
}

/** Whether an org's spectrum ID is RSI-verified (see the file comment). */
export function isRsiVerifiedOrg(org: {
  spectrum_id: string
  is_test?: boolean | null
}): boolean {
  return !org.is_test && !!org.spectrum_id && !org.spectrum_id.startsWith("~")
}

export interface BrandingInputs {
  spectrum_id: string
  is_test?: boolean | null
  member_count: number
  recent_listings: number
  recent_orders: number
  /** An active white_label grant. */
  granted: boolean
  custom_domain: string | null
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The unlock decision from its inputs (pure). */
export function evaluateBranding(input: BrandingInputs): OrgBrandingStatus {
  const criteria: BrandingCriteria = {
    rsi_verified: isRsiVerifiedOrg(input),
    members: {
      met: input.member_count >= BRANDING_MIN_MEMBERS,
      count: input.member_count,
      required: BRANDING_MIN_MEMBERS,
    },
    activity: {
      met: input.recent_listings > 0 || input.recent_orders > 0,
      recent_listings: input.recent_listings,
      recent_orders: input.recent_orders,
      window_days: BRANDING_ACTIVITY_DAYS,
    },
  }
  const missing: BrandingCriterionKey[] = []
  if (!criteria.rsi_verified) missing.push("rsi_verified")
  if (!criteria.members.met) missing.push("members")
  if (!criteria.activity.met) missing.push("activity")
  const eligible = missing.length === 0

  const needs: string[] = []
  if (!criteria.rsi_verified) needs.push("RSI verification")
  if (!criteria.members.met) {
    const more = BRANDING_MIN_MEMBERS - input.member_count
    needs.push(`${plural(more, "more member", "more members")} on SC Market`)
  }
  if (!criteria.activity.met) {
    needs.push(`a listing or an order in the last ${BRANDING_ACTIVITY_DAYS} days`)
  }

  let reason: string
  if (input.granted) reason = "Unlocked by a staff grant."
  else if (eligible) {
    reason = `Unlocked: RSI-verified, ${plural(input.member_count, "member", "members")}, active in the last ${BRANDING_ACTIVITY_DAYS} days.`
  } else reason = `Locked: needs ${needs.join("; ")}.`

  return {
    unlocked: input.granted || eligible,
    source: input.granted ? "grant" : eligible ? "criteria" : null,
    eligible,
    criteria,
    missing,
    reason,
    custom_domain: input.custom_domain,
  }
}

export interface BrandingOrg {
  contractor_id: string
  spectrum_id: string
  is_test?: boolean | null
}

/** Count rows, Postgres `count` comes back as a string. */
function toCount(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Read the inputs for one org: members, the last 30 days' listings and
 * orders (through its shops, and the org's own pre-shop rows), its grant.
 */
export async function loadBrandingInputs(
  org: BrandingOrg,
  db: Knex = getKnex(),
): Promise<BrandingInputs> {
  const since = db.raw(`now() - interval '${BRANDING_ACTIVITY_DAYS} days'`)
  const orgShops = db("shops")
    .select("shop_id")
    .where("owner_contractor_id", org.contractor_id)

  const [members, listings, orders, grant] = await Promise.all([
    db("contractor_members")
      .where("contractor_id", org.contractor_id)
      .count("* as count")
      .first(),
    db("listings")
      .where((q) =>
        q
          .whereIn("shop_id", orgShops.clone())
          .orWhere((q2) =>
            q2
              .where("seller_type", "contractor")
              .where("seller_id", org.contractor_id),
          ),
      )
      .where((q) =>
        q.where("created_at", ">=", since).orWhere("updated_at", ">=", since),
      )
      .count("* as count")
      .first(),
    db("orders")
      .where((q) =>
        q
          .where("contractor_id", org.contractor_id)
          .orWhereIn("shop_id", orgShops.clone()),
      )
      .where("timestamp", ">=", since)
      .count("* as count")
      .first(),
    db("org_premium_tiers")
      .where("contractor_id", org.contractor_id)
      .whereNull("revoked_at")
      .first("tier", "custom_domain"),
  ])

  return {
    spectrum_id: org.spectrum_id,
    is_test: org.is_test,
    member_count: toCount(members?.count),
    recent_listings: toCount(listings?.count),
    recent_orders: toCount(orders?.count),
    granted: grant?.tier === "white_label",
    custom_domain: grant?.custom_domain ?? null,
  }
}

/** The org's branding status (unlock decision and why). */
export async function getOrgBrandingStatus(
  org: BrandingOrg,
  db: Knex = getKnex(),
): Promise<OrgBrandingStatus> {
  return evaluateBranding(await loadBrandingInputs(org, db))
}
