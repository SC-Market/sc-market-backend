/**
 * Item acquisition hub: "how to get <item>" (types: item-acquisition.types.ts).
 *
 * One document per game item: SC Market player-listing prices (the price
 * oracle) and live listings, the missions that reward the item or its
 * blueprint, the blueprints that craft it, in-game shops and resource
 * locations from the game files.
 *
 * Bounded load: one transaction (so one pool connection) running a fixed set
 * of small, indexed queries one after another under a short statement
 * timeout, behind an in-process cache (and the edge cache in front of that).
 * Mission and blueprint data come from the active LIVE game version.
 *
 * Privacy: listings are public listings of real shops only (test realm
 * excluded, services/test-accounts). A listing contributes its id, slug,
 * title, price and stock, which its public page shows; no seller, shop or
 * buyer identifier is ever selected into the document. The public feed
 * (toPublicDocument) drops the listing references too.
 */

import type { Knex } from "knex"
import { LRUCache } from "lru-cache"
import { getKnex } from "../../clients/database/knex-db.js"
import { withStatementTimeout } from "../../clients/database/session-settings.js"
import { env } from "../../config/env.js"
import { publiclyListedSql } from "../../api/routes/v2/util/listing-visibility.js"
import {
  buildUuidRangeQuery,
  formatShortSlug,
  isUuid,
  parseShortSlug,
} from "../../api/routes/v2/util/short-slug.js"
import type {
  ItemAcquisitionBlueprint,
  ItemAcquisitionDocument,
  ItemAcquisitionIngredient,
  ItemAcquisitionListing,
  ItemAcquisitionListings,
  ItemAcquisitionMission,
  ItemAcquisitionResource,
  ItemAcquisitionShop,
  PublicItemAcquisitionDocument,
} from "../../api/routes/v2/types/item-acquisition.types.js"
import type { PublicFeedInfo } from "../../api/routes/v2/types/price-oracle.types.js"
import { PRICE_ORACLE_RULES } from "../price-oracle/price-math.js"
import {
  PUBLIC_FEED_LICENSE,
  PUBLIC_FEED_TERMS,
  getPriceDocument,
} from "../price-oracle/price-oracle.service.js"
import {
  itemKeys,
  parseStoredRewards,
  resolveItemRewards,
} from "./reward-resolution.js"

/** Statement timeout of every query of one document. */
export const ACQUISITION_TIMEOUT = "2s"

export const ACQUISITION_LIMITS = {
  listings: 5,
  missions: 10,
  blueprints: 10,
  shops: 20,
  /** Missions scanned for direct item rewards (an item is in a handful) */
  itemRewardCandidates: 500,
  /** Listing rows read for the summary */
  listingRows: 500,
} as const

export const ITEMS_FEED_INFO: PublicFeedInfo = {
  dataset: "items",
  version: 1,
  terms: PUBLIC_FEED_TERMS,
  license: PUBLIC_FEED_LICENSE,
}

export const ACQUISITION_ATTRIBUTION =
  "Data: SC Market (https://sc-market.space): player listings, plus mission, blueprint and shop data from the Star Citizen game files. Please credit SC Market and link to the item's page when citing."

function siteOrigin(): string {
  return new URL(env.FRONTEND_URL || "https://sc-market.space").origin
}

function apiOrigin(): string {
  const url = new URL(siteOrigin())
  url.hostname = `api.${url.hostname}`
  return url.origin
}

