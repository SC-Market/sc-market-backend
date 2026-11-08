/**
 * An org's public storefront (its home page on SC Market, the embeds and
 * the Storefronts hub): trust stats rolled up from its shops, its shops,
 * its services, and its SC Orgs recruiting card. Public data only: what the
 * org's shop pages already show, summed.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { scOrgsClient, type ScOrgsCommunity } from "../../clients/sc-orgs/sc-orgs.js"
import { isRsiVerifiedOrg } from "./branding.js"
import { recentlyTradedSql } from "../seller-activity/featured-sellers.js"
import { orgMembersOnlySql, orgShownSql, shopShownSql } from "./directory.js"
import {
  INACTIVE_SELLER_RANK_PENALTY_DAYS,
  sellerInactiveSql,
} from "../seller-activity/seller-ranking.js"

/** Public URL of an image_resources row joined as `alias` (a code literal). */
function imageUrlSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`imageUrlSql: invalid alias ${alias}`)
  return `CASE WHEN ${alias}.resource_id IS NULL THEN NULL ELSE COALESCE(NULLIF(${alias}.external_url, ''), 'https://cdn.sc-market.space/' || ${alias}.filename) END`
}

export interface StorefrontShop {
  slug: string
  name: string
  logo_url: string | null
  /** Public, active listings. */
  listing_count: number
  /** Active services. */
  service_count: number
  /** Average review, 0–5; null without reviews. */
  rating: number | null
  rating_count: number
  completed_orders: number
}

export interface StorefrontService {
  service_id: string
  service_name: string
  kind: string | null
  cost: number
  payment_type: string
}

export interface StorefrontTrust {
  /** Fulfilled orders, all of the org's shops. */
  completed_orders: number
  /** Average review over all of the org's shops, 0–5; null without reviews. */
  avg_rating: number | null
  rating_count: number
  /** Share of fulfilled orders completed within 24 h, percent; null without any. */
  response_rate: number | null
  /** Average hours from order to fulfilment; null without any. */
  avg_completion_hours: number | null
  /** Members on SC Market. */
  members: number
  active_listings: number
  active_services: number
  /** When the org's first shop opened (ISO 8601); null without shops. */
  on_sc_market_since: string | null
}

export interface OrgStorefront {
  spectrum_id: string
  name: string
  logo_url: string | null
  banner_url: string | null
  /** Registered through RSI (SC Market's org verification). */
  verified: boolean
  trust: StorefrontTrust
  /** Active shops, oldest first (the first is the org's main shop). */
  shops: StorefrontShop[]
  /** Up to 6 active services, newest first. */
  services: StorefrontService[]
  /** The org's SC Orgs page (recruiting card), when SC Orgs has it. */
  recruiting: ScOrgsCommunity | null
}

export interface StorefrontOrgRow {
  contractor_id: string
  spectrum_id: string
  name: string
  avatar: string | null
  banner: string | null
  is_test?: boolean | null
}

