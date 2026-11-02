/**
 * The public storefront directory (the /storefronts hub and the homepage
 * "Org storefronts" row): which orgs it lists, and the "Show in the public
 * storefront directory" setting orgs and shops have (owner direction
 * 2026-11-01, drafts/whitelabel-overhaul-plan.md §A11).
 *
 * An org is listed when all of these hold:
 * - it is RSI-verified (never a "~" or test org) and not archived;
 * - its owners left "Show in the directory" on (the default);
 * - it isn't members-only: its white-label site is Internal with Require
 *   membership (MEDRUNNER sells only to its members). Such an org can still
 *   have a branded subdomain, where members-only applies; it just isn't
 *   advertised publicly with an empty storefront;
 * - it has public content in a shop that is itself shown: at least one
 *   public, active listing (members-only listings don't count) or active
 *   service. Owner decision (2026-11-01): service-only orgs are listed too,
 *   tagged "Services" on the hub. The showcase orgs follow the same rule
 *   (they are only sorted first).
 *
 * A shop's own setting decides whether that shop counts towards its org's
 * directory entry (its listings, services and stats). Personal shops aren't
 * in the directory (it lists orgs), so they have no setting (owner decision
 * 2026-11-01): it reads off and can't be changed.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { effectiveRequireMembership } from "../../api/routes/v1/contractors/whitelabel-rules.js"
import { isRsiVerifiedOrg } from "./branding.js"

export type DirectoryReason =
  /** Listed in the directory. */
  | "listed"
  /** The owners turned "Show in the directory" off. */
  | "hidden_by_setting"
  /** Members-only (white-label site Internal + Require membership): never listed. */
  | "members_only"
  /** No public, active listing (members-only listings don't count) and no active service. */
  | "no_public_content"
  /** Orgs only: not RSI-verified (a "~" custom or test org). */
  | "not_verified"
  /** Shops only: a personal shop; the directory lists orgs (no setting). */
  | "personal_shop"
  /** Shops only: its org isn't listed (see org_reason). */
  | "org_not_listed"

export interface StorefrontDirectoryStatus {
  /** The setting: "Show in the public storefront directory". Default true. */
  show_in_directory: boolean
  /** Whether the setting can be changed now (false while members-only: forced off; false for personal shops: no setting). */
  can_change: boolean
  /** Shown in the directory right now. */
  listed: boolean
  reason: DirectoryReason
  /** Members-only: the org's white-label site is Internal with Require membership. */
  members_only: boolean
  /** Public, active listings (in the shops that are shown, for an org). */
  public_listings: number
  /** Members-only (private) active listings; they never count as public content. */
  private_listings: number
  /** Active services (in the shops that are shown, for an org). One lists a storefront like a public listing. */
  active_services: number
}

export interface DirectoryInputs {
  kind: "org" | "shop"
  hidden: boolean
  members_only: boolean
  verified: boolean
  public_listings: number
  private_listings: number
  active_services: number
  /** Shops: owned by an org. */
  org_owned?: boolean
  /** Org-owned shops: whether the org itself is listed. */
  org_listed?: boolean
}

/** The directory decision, from what was loaded (pure). */
export function decideDirectory(i: DirectoryInputs): StorefrontDirectoryStatus {
  const personal = i.kind === "shop" && !i.org_owned
  const reason: DirectoryReason = (() => {
    if (personal) return "personal_shop"
    if (i.members_only) return "members_only"
    if (i.hidden) return "hidden_by_setting"
    if (i.kind === "org" && !i.verified) return "not_verified"
    if (i.public_listings <= 0 && i.active_services <= 0) return "no_public_content"
    if (i.kind === "shop" && !i.org_listed) return "org_not_listed"
    return "listed"
  })()
  return {
    show_in_directory: !personal && !i.hidden && !i.members_only,
    can_change: !personal && !i.members_only,
    listed: reason === "listed",
    reason,
    members_only: i.members_only,
    public_listings: i.public_listings,
    private_listings: i.private_listings,
    active_services: i.active_services,
  }
}

/** SQL: the org (alias `c`) is members-only. `alias` is a code literal. */
export function orgMembersOnlySql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`orgMembersOnlySql: invalid alias ${alias}`)
  return `EXISTS (SELECT 1 FROM org_whitelabel_config wl WHERE wl.contractor_id = ${alias}.contractor_id AND wl.focus_mode = 'internal' AND wl.require_membership IS TRUE)`
}

/** SQL: the shop (alias) is shown in the directory by its own setting. */
export function shopShownSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`shopShownSql: invalid alias ${alias}`)
  return `NOT EXISTS (SELECT 1 FROM storefront_directory_hidden h WHERE h.shop_id = ${alias}.shop_id)`
}