export function acquisitionLinks(slug: string) {
  return {
    wiki: `${siteOrigin()}/wiki/items/${slug}`,
    market: `${siteOrigin()}/market/aggregate/${slug}`,
    json: `${apiOrigin()}/api/public/items/${slug}.json`,
  }
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : new Date(v as string).toISOString()

interface ItemRow {
  id: string
  name: string
  type: string | null
  p4k_id: string | null
  p4k_file: string | null
}

async function resolveItem(
  knex: Knex,
  slugOrId: string,
): Promise<ItemRow | null> {
  if (typeof slugOrId !== "string" || !slugOrId || slugOrId.length > 200)
    return null
  const { prefix, isFullUuid } = parseShortSlug(slugOrId)
  const q = knex("game_items").select(
    "id",
    "name",
    "type",
    "p4k_id",
    "p4k_file",
  )
  if (isFullUuid) {
    if (!isUuid(prefix)) return null
    q.where("id", prefix)
  } else {
    if (!/^[0-9a-f]{8}$/i.test(prefix)) return null
    const range = buildUuidRangeQuery(prefix.toLowerCase(), "id")
    q.whereRaw(range.sql, range.bindings).orderBy("id")
  }
  return (await q.first()) ?? null
}

interface ListingRow {
  listing_id: string
  title: string
  sale_type: string
  seller_key: string
  price: string | number | null
  quantity: string | number | null
}

/** Live public listings of one item, one row per listing (no seller columns leave this module). */
export function liveListingsSql(): string {
  return `
    SELECT
      l.listing_id,
      l.title,
      l.sale_type,
      COALESCE(l.shop_id::text, l.seller_id::text) AS seller_key,
      MIN(p.price)::bigint AS price,
      SUM(p.qty)::bigint AS quantity
    FROM listings l
    JOIN listing_items li ON li.listing_id = l.listing_id
    JOIN LATERAL (
      SELECT
        MIN(COALESCE(CASE WHEN li.pricing_mode = 'per_variant' THEN vp.price END, li.base_price)) AS price,
        SUM(lil.quantity_total) AS qty
      FROM listing_item_lots lil
      LEFT JOIN variant_pricing vp ON vp.item_id = li.item_id AND vp.variant_id = lil.variant_id
      WHERE lil.item_id = li.item_id AND lil.listed = true AND lil.quantity_total > 0
    ) p ON p.qty > 0
    WHERE ${publiclyListedSql("l")}
      AND (l.expires_at IS NULL OR l.expires_at > now())
      AND li.game_item_id = ?
    GROUP BY l.listing_id, l.title, l.sale_type, seller_key
    LIMIT ${ACQUISITION_LIMITS.listingRows}
  `
}

/** Pure: the listings block from the listing rows. */
export function summarizeListings(
  rows: readonly ListingRow[],
  marketPage: string,
): ItemAcquisitionListings {
  const placeholder = PRICE_ORACLE_RULES.placeholderPriceMax
  const listings = rows.map((r) => ({
    listing_id: r.listing_id,
    slug: formatShortSlug(r.listing_id, r.title || ""),
    title: r.title,
    price: num(r.price),
    quantity_available: Number(r.quantity ?? 0),
    sale_type: r.sale_type,
  }))
  const realAsk = (l: ItemAcquisitionListing) =>
    l.price !== null && l.price > placeholder
  const asks = listings
    .filter((l) => l.sale_type === "fixed" && realAsk(l))
    .map((l) => l.price as number)
  const top = [...listings]
    .sort(
      (a, b) =>
        Number(realAsk(b)) - Number(realAsk(a)) ||
        (a.price ?? Infinity) - (b.price ?? Infinity) ||
        a.listing_id.localeCompare(b.listing_id),
    )
    .slice(0, ACQUISITION_LIMITS.listings)
  return {
    count: listings.length,
    seller_count: new Set(rows.map((r) => r.seller_key)).size,
    quantity_available: listings.reduce((s, l) => s + l.quantity_available, 0),
    lowest_ask: asks.length ? Math.min(...asks) : null,
    page: marketPage,
    top,
  }
}

const MISSION_COLUMNS = [
  "m.mission_id",
  "m.mission_code",
  "m.mission_name",
  "m.category",
  "m.mission_giver_org",
  "m.faction",
  "m.star_system",
  "m.legal_status",
  "m.credit_reward_max",
  "m.associated_event",
] as const

interface MissionRow {
  mission_id: string
  mission_code: string
  mission_name: string
  category: string
  mission_giver_org: string | null
  faction: string | null
  star_system: string | null
  legal_status: "LEGAL" | "ILLEGAL" | null
  credit_reward_max: string | number | null
  associated_event: string | null
}

function toMission(
  r: MissionRow,
  kind: "item" | "blueprint",
  extra: Pick<
    ItemAcquisitionMission,
    "blueprint_id" | "drop_probability" | "is_guaranteed"
  >,
): ItemAcquisitionMission {
  return {
    mission_id: r.mission_id,
    mission_code: r.mission_code,
    mission_name: r.mission_name,
    reward_kind: kind,
    ...extra,
    category: r.category,
    mission_giver_org: r.mission_giver_org ?? null,
    faction: r.faction ?? null,
    star_system: r.star_system ?? null,
    legal_status: r.legal_status ?? null,
    credit_reward_max: num(r.credit_reward_max),
    associated_event: r.associated_event ?? null,
  }
}

/** Missions of `versionId` whose item rewards resolve to `item` (exact resolution, see reward-resolution.ts). */
export async function missionsRewardingItem(
  knex: Knex,
  item: ItemRow,
  versionId: string,
): Promise<ItemAcquisitionMission[]> {
  const keys = itemKeys(item)
  if (!keys.length) return []
  const candidates = (await knex("missions as m")
    .select(...MISSION_COLUMNS, "m.item_rewards")
    .where("m.version_id", versionId)
    // knex expands an array binding into a list, hence ARRAY[?].
    .whereRaw("mission_item_reward_keys(m.item_rewards) && ARRAY[?]::text[]", [
      keys,
    ])
    .orderBy("m.mission_name")
    .orderBy("m.mission_id")
    .limit(ACQUISITION_LIMITS.itemRewardCandidates)) as (MissionRow & {
    item_rewards: unknown
  })[]
  if (!candidates.length) return []
  const perMission = candidates.map((c) => parseStoredRewards(c.item_rewards))
  const resolved = await resolveItemRewards(knex, perMission.flat())
  let i = 0
  const out: ItemAcquisitionMission[] = []
  for (const [m, rewards] of candidates.map(
    (c, k) => [c, perMission[k]] as const,
  )) {
    const hits = resolved.slice(i, i + rewards.length)
    i += rewards.length
    if (hits.some((h) => h?.id === item.id)) {
      out.push(
        toMission(m, "item", {
          blueprint_id: null,
          drop_probability: null,
          is_guaranteed: null,
        }),
      )
    }
  }
  return out
}

async function missionsRewardingBlueprint(
  knex: Knex,
  itemId: string,
  versionId: string,
): Promise<{ total: number; top: ItemAcquisitionMission[] }> {
  const rows = (
    await knex.raw(
      `
    SELECT ${MISSION_COLUMNS.join(", ")},
      (array_agg(b.blueprint_id ORDER BY mbr.drop_probability DESC NULLS LAST, b.blueprint_id))[1] AS blueprint_id,
      MAX(mbr.drop_probability) AS drop_probability,
      BOOL_OR(COALESCE(mbr.is_guaranteed, false)) AS is_guaranteed,
      COUNT(*) OVER ()::integer AS total
    FROM blueprints b
    JOIN mission_blueprint_rewards mbr ON mbr.blueprint_id = b.blueprint_id
    JOIN missions m ON m.mission_id = mbr.mission_id
    WHERE b.output_game_item_id = ? AND b.version_id = ? AND m.version_id = ?
    GROUP BY m.mission_id
    ORDER BY is_guaranteed DESC, drop_probability DESC NULLS LAST, m.mission_name, m.mission_id
    LIMIT ${ACQUISITION_LIMITS.missions}
    `,
      [itemId, versionId, versionId],
    )
  ).rows as (MissionRow & {
    blueprint_id: string
    drop_probability: string | number | null
    is_guaranteed: boolean
    total: number
  })[]
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    top: rows.map((r) =>
      toMission(r, "blueprint", {
        blueprint_id: r.blueprint_id,
        drop_probability: num(r.drop_probability),
        is_guaranteed: r.is_guaranteed === true,
      }),
    ),
  }
}