interface ShopRow {
  shop_id: string
  slug: string
  name: string
  logo_url: string | null
  created_at: Date | string
  listing_count: number | string
  service_count: number | string
  rating: string | number | null
  rating_count: number | string
  total_completed: number | string | null
  avg_completion_hours: string | number | null
  response_rate: string | number | null
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null

const round = (n: number, digits: number) => Number(n.toFixed(digits))

/** Shop metric averages weighted by each shop's completed orders. */
export function weightedByCompleted(
  shops: { completed: number; value: number | null }[],
): number | null {
  let weight = 0
  let sum = 0
  for (const s of shops) {
    if (s.value === null || s.completed <= 0) continue
    weight += s.completed
    sum += s.value * s.completed
  }
  return weight > 0 ? sum / weight : null
}

async function imageUrl(db: Knex, resourceId: string | null): Promise<string | null> {
  if (!resourceId) return null
  const row = await db("image_resources as img")
    .where("img.resource_id", resourceId)
    .first(db.raw(`${imageUrlSql("img")} as url`))
  return (row?.url as string | undefined) ?? null
}

/** The storefront of one org (already checked to exist and be visible). */
export async function loadOrgStorefront(
  org: StorefrontOrgRow,
  db: Knex = getKnex(),
): Promise<OrgStorefront> {
  const shopsQuery = db("shops as s")
    .where("s.owner_contractor_id", org.contractor_id)
    .where("s.status", "active")
    .leftJoin("image_resources as logo_img", "logo_img.resource_id", "s.logo")
    .select(
      "s.shop_id",
      "s.slug",
      "s.name",
      "s.created_at",
      "s.total_completed",
      "s.avg_completion_hours",
      "s.response_rate",
      db.raw(`${imageUrlSql("logo_img")} as logo_url`),
      db.raw(
        "(SELECT COUNT(*)::integer FROM listing_search ls WHERE ls.shop_id = s.shop_id AND ls.status = 'active' AND ls.visibility = 'public') as listing_count",
      ),
      db.raw(
        "(SELECT COUNT(*)::integer FROM services sv WHERE sv.shop_id = s.shop_id AND sv.status = 'active') as service_count",
      ),
      db.raw(
        "(SELECT AVG(sr.rating)::numeric(3,2) FROM shop_ratings sr WHERE sr.shop_id = s.shop_id) as rating",
      ),
      db.raw(
        "(SELECT COUNT(*)::integer FROM shop_ratings sr WHERE sr.shop_id = s.shop_id) as rating_count",
      ),
    )
    .orderBy("s.created_at", "asc")

  const orgShopIds = db("shops")
    .select("shop_id")
    .where("owner_contractor_id", org.contractor_id)
    .where("status", "active")

  const [shopRows, members, ratings, services, logo_url, banner_url, recruiting] =
    await Promise.all([
      shopsQuery as Promise<ShopRow[]>,
      db("contractor_members")
        .where("contractor_id", org.contractor_id)
        .count("* as count")
        .first(),
      db("shop_ratings")
        .whereIn("shop_id", orgShopIds.clone())
        .first(
          db.raw("AVG(rating)::numeric(3,2) as avg"),
          db.raw("COUNT(*)::integer as count"),
        ),
      db("services")
        .where("status", "active")
        .where((q) =>
          q
            .whereIn("shop_id", orgShopIds.clone())
            .orWhere("contractor_id", org.contractor_id),
        )
        .orderBy("timestamp", "desc")
        .limit(6)
        .select("service_id", "service_name", "kind", "cost", "payment_type"),
      imageUrl(db, org.avatar),
      imageUrl(db, org.banner),
      org.is_test ? Promise.resolve(null) : scOrgsClient.community(org.spectrum_id),
    ])

  const shops: StorefrontShop[] = shopRows.map((s) => ({
    slug: s.slug,
    name: s.name,
    logo_url: s.logo_url,
    listing_count: num(s.listing_count),
    service_count: num(s.service_count),
    rating: num(s.rating_count) > 0 ? round(num(s.rating), 2) : null,
    rating_count: num(s.rating_count),
    completed_orders: num(s.total_completed),
  }))

  const weights = shopRows.map((s) => ({
    completed: num(s.total_completed),
    response: numOrNull(s.response_rate),
    hours: numOrNull(s.avg_completion_hours),
  }))
  const responseRate = weightedByCompleted(weights.map((w) => ({ completed: w.completed, value: w.response })))
  const completionHours = weightedByCompleted(weights.map((w) => ({ completed: w.completed, value: w.hours })))
  const ratingCount = num(ratings?.count)
  const firstShop = shopRows[0]

  return {
    spectrum_id: org.spectrum_id,
    name: org.name,
    logo_url,
    banner_url,
    verified: isRsiVerifiedOrg(org),
    trust: {
      completed_orders: shops.reduce((a, s) => a + s.completed_orders, 0),
      avg_rating: ratingCount > 0 ? round(num(ratings?.avg), 2) : null,
      rating_count: ratingCount,
      response_rate: responseRate === null ? null : round(responseRate, 1),
      avg_completion_hours: completionHours === null ? null : round(completionHours, 1),
      members: num(members?.count),
      active_listings: shops.reduce((a, s) => a + s.listing_count, 0),
      active_services: shops.reduce((a, s) => a + s.service_count, 0),
      on_sc_market_since: firstShop ? new Date(firstShop.created_at).toISOString() : null,
    },
    shops,
    services: (services as StorefrontService[]).map((s) => ({
      service_id: s.service_id,
      service_name: s.service_name,
      kind: s.kind ?? null,
      cost: num(s.cost),
      payment_type: s.payment_type,
    })),
    recruiting,
  }
}

/**
 * The orgs the Storefronts hub features first: the owner's org and a close
 * partner (drafts/whitelabel-overhaul-plan.md §A10), in this order.
 */
export const SHOWCASE_STOREFRONTS: readonly string[] = ["BWINCORP", "MEDRUNNER"]

export interface StorefrontCard {
  spectrum_id: string
  name: string
  logo_url: string | null
  /** The org's tagline (its RSI headline, as imported at registration). */
  tagline: string
  /** The org's fields on SC Market (trading, freight, …). */
  fields: string[]
  active_listings: number
  /** Active services in the shown shops. An org with services and no listings is a service-only org (tagged "Services"). */
  active_services: number
  /**
   * Slug of the shown shop with the most active services (its Services tab
   * is where a service-only org's card links); null without services.
   */
  services_shop_slug: string | null
  completed_orders: number
  avg_rating: number | null
  rating_count: number
  /** A showcase org, listed first. */
  showcase: boolean
}

interface CardRow {
  contractor_id: string
  spectrum_id: string
  name: string
  description: string | null
  logo_url: string | null
  active_listings: number | string
  active_services: number | string
  services_shop_slug: string | null
  completed_orders: number | string
  avg_rating: string | number | null
  rating_count: number | string
}

/** First line of an org description, plain and short. */
export function tagline(description: string | null | undefined): string {
  const line = (description ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/[#*_>`~[\]]/g, "").trim())
    .find((l) => l !== "")
  if (!line) return ""
  return line.length > 140 ? `${line.slice(0, 139).trimEnd()}…` : line
}

/** Cards per hub page when the caller sends no page_size (the frontend's STOREFRONTS_PAGE_SIZE). */
export const STOREFRONTS_DEFAULT_PAGE_SIZE = 24
/** Largest hub page_size (the hub used to be one page of at most 60). */
export const STOREFRONTS_MAX_PAGE_SIZE = 60
/** Focus chips the hub offers: the most common fields among all listed orgs. */
export const STOREFRONT_HUB_FIELDS = 10

/**
 * Stale storefronts (owner decision 2026-11-02): an org whose freshest
 * public listing or active service is older than this many days AND whose
 * managing members are all inactive ranks below every other org in the
 * hub's order. It is never hidden. The window is the seller-activity weight
 * (seller-ranking.ts), so "recent" means the same thing as in the default
 * listing order.
 */
export const STALE_STOREFRONT_AFTER_DAYS = INACTIVE_SELLER_RANK_PENALTY_DAYS

/**
 * The hub's SQL pieces for one org (alias c). Code literals only.
 * - shownShop: the org's active shops shown in the directory (alias s).
 * - listed / offered: its public, active listings (ls) / active services (sv) in those shops.
 */
function hubSql() {
  const shownShop = `s.owner_contractor_id = c.contractor_id AND s.status = 'active' AND ${shopShownSql("s")}`
  const listed = `ls.status = 'active' AND ls.visibility = 'public' AND ls.shop_id IN (SELECT s.shop_id FROM shops s WHERE ${shownShop})`
  const offered = `sv.status = 'active' AND sv.shop_id IN (SELECT s.shop_id FROM shops s WHERE ${shownShop})`
  return { shownShop, listed, offered }
}

/**
 * SQL: 1 when the org (alias c) is stale, else 0. Stale needs BOTH:
 * - content: no public listing updated (listing_search.updated_at) and no
 *   active service posted (services.timestamp; services have no edit
 *   time) within STALE_STOREFRONT_AFTER_DAYS;
 * - people: every shown shop's seller is known to be inactive
 *   (sellerInactiveSql: the shop's managing members were last seen 30+ days
 *   ago). A shop without activity stats, or whose members hide their
 *   status, is neutral (not inactive), exactly as in the listing order, so
 *   hiding your status never costs rank.
 */
export function storefrontStaleSql(): string {
  const { shownShop, listed, offered } = hubSql()
  const recent = `now() - INTERVAL '${STALE_STOREFRONT_AFTER_DAYS} days'`
  return (
    "(CASE WHEN" +
    ` NOT EXISTS (SELECT 1 FROM listing_search ls WHERE ${listed} AND ls.updated_at >= ${recent})` +
    ` AND NOT EXISTS (SELECT 1 FROM services sv WHERE ${offered} AND sv."timestamp" >= ${recent})` +
    ` AND NOT EXISTS (SELECT 1 FROM shops s WHERE ${shownShop} AND ${sellerInactiveSql("s.shop_id")} = 0)` +
    " THEN 1 ELSE 0 END)"
  )
}

/**
 * The hub's order, in SQL so it is the same on every request (SSR,
 * prerender and the client all get the API's order):
 * 1. showcase orgs, in SHOWCASE_STOREFRONTS order;
 * 2. stale orgs (storefrontStaleSql) after all others;
 * 3. completed orders, then active listings, then active services (most first);
 * 4. name, then contractor_id: a unique key, so ties never flip.
 */
export function orderStorefrontCards(qb: Knex.QueryBuilder): Knex.QueryBuilder {
  const showcase = SHOWCASE_STOREFRONTS.map((_, i) => `WHEN ? THEN ${i}`).join(" ")
  return qb
    .orderByRaw(`(CASE c.spectrum_id ${showcase} ELSE ${SHOWCASE_STOREFRONTS.length} END) ASC`, [
      ...SHOWCASE_STOREFRONTS,
    ])
    .orderByRaw(`${storefrontStaleSql()} ASC`)
    .orderBy("completed_orders", "desc")
    .orderBy("active_listings", "desc")
    .orderBy("active_services", "desc")
    .orderBy("c.name", "asc")
    .orderBy("c.contractor_id", "asc")
}

/**
 * The orgs the hub lists (alias c), one row each, unordered and without
 * columns: the filter shared by a page of cards, the total and the focus
 * chips. `field`: only orgs with that field (contractor_fields). `featured`:
 * only orgs that trade, i.e. a shown shop with a recently fulfilled order
 * (featured-sellers.ts), for the homepage row.
 */
function listedOrgsQuery(db: Knex, field?: string, featured = false): Knex.QueryBuilder {
  const { shownShop, listed, offered } = hubSql()
  const query = db("contractors as c")
    .where("c.archived", false)
    .whereRaw("c.is_test IS NOT TRUE")
    .whereRaw("c.spectrum_id NOT LIKE '~%'")
    .whereRaw(orgShownSql("c"))
    .whereRaw(`NOT ${orgMembersOnlySql("c")}`)
    .whereRaw(
      `(EXISTS (SELECT 1 FROM listing_search ls WHERE ${listed}) OR EXISTS (SELECT 1 FROM services sv WHERE ${offered}))`,
    )
  if (featured) {
    query.whereRaw(`EXISTS (SELECT 1 FROM shops s WHERE ${shownShop} AND ${recentlyTradedSql("s.shop_id")})`)
  }
  if (field) {
    query.whereExists((q) =>
      q.select(db.raw("1")).from("contractor_fields as cf").whereRaw("cf.contractor_id = c.contractor_id").where("cf.field", field),
    )
  }
  return query
}

export interface StorefrontPageQuery {
  /** Cards per page (clamped by the controller, at most STOREFRONTS_MAX_PAGE_SIZE). */
  limit: number
  offset: number
  /** Only orgs with this field. */
  field?: string
  /** Only orgs that trade (featured-sellers.ts): the homepage row. */
  featured?: boolean
}

/**
 * One page of the hub's orgs, one row per org, in hub order
 * (orderStorefrontCards, which ends on contractor_id, so pages never
 * overlap or skip an org).
 */
export function storefrontCardsQuery(db: Knex, page: StorefrontPageQuery): Knex.QueryBuilder {
  const { shownShop, listed, offered } = hubSql()
  const query = listedOrgsQuery(db, page.field, page.featured)
    .leftJoin("image_resources as logo_img", "logo_img.resource_id", "c.avatar")
    .select(
      "c.contractor_id",
      "c.spectrum_id",
      "c.name",
      "c.description",
      db.raw(`${imageUrlSql("logo_img")} as logo_url`),
      db.raw(`(SELECT COUNT(DISTINCT ls.listing_id)::integer FROM listing_search ls WHERE ${listed}) as active_listings`),
      db.raw(`(SELECT COUNT(*)::integer FROM services sv WHERE ${offered}) as active_services`),
      db.raw(
        `(SELECT s.slug FROM shops s JOIN services sv ON sv.shop_id = s.shop_id AND sv.status = 'active' WHERE ${shownShop} GROUP BY s.shop_id, s.slug ORDER BY COUNT(*) DESC, s.slug LIMIT 1) as services_shop_slug`,
      ),
      db.raw(
        `(SELECT COALESCE(SUM(s.total_completed), 0)::integer FROM shops s WHERE ${shownShop}) as completed_orders`,
      ),
      db.raw(
        `(SELECT AVG(sr.rating)::numeric(3,2) FROM shop_ratings sr JOIN shops s ON s.shop_id = sr.shop_id WHERE ${shownShop}) as avg_rating`,
      ),
      db.raw(
        `(SELECT COUNT(*)::integer FROM shop_ratings sr JOIN shops s ON s.shop_id = sr.shop_id WHERE ${shownShop}) as rating_count`,
      ),
    )
  return orderStorefrontCards(query).limit(page.limit).offset(page.offset)
}

/** How many orgs the hub lists (with `field`: how many have it). */
export function storefrontCountQuery(db: Knex, field?: string, featured = false): Knex.QueryBuilder {
  return listedOrgsQuery(db, field, featured).count({ count: "*" }).first()
}

/**
 * The hub's focus chips: the STOREFRONT_HUB_FIELDS most common fields among
 * every listed org (not just one page), most common first, then by name.
 */
export function storefrontFieldsQuery(db: Knex): Knex.QueryBuilder {
  return db("contractor_fields as cf")
    .whereIn("cf.contractor_id", listedOrgsQuery(db).select("c.contractor_id"))
    .groupBy("cf.field")
    .select("cf.field")
    .orderByRaw("COUNT(*) DESC")
    .orderBy("cf.field", "asc")
    .limit(STOREFRONT_HUB_FIELDS)
}

export interface StorefrontCardsPage {
  /** This page's cards, in hub order. */
  storefronts: StorefrontCard[]
  /** Every listed org (with the field filter: every one with the field). */
  total: number
  /** The focus chips (storefrontFieldsQuery). */
  fields: string[]
}

/**
 * The Storefronts hub (and the homepage row): RSI-verified orgs (never test
 * or archived orgs) listed in the public storefront directory (directory.ts):
 * "Show in the directory" left on, not members-only, and a public, active
 * listing or an active service in a shop that is itself shown (service-only
 * orgs included, owner decision 2026-11-01). Counts and stats only cover the
 * shown shops. Being verified doubles as the hub's anti-impersonation filter.
 * Ordered by the query (orderStorefrontCards): stale orgs rank lower, never
 * hidden. Paginated (page.limit / page.offset), with the total and the
 * focus chips; `page.field` keeps only orgs with that field.
 */
export async function listStorefrontCards(
  page: StorefrontPageQuery,
  db: Knex = getKnex(),
): Promise<StorefrontCardsPage> {
  // One after another: an anonymous read, kept to one pool connection.
  const rows = (await storefrontCardsQuery(db, page)) as CardRow[]
  const counted = (await storefrontCountQuery(db, page.field, page.featured)) as { count: number | string } | undefined
  const fieldList = (await storefrontFieldsQuery(db)) as { field: string }[]

  const ids = rows.map((r) => r.contractor_id)
  const fieldRows: { contractor_id: string; field: string }[] = ids.length
    ? await db("contractor_fields").whereIn("contractor_id", ids).select("contractor_id", "field")
    : []
  const fields = new Map<string, string[]>()
  for (const f of fieldRows) fields.set(f.contractor_id, [...(fields.get(f.contractor_id) ?? []), f.field])

  const storefronts = rows.map((r) => ({
    spectrum_id: r.spectrum_id,
    name: r.name,
    logo_url: r.logo_url,
    tagline: tagline(r.description),
    fields: (fields.get(r.contractor_id) ?? []).sort(),
    active_listings: num(r.active_listings),
    active_services: num(r.active_services),
    services_shop_slug: r.services_shop_slug ?? null,
    completed_orders: num(r.completed_orders),
    avg_rating: num(r.rating_count) > 0 ? round(num(r.avg_rating), 2) : null,
    rating_count: num(r.rating_count),
    showcase: SHOWCASE_STOREFRONTS.includes(r.spectrum_id),
  }))
  return { storefronts, total: num(counted?.count), fields: fieldList.map((f) => f.field) }
}