/** SQL: the org (alias) is shown in the directory by its own setting. */
export function orgShownSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`orgShownSql: invalid alias ${alias}`)
  return `NOT EXISTS (SELECT 1 FROM storefront_directory_hidden h WHERE h.contractor_id = ${alias}.contractor_id)`
}

async function membersOnly(db: Knex, contractorId: string): Promise<boolean> {
  const row = await db("org_whitelabel_config")
    .where({ contractor_id: contractorId })
    .first("focus_mode", "require_membership")
  return !!row && effectiveRequireMembership(row.focus_mode ?? "public", !!row.require_membership)
}

async function isHidden(db: Knex, target: { contractor_id: string } | { shop_id: string }): Promise<boolean> {
  return !!(await db("storefront_directory_hidden").where(target).first("id"))
}

interface ContentCounts {
  public_listings: number
  private_listings: number
  active_services: number
}

const n = (v: unknown) => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

/**
 * Listing and service counts over some shops (a subquery of shop ids). Only
 * services in those shops count, as on the hub and the org's storefront.
 */
async function contentCounts(db: Knex, shopIds: Knex.QueryBuilder): Promise<ContentCounts> {
  const [listings, services] = await Promise.all([
    db("listing_search as ls")
      .whereIn("ls.shop_id", shopIds.clone())
      .where("ls.status", "active")
      .first(
        db.raw("COUNT(DISTINCT ls.listing_id) FILTER (WHERE ls.visibility = 'public')::integer as public_listings"),
        db.raw("COUNT(DISTINCT ls.listing_id) FILTER (WHERE ls.visibility = 'private')::integer as private_listings"),
      ),
    db("services").where("status", "active").whereIn("shop_id", shopIds.clone()).count("* as count").first(),
  ])
  return {
    public_listings: n(listings?.public_listings),
    private_listings: n(listings?.private_listings),
    active_services: n(services?.count),
  }
}

export interface DirectoryOrg {
  contractor_id: string
  spectrum_id: string
  is_test?: boolean | null
}

/** An org's directory status (counts over its active, shown shops). */
export async function getOrgDirectoryStatus(
  org: DirectoryOrg,
  db: Knex = getKnex(),
): Promise<StorefrontDirectoryStatus> {
  const shownShops = db("shops as s")
    .select("s.shop_id")
    .where("s.owner_contractor_id", org.contractor_id)
    .where("s.status", "active")
    .whereRaw(shopShownSql("s"))
  const [hidden, members_only, counts] = await Promise.all([
    isHidden(db, { contractor_id: org.contractor_id }),
    membersOnly(db, org.contractor_id),
    contentCounts(db, shownShops),
  ])
  return decideDirectory({
    kind: "org",
    hidden,
    members_only,
    verified: isRsiVerifiedOrg(org),
    ...counts,
  })
}

export interface DirectoryShop {
  shop_id: string
  owner_contractor_id: string | null
}

/** A shop's directory status: its own counts, and whether its org is listed. */
export async function getShopDirectoryStatus(
  shop: DirectoryShop,
  db: Knex = getKnex(),
): Promise<StorefrontDirectoryStatus> {
  const own = db("shops").select("shop_id").where("shop_id", shop.shop_id).where("status", "active")
  const org = shop.owner_contractor_id
    ? await db("contractors")
        .where("contractor_id", shop.owner_contractor_id)
        .first<DirectoryOrg & { archived: boolean } | undefined>("contractor_id", "spectrum_id", "is_test", "archived")
    : undefined
  const [hidden, members_only, counts, orgStatus] = await Promise.all([
    isHidden(db, { shop_id: shop.shop_id }),
    org ? membersOnly(db, org.contractor_id) : Promise.resolve(false),
    contentCounts(db, own),
    org && !org.archived ? getOrgDirectoryStatus(org, db) : Promise.resolve(null),
  ])
  return decideDirectory({
    kind: "shop",
    hidden,
    members_only,
    verified: true,
    org_owned: !!org,
    org_listed: !!orgStatus?.listed,
    ...counts,
  })
}

/** Turn "Show in the public storefront directory" on or off. */
export async function setDirectoryShown(
  target: { contractor_id: string } | { shop_id: string },
  show: boolean,
  userId: string,
  db: Knex = getKnex(),
): Promise<void> {
  if (show) {
    await db("storefront_directory_hidden").where(target).delete()
    return
  }
  const column = "contractor_id" in target ? "contractor_id" : "shop_id"
  await db("storefront_directory_hidden")
    .insert({ ...target, updated_by: userId })
    .onConflict(column)
    .merge({ updated_by: userId })
}