async function blueprintsCrafting(
  knex: Knex,
  itemId: string,
  versionId: string,
): Promise<{ total: number; items: ItemAcquisitionBlueprint[] }> {
  const rows = (
    await knex.raw(
      `
    SELECT b.blueprint_id, b.blueprint_code, b.blueprint_name, b.output_quantity,
      b.tier, b.rarity, b.crafting_station_type, b.crafting_time_seconds,
      (SELECT COUNT(DISTINCT mbr.mission_id) FROM mission_blueprint_rewards mbr
        WHERE mbr.blueprint_id = b.blueprint_id)::integer AS mission_count,
      COUNT(*) OVER ()::integer AS total
    FROM blueprints b
    WHERE b.output_game_item_id = ? AND b.version_id = ?
    ORDER BY b.blueprint_name, b.blueprint_id
    LIMIT ${ACQUISITION_LIMITS.blueprints}
    `,
      [itemId, versionId],
    )
  ).rows as {
    blueprint_id: string
    blueprint_code: string
    blueprint_name: string
    output_quantity: number | null
    tier: number | null
    rarity: string | null
    crafting_station_type: string | null
    crafting_time_seconds: number | null
    mission_count: number
    total: number
  }[]
  if (!rows.length) return { total: 0, items: [] }
  const ingredientRows = (await knex("blueprint_ingredients as bi")
    .join("game_items as gi", "gi.id", "bi.ingredient_game_item_id")
    .select(
      "bi.blueprint_id",
      "gi.id",
      "gi.name",
      "bi.quantity_required",
      "bi.quantity_scu",
      "bi.min_quality",
      "bi.slot_display_name",
    )
    .whereIn(
      "bi.blueprint_id",
      rows.map((r) => r.blueprint_id),
    )
    .orderBy("bi.blueprint_id")
    .orderBy("bi.display_order")
    .orderBy("gi.name")) as {
    blueprint_id: string
    id: string
    name: string
    quantity_required: number
    quantity_scu: string | number | null
    min_quality: number | null
    slot_display_name: string | null
  }[]
  const byBlueprint = new Map<string, ItemAcquisitionIngredient[]>()
  for (const r of ingredientRows) {
    const list = byBlueprint.get(r.blueprint_id) ?? []
    list.push({
      game_item_id: r.id,
      slug: formatShortSlug(r.id, r.name),
      name: r.name,
      quantity: Number(r.quantity_required),
      quantity_scu: num(r.quantity_scu),
      min_quality: num(r.min_quality),
      slot_display_name: r.slot_display_name ?? null,
    })
    byBlueprint.set(r.blueprint_id, list)
  }
  return {
    total: Number(rows[0].total),
    items: rows.map((r) => ({
      blueprint_id: r.blueprint_id,
      blueprint_code: r.blueprint_code,
      blueprint_name: r.blueprint_name,
      output_quantity: Number(r.output_quantity ?? 1),
      tier: r.tier ?? null,
      rarity: r.rarity ?? null,
      crafting_station_type: r.crafting_station_type ?? null,
      crafting_time_seconds: num(r.crafting_time_seconds),
      mission_count: Number(r.mission_count),
      ingredients: byBlueprint.get(r.blueprint_id) ?? [],
    })),
  }
}

