/**
 * The org storefront onboarding checklist (drafts/whitelabel-overhaul-plan.md
 * §A4.4; target: the first listing within 15 minutes of verifying). Each
 * step is done or not, from the org's own data; the settings UI links each
 * open step to where it is done.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import type { OrgBrandingStatus } from "./branding.js"

export type OnboardingStepKey =
  | "verify"
  | "shop"
  | "listing"
  | "discord"
  | "members"
  | "branding"

export interface OnboardingStep {
  key: OnboardingStepKey
  done: boolean
}

export interface OnboardingChecklist {
  steps: OnboardingStep[]
  done_count: number
  total: number
  /** The org's main (oldest active) shop, for the steps' links; null without one. */
  shop_slug: string | null
}

export interface OnboardingInputs {
  shop_slug: string | null
  active_listings: number
  discord_connected: boolean
}

/** The checklist from its inputs and the branding status (pure). */
export function buildChecklist(
  branding: OrgBrandingStatus,
  input: OnboardingInputs,
): OnboardingChecklist {
  const steps: OnboardingStep[] = [
    { key: "verify", done: branding.criteria.rsi_verified },
    { key: "shop", done: input.shop_slug !== null },
    { key: "listing", done: input.active_listings > 0 },
    { key: "discord", done: input.discord_connected },
    { key: "members", done: branding.criteria.members.met },
    { key: "branding", done: branding.unlocked },
  ]
  return {
    steps,
    done_count: steps.filter((s) => s.done).length,
    total: steps.length,
    shop_slug: input.shop_slug,
  }
}

export async function loadOnboardingInputs(
  contractorId: string,
  db: Knex = getKnex(),
): Promise<OnboardingInputs> {
  const shops = db("shops")
    .select("shop_id")
    .where("owner_contractor_id", contractorId)
    .where("status", "active")
  const [shop, listings, discord] = await Promise.all([
    db("shops")
      .where("owner_contractor_id", contractorId)
      .where("status", "active")
      .orderBy("created_at", "asc")
      .first("slug"),
    db("listing_search")
      .whereIn("shop_id", shops.clone())
      .where("status", "active")
      .count("* as count")
      .first(),
    db("discord_channel_setups")
      .where((q) =>
        q
          .where((q2) => q2.where("owner_type", "org").where("owner_id", contractorId))
          .orWhere((q2) => q2.where("owner_type", "shop").whereIn("owner_id", shops.clone())),
      )
      .first("id"),
  ])
  const count = Number(listings?.count ?? 0)
  return {
    shop_slug: (shop?.slug as string | undefined) ?? null,
    active_listings: Number.isFinite(count) ? count : 0,
    discord_connected: !!discord,
  }
}