async function inGameShops(
  knex: Knex,
  itemId: string,
): Promise<{ total: number; shops: ItemAcquisitionShop[] }> {
  const rows = (await knex("game_shop_items as gsi")
    .join("game_shops as gs", "gs.id", "gsi.shop_id")
    .select(
      "gs.name",
      "gs.location",
      "gsi.buy_price",
      "gsi.sell_price",
      knex.raw("COUNT(*) OVER ()::integer AS total"),
    )
    .where("gsi.game_item_id", itemId)
    .orderByRaw("gsi.buy_price ASC NULLS LAST, gs.name, gs.location")
    .limit(ACQUISITION_LIMITS.shops)) as {
    name: string
    location: string
    buy_price: string | number | null
    sell_price: string | number | null
    total: number
  }[]
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    shops: rows.map((r) => ({
      name: r.name,
      location: r.location,
      buy_price: num(r.buy_price),
      sell_price: num(r.sell_price),
    })),
  }
}

type LocationMap = { [group: string]: string[] }

function locationMap(v: unknown): LocationMap | null {
  let x = v
  if (typeof x === "string") {
    try {
      x = JSON.parse(x)
    } catch {
      return null
    }
  }
  if (!x || typeof x !== "object" || Array.isArray(x)) return null
  const out: LocationMap = {}
  for (const [k, list] of Object.entries(x as Record<string, unknown>)) {
    if (Array.isArray(list))
      out[k] = list.filter((s): s is string => typeof s === "string")
  }
  return Object.keys(out).length ? out : null
}

async function resourceInfo(
  knex: Knex,
  itemId: string,
  versionId: string,
): Promise<ItemAcquisitionResource | null> {
  const r = await knex("resources")
    .select(
      "can_be_mined",
      "can_be_purchased",
      "can_be_salvaged",
      "can_be_looted",
      "mining_locations",
      "purchase_locations",
    )
    .where({ game_item_id: itemId, version_id: versionId })
    .first()
  if (!r) return null
  return {
    can_be_mined: r.can_be_mined === true,
    can_be_purchased: r.can_be_purchased === true,
    can_be_salvaged: r.can_be_salvaged === true,
    can_be_looted: r.can_be_looted === true,
    mining_locations: locationMap(r.mining_locations),
    purchase_locations: locationMap(r.purchase_locations),
  }
}

/** Builds one item's document (uncached), or null for an unknown item. */
export async function buildAcquisitionDocument(
  slugOrId: string,
  knex: Knex = getKnex(),
  now: Date = new Date(),
): Promise<ItemAcquisitionDocument | null> {
  // One transaction: the document holds one pool connection, and every
  // statement runs under ACQUISITION_TIMEOUT.
  return withStatementTimeout(knex, ACQUISITION_TIMEOUT, async (trx) => {
    const item = await resolveItem(trx, slugOrId)
    if (!item) return null
    const priceDoc = await getPriceDocument(item.id, trx, now)
    if (!priceDoc) return null
    const slug = formatShortSlug(item.id, item.name)
    const links = acquisitionLinks(slug)

    const listingRows = (await trx.raw(liveListingsSql(), [item.id]))
      .rows as ListingRow[]
    const listings = summarizeListings(listingRows, links.market)

    const version = (await trx("game_versions")
      .select("version_id", "version_number", "last_data_update")
      .where({ version_type: "LIVE", is_active: true })
      .orderBy("created_at", "desc")
      .first()) as
      | {
          version_id: string
          version_number: string
          last_data_update: Date | null
        }
      | undefined

    let missions = { total: 0, top: [] as ItemAcquisitionMission[] }
    let blueprints = { total: 0, items: [] as ItemAcquisitionBlueprint[] }
    let resource: ItemAcquisitionResource | null = null
    if (version) {
      const direct = await missionsRewardingItem(trx, item, version.version_id)
      const viaBlueprint = await missionsRewardingBlueprint(
        trx,
        item.id,
        version.version_id,
      )
      missions = {
        total: direct.length + viaBlueprint.total,
        top: [...direct, ...viaBlueprint.top].slice(
          0,
          ACQUISITION_LIMITS.missions,
        ),
      }
      blueprints = await blueprintsCrafting(trx, item.id, version.version_id)
      resource = await resourceInfo(trx, item.id, version.version_id)
    }
    const in_game_shops = await inGameShops(trx, item.id)

    const daily = priceDoc.trend_30d.daily
    const asOf = now.toISOString()
    return {
      feed: ITEMS_FEED_INFO,
      item: priceDoc.item,
      as_of: asOf,
      freshness: {
        as_of: asOf,
        game_version: version?.version_number ?? null,
        game_data_updated_at: iso(version?.last_data_update),
        price_snapshot_date: daily.length ? daily[daily.length - 1].date : null,
      },
      price: {
        currency: priceDoc.currency,
        unit_note: priceDoc.unit_note,
        current: priceDoc.current,
        trend_30d: priceDoc.trend_30d,
        sales_30d: priceDoc.sales_30d,
        summary: priceDoc.summary,
        links: priceDoc.links,
      },
      listings,
      missions,
      blueprints,
      in_game_shops,
      resource,
      attribution: ACQUISITION_ATTRIBUTION,
      links,
    }
  })
}

/** The public feed's document: no listing references. */
export function toPublicDocument(
  doc: ItemAcquisitionDocument,
): PublicItemAcquisitionDocument {
  const { count, seller_count, quantity_available, lowest_ask, page } =
    doc.listings
  return {
    ...doc,
    listings: { count, seller_count, quantity_available, lowest_ask, page },
  }
}

/** In-process cache TTL; under the edge's s-maxage. */
const CACHE_TTL_MS = 5 * 60 * 1000

const cache = new LRUCache<string, Promise<ItemAcquisitionDocument | null>>({
  max: 2000,
  ttl: CACHE_TTL_MS,
})

/**
 * Cached document (5 minutes), shared by the v2 endpoint and the public feed.
 * Concurrent requests for one item share one build; a failed build is not
 * kept, and neither is an unknown item (so a new import shows up at once).
 */
export async function getAcquisitionDocument(
  slugOrId: string,
): Promise<ItemAcquisitionDocument | null> {
  const key = String(slugOrId).toLowerCase()
  let p = cache.get(key)
  if (!p) {
    p = buildAcquisitionDocument(key)
    cache.set(key, p)
    p.then(
      (doc) => {
        if (!doc) cache.delete(key)
      },
      () => cache.delete(key),
    )
  }
  return p
}

/** Test hook. */
export function clearAcquisitionCache(): void {
  cache.clear()
}
