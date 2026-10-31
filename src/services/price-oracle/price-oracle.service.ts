/**
 * Player-market price oracle (design: drafts/price-oracle-design.md).
 *
 * - snapshotGameItemPrices(): the scheduled job. Computes every game item's
 *   ask stats, 30-day trend and 30-day sale stats and upserts today's (UTC)
 *   row of game_item_price_daily. Idempotent: a re-run the same day
 *   overwrites that day's row.
 * - getPriceDocument(): one item's public document: the latest snapshot rows
 *   (trend, sales) plus one cheap current-ask query for that item, under a
 *   short statement timeout.
 * - getPriceIndex(): every item priced in the latest snapshot, snapshot only.
 *
 * Eligible asks (eligibleSellerAsksSql) are the public market's: active,
 * visibility 'public', not a test shop (services/test-accounts), fixed price,
 * single or bulk listings (a bundle's price is not one item's price), sold per
 * unit (SCU commodities are out of scope), not expired, at least
 * minListingAgeHours old, with a listed lot in stock and a price above the
 * placeholder price. Aggregates only leave this module: no seller, buyer or
 * listing identifier is ever selected into a result.
 */

import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  BACKGROUND_STATEMENT_TIMEOUT,
  withStatementTimeout,
} from "../../clients/database/session-settings.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { publiclyListedSql } from "../../api/routes/v2/util/listing-visibility.js"
import {
  buildUuidRangeQuery,
  formatShortSlug,
  isUuid,
  parseShortSlug,
} from "../../api/routes/v2/util/short-slug.js"
import { notTestShop } from "../test-accounts/isolation.js"
import type {
  PublicFeedInfo,
  PriceOracleCurrent,
  PriceOracleDailyPoint,
  PriceOracleItem,
  PriceOracleMethodology,
} from "../../api/routes/v2/types/price-oracle.types.js"
import {
  PRICE_ORACLE_RULES as RULES,
  computeAskStats,
  computeTrend,
  priceConfidence,
  type AskStats,
  type PriceConfidence,
  type SellerAsk,
} from "./price-math.js"

export const PRICE_DAILY_TABLE = "game_item_price_daily"

/** Statement timeout of the per-request current-ask query. */
export const CURRENT_ASK_TIMEOUT = "2s"

/** The unit note on every price document, index and file. */
export const UNIT_NOTE =
  "All prices are in aUEC, Star Citizen's in-game currency (not real money), per unit."

/** The feed envelope (see PublicFeedInfo). */
export const PRICE_FEED_INFO: PublicFeedInfo = {
  dataset: "prices",
  version: 1,
  terms:
    "Free to use, no key needed. Attribution requested. Rate limits exist only to protect the service from abuse.",
}

export const PRICE_ATTRIBUTION =
  "Data: SC Market player listings (https://sc-market.space). Please credit SC Market and link to the item's page when citing."

export const METHODOLOGY: PriceOracleMethodology = {
  text:
    "Asking prices of SC Market player listings (player-to-player offers on SC Market only, not an in-game or market-wide price), in aUEC (Star Citizen's in-game currency) per unit. Counted: active, public, fixed-price listings sold per unit, " +
    `at least ${RULES.minListingAgeHours} hours old, in stock and priced above ${RULES.placeholderPriceMax} aUEC (placeholders); ` +
    "test accounts are excluded. Each seller counts once per item, at its lowest ask. " +
    `With ${RULES.minSellersForTrim} or more sellers, outliers outside 1.5x the interquartile range of the log prices are excluded. ` +
    `A median is shown only with ${RULES.minSellersForMedian}+ sellers (confidence: low below ${RULES.minSellersForMedian} sellers, medium below ${RULES.minSellersForHighConfidence}, high from ${RULES.minSellersForHighConfidence}); the 30-day median and change need ${RULES.minDaysForTrend}+ days of daily medians ` +
    `(snapshot once a day, UTC); a sale median needs ${RULES.minSalesForMedian}+ completed SC Market orders in 30 days. ` +
    "These are asking prices, not in-game terminal prices.",
  rules: {
    min_listing_age_hours: RULES.minListingAgeHours,
    placeholder_price_max: RULES.placeholderPriceMax,
    min_sellers_for_trim: RULES.minSellersForTrim,
    iqr_multiplier: RULES.iqrMultiplier,
    min_sellers_for_median: RULES.minSellersForMedian,
    min_sellers_for_high_confidence: RULES.minSellersForHighConfidence,
    min_days_for_trend: RULES.minDaysForTrend,
    trend_window_days: RULES.trendWindowDays,
    min_sales_for_median: RULES.minSalesForMedian,
  },
}

/**
 * SQL of the eligible asks, one row per (game item, seller): the seller's
 * lowest eligible per-unit ask, its listing count and units in stock.
 * `itemFilter` is either "" or a condition on li.game_item_id with one `?`.
 */
export function eligibleSellerAsksSql(
  itemFilter: "" | "AND li.game_item_id = ?",
): string {
  return `
    SELECT
      li.game_item_id,
      MIN(p.price)::bigint AS price,
      COUNT(DISTINCT l.listing_id)::integer AS listing_count,
      SUM(p.qty)::bigint AS quantity
    FROM listings l
    JOIN listing_items li ON li.listing_id = l.listing_id
    JOIN LATERAL (
      SELECT MIN(x.price) AS price, SUM(x.qty) AS qty
      FROM (
        SELECT
          COALESCE(CASE WHEN li.pricing_mode = 'per_variant' THEN vp.price END, li.base_price) AS price,
          lil.quantity_total AS qty
        FROM listing_item_lots lil
        LEFT JOIN variant_pricing vp ON vp.item_id = li.item_id AND vp.variant_id = lil.variant_id
        WHERE lil.item_id = li.item_id AND lil.listed = true AND lil.quantity_total > 0
      ) x
      WHERE x.price > ${RULES.placeholderPriceMax}
    ) p ON p.price IS NOT NULL
    WHERE ${publiclyListedSql("l")}
      AND l.sale_type = 'fixed'
      AND l.listing_type IN ('single', 'bulk')
      AND l.quantity_unit = 'unit'
      AND (l.expires_at IS NULL OR l.expires_at > now())
      AND l.created_at <= now() - interval '${RULES.minListingAgeHours} hours'
      AND li.game_item_id IS NOT NULL
      ${itemFilter}
    GROUP BY li.game_item_id, COALESCE(l.shop_id::text, l.seller_id::text)
  `
}

/** Completed sales of public, non-test listings in the trend window. */
export function salesSql(): string {
  return `
    SELECT
      ph.game_item_id,
      COUNT(*)::integer AS sale_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ph.price) AS sale_median
    FROM price_history_v2 ph
    JOIN listings l ON l.listing_id = ph.listing_id
    WHERE ph.event_type = 'sale_completed'
      AND ph.recorded_at > now() - interval '${RULES.trendWindowDays} days'
      AND ph.price > ${RULES.placeholderPriceMax}
      AND l.visibility = 'public'
      AND ${notTestShop("l.shop_id")}
    GROUP BY ph.game_item_id
  `
}

interface SellerAskRow {
  game_item_id: string
  price: string | number
  listing_count: number
  quantity: string | number | null
}

function toSellerAsk(r: SellerAskRow): SellerAsk {
  return {
    price: Number(r.price),
    listingCount: Number(r.listing_count),
    quantity: Number(r.quantity ?? 0),
  }
}

/** YYYY-MM-DD of a Date (UTC). */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(day: string, n: number): string {
  return utcDay(new Date(Date.parse(day) + n * 24 * 60 * 60 * 1000))
}

/** A daily snapshot row, as stored. */
export interface PriceDailyRow {
  game_item_id: string
  day: string
  ask_count: number
  seller_count: number
  quantity_available: number
  lowest_ask: number | null
  median_ask: number | null
  highest_ask: number | null
  outliers_excluded: number
  sale_count_30d: number
  sale_median_30d: number | null
  median_30d: number | null
  change_pct_30d: number | null
  days_with_median_30d: number
}

/**
 * Builds the day's rows from the eligible asks, the window's sales and the
 * previous days' medians. Items without asks today still get a row (zero
 * counts) when they had one in the window, so the trend shows the gap.
 */
export function buildDailyRows(
  day: string,
  asks: readonly SellerAskRow[],
  sales: readonly {
    game_item_id: string
    sale_count: number
    sale_median: string | number | null
  }[],
  priorMedians: readonly {
    game_item_id: string
    day: string
    median_ask: string | number | null
  }[],
): PriceDailyRow[] {
  const asksByItem = new Map<string, SellerAsk[]>()
  for (const r of asks) {
    const list = asksByItem.get(r.game_item_id) ?? []
    list.push(toSellerAsk(r))
    asksByItem.set(r.game_item_id, list)
  }
  const salesByItem = new Map(sales.map((s) => [s.game_item_id, s]))
  const priorByItem = new Map<
    string,
    { day: string; medianAsk: number | null }[]
  >()
  for (const p of priorMedians) {
    const list = priorByItem.get(p.game_item_id) ?? []
    list.push({
      day: p.day,
      medianAsk: p.median_ask === null ? null : Number(p.median_ask),
    })
    priorByItem.set(p.game_item_id, list)
  }
  const items = new Set([...asksByItem.keys(), ...priorByItem.keys()])
  const rows: PriceDailyRow[] = []
  for (const id of items) {
    const stats = computeAskStats(asksByItem.get(id) ?? [])
    const trend = computeTrend([
      ...(priorByItem.get(id) ?? []),
      { day, medianAsk: stats.medianAsk },
    ])
    const sale = salesByItem.get(id)
    const saleCount = sale ? Number(sale.sale_count) : 0
    rows.push({
      game_item_id: id,
      day,
      ...statsColumns(stats),
      sale_count_30d: saleCount,
      sale_median_30d:
        sale &&
        saleCount >= RULES.minSalesForMedian &&
        sale.sale_median !== null
          ? Math.round(Number(sale.sale_median))
          : null,
      median_30d: trend.median30d,
      change_pct_30d: trend.changePct,
      days_with_median_30d: trend.daysWithMedian,
    })
  }
  return rows
}

function statsColumns(s: AskStats) {
  return {
    ask_count: s.askCount,
    seller_count: s.sellerCount,
    quantity_available: s.quantityAvailable,
    lowest_ask: s.lowestAsk,
    median_ask: s.medianAsk,
    highest_ask: s.highestAsk,
    outliers_excluded: s.outliersExcluded,
  }
}

/**
 * The scheduled job: upserts today's row of every item with asks today or a
 * row in the trend window. Returns the number of rows written.
 */
export async function snapshotGameItemPrices(
  knex: Knex = getKnex(),
  now: Date = new Date(),
): Promise<number> {
  if (!(await knex.schema.hasTable(PRICE_DAILY_TABLE))) return 0
  const day = utcDay(now)
  const windowStart = addDays(day, -(RULES.trendWindowDays - 1))
  return withStatementTimeout(
    knex,
    BACKGROUND_STATEMENT_TIMEOUT,
    async (trx) => {
      const asks = (await trx.raw(eligibleSellerAsksSql("")))
        .rows as SellerAskRow[]
      const hasHistory = await trx.schema.hasTable("price_history_v2")
      const sales = hasHistory ? (await trx.raw(salesSql())).rows : []
      const prior = await trx(PRICE_DAILY_TABLE)
        .select(
          "game_item_id",
          trx.raw("to_char(day, 'YYYY-MM-DD') AS day"),
          "median_ask",
        )
        .where("day", ">=", windowStart)
        .where("day", "<", day)
      const rows = buildDailyRows(day, asks, sales, prior)
      const computedAt = new Date()
      for (let i = 0; i < rows.length; i += 500) {
        await trx(PRICE_DAILY_TABLE)
          .insert(
            rows
              .slice(i, i + 500)
              .map((r) => ({ ...r, computed_at: computedAt })),
          )
          .onConflict(["game_item_id", "day"])
          .merge()
      }
      return rows.length
    },
  )
}

/** Job wrapper for tasks.ts: logs, never throws. */
export async function snapshot_game_item_prices(): Promise<void> {
  try {
    const count = await snapshotGameItemPrices()
    logger.info("Game item price snapshot completed", { rows: count })
  } catch (error) {
    logger.error("Failed to snapshot game item prices", { error })
  }
}

// ── Reads ──────────────────────────────────────────────────────────────────

function siteOrigin(): string {
  return new URL(env.FRONTEND_URL || "https://sc-market.space").origin
}

function apiOrigin(): string {
  const url = new URL(siteOrigin())
  url.hostname = `api.${url.hostname}`
  return url.origin
}

export function priceLinks(slug: string) {
  return {
    page: `${siteOrigin()}/market/aggregate/${slug}`,
    json: `${apiOrigin()}/api/public/prices/${slug}.json`,
    index: `${apiOrigin()}/api/public/prices/index.json`,
  }
}

const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")} aUEC`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

const UNIT_SENTENCE = "aUEC is Star Citizen's in-game currency."

/** "Based on N listings from K sellers on SC Market." */
export function sampleNote(askCount: number, sellerCount: number): string {
  if (sellerCount <= 0) return "No qualifying SC Market player listings."
  return `Based on ${plural(askCount, "listing")} from ${plural(sellerCount, "seller")} on SC Market.`
}

/**
 * The plain-text facts (also what phase-2 pages render). Framed narrowly:
 * SC Market player listings, never "the market price"; always with the
 * sample size and confidence.
 */
export function summarySentence(
  name: string,
  date: string,
  current: Omit<PriceOracleCurrent, "confidence" | "sample_note">,
  changePct: number | null,
): string {
  if (current.seller_count === 0 || current.lowest_ask === null) {
    return `As of ${date}, there are no qualifying SC Market player listings for ${name}.`
  }
  const sample = `based on ${plural(current.ask_count, "listing")} from ${plural(current.seller_count, "seller")}`
  const confidence = priceConfidence(current.seller_count)
  if (current.median_ask === null) {
    return (
      `As of ${date}, the lowest asking price in SC Market player listings for ${name} is ${fmt(current.lowest_ask)}, ${sample}. ` +
      `Too few sellers for a typical price (low confidence). ${UNIT_SENTENCE}`
    )
  }
  const trend =
    changePct === null
      ? ""
      : `; 30-day change in the median ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`
  return (
    `As of ${date}, SC Market player listings for ${name}: lowest ask ${fmt(current.lowest_ask)}, median ask ${fmt(current.median_ask)}, ` +
    `${sample} (${confidence} confidence)${trend}. ${UNIT_SENTENCE}`
  )
}

interface GameItemRow {
  id: string
  name: string
  type: string | null
}

/** Resolves a feed slug (short slug, 8-hex prefix or full UUID) to a game item. */
export async function resolveGameItem(
  knex: Knex,
  slug: string,
): Promise<GameItemRow | null> {
  if (typeof slug !== "string" || slug.length === 0 || slug.length > 200)
    return null
  const { prefix, isFullUuid } = parseShortSlug(slug)
  const q = knex("game_items").select("id", "name", "type")
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

/** Live ask stats of one item, under CURRENT_ASK_TIMEOUT. */
export async function currentAskStats(
  knex: Knex,
  gameItemId: string,
): Promise<AskStats> {
  return withStatementTimeout(knex, CURRENT_ASK_TIMEOUT, async (trx) => {
    const rows = (
      await trx.raw(eligibleSellerAsksSql("AND li.game_item_id = ?"), [
        gameItemId,
      ])
    ).rows as SellerAskRow[]
    return computeAskStats(rows.map(toSellerAsk))
  })
}

function toCurrent(s: AskStats): PriceOracleCurrent {
  return {
    confidence: priceConfidence(s.sellerCount),
    sample_note: sampleNote(s.askCount, s.sellerCount),
    ask_count: s.askCount,
    seller_count: s.sellerCount,
    quantity_available: s.quantityAvailable,
    lowest_ask: s.lowestAsk,
    median_ask: s.medianAsk,
    highest_ask: s.highestAsk,
    outliers_excluded: s.outliersExcluded,
  }
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

/** One item's price document, or null for an unknown item. */
export async function getPriceDocument(
  slugOrId: string,
  knex: Knex = getKnex(),
  now: Date = new Date(),
): Promise<PriceOracleItem | null> {
  const item = await resolveGameItem(knex, slugOrId)
  if (!item) return null
  const day = utcDay(now)
  const windowStart = addDays(day, -(RULES.trendWindowDays - 1))
  // One query at a time: a feed request holds at most one pool connection.
  const stats = await currentAskStats(knex, item.id)
  const daily = await knex(PRICE_DAILY_TABLE)
    .select(
      knex.raw("to_char(day, 'YYYY-MM-DD') AS day"),
      "median_ask",
      "lowest_ask",
      "ask_count",
      "seller_count",
      "median_30d",
      "change_pct_30d",
      "days_with_median_30d",
      "sale_count_30d",
      "sale_median_30d",
    )
    .where("game_item_id", item.id)
    .where("day", ">=", windowStart)
    .orderBy("day", "asc")
  const latest = daily.length ? daily[daily.length - 1] : null
  const current = toCurrent(stats)
  const changePct = num(latest?.change_pct_30d)
  const slug = formatShortSlug(item.id, item.name)
  return {
    feed: PRICE_FEED_INFO,
    item: { id: item.id, slug, name: item.name, type: item.type },
    currency: "aUEC",
    unit_note: UNIT_NOTE,
    as_of: now.toISOString(),
    current,
    trend_30d: {
      days_with_data: Number(latest?.days_with_median_30d ?? 0),
      median_30d: num(latest?.median_30d),
      change_pct: changePct,
      daily: daily.map(
        (d): PriceOracleDailyPoint => ({
          date: d.day,
          median_ask: num(d.median_ask),
          lowest_ask: num(d.lowest_ask),
          ask_count: Number(d.ask_count),
          seller_count: Number(d.seller_count),
        }),
      ),
    },
    sales_30d: {
      count: Number(latest?.sale_count_30d ?? 0),
      median_price: num(latest?.sale_median_30d),
    },
    summary: summarySentence(item.name, day, current, changePct),
    methodology: METHODOLOGY,
    attribution: PRICE_ATTRIBUTION,
    links: priceLinks(slug),
  }
}

/** One row of the price index. */
export interface PriceIndexRow {
  slug: string
  name: string
  type: string | null
  page: string
  json: string
  ask_count: number
  seller_count: number
  /** See PriceOracleCurrent.confidence */
  confidence: PriceConfidence
  lowest_ask: number | null
  median_ask: number | null
  median_30d: number | null
  change_pct_30d: number | null
}

export interface PriceIndex {
  feed: PublicFeedInfo
  /** UTC day of the snapshot, null before the first snapshot */
  date: string | null
  /** When the snapshot was computed */
  as_of: string | null
  currency: "aUEC"
  unit_note: string
  count: number
  /** Priced items per confidence level: how much of the catalogue has enough data */
  coverage: Record<PriceConfidence, number>
  items: PriceIndexRow[]
  methodology: PriceOracleMethodology
  attribution: string
}

/** Every item with asks in the latest snapshot (snapshot table only). */
export async function getPriceIndex(
  knex: Knex = getKnex(),
): Promise<PriceIndex> {
  const latest = await knex(PRICE_DAILY_TABLE)
    .select(knex.raw("to_char(MAX(day), 'YYYY-MM-DD') AS day"))
    .first()
  const day: string | null = latest?.day ?? null
  if (!day) {
    return {
      feed: PRICE_FEED_INFO,
      date: null,
      as_of: null,
      currency: "aUEC",
      unit_note: UNIT_NOTE,
      count: 0,
      coverage: { none: 0, low: 0, medium: 0, high: 0 },
      items: [],
      methodology: METHODOLOGY,
      attribution: PRICE_ATTRIBUTION,
    }
  }
  const rows = await knex(`${PRICE_DAILY_TABLE} as d`)
    .join("game_items as gi", "gi.id", "d.game_item_id")
    .select(
      "gi.id",
      "gi.name",
      "gi.type",
      "d.ask_count",
      "d.seller_count",
      "d.lowest_ask",
      "d.median_ask",
      "d.median_30d",
      "d.change_pct_30d",
      "d.computed_at",
    )
    .where("d.day", day)
    .where("d.ask_count", ">", 0)
    .orderBy("gi.name", "asc")
  let asOf: Date | null = null
  const items = rows.map((r): PriceIndexRow => {
    const computed = r.computed_at ? new Date(r.computed_at) : null
    if (computed && (!asOf || computed > asOf)) asOf = computed
    const slug = formatShortSlug(r.id, r.name)
    const links = priceLinks(slug)
    return {
      slug,
      name: r.name,
      type: r.type ?? null,
      page: links.page,
      json: links.json,
      ask_count: Number(r.ask_count),
      seller_count: Number(r.seller_count),
      confidence: priceConfidence(Number(r.seller_count)),
      lowest_ask: num(r.lowest_ask),
      median_ask: num(r.median_ask),
      median_30d: num(r.median_30d),
      change_pct_30d: num(r.change_pct_30d),
    }
  })
  return {
    feed: PRICE_FEED_INFO,
    date: day,
    as_of: asOf ? (asOf as Date).toISOString() : null,
    currency: "aUEC",
    unit_note: UNIT_NOTE,
    count: items.length,
    coverage: items.reduce(
      (c, i) => ({ ...c, [i.confidence]: c[i.confidence] + 1 }),
      { none: 0, low: 0, medium: 0, high: 0 } as Record<
        PriceConfidence,
        number
      >,
    ),
    items,
    methodology: METHODOLOGY,
    attribution: PRICE_ATTRIBUTION,
  }
}

const CSV_COLUMNS: (keyof PriceIndexRow)[] = [
  "slug",
  "name",
  "type",
  "lowest_ask",
  "median_ask",
  "median_30d",
  "change_pct_30d",
  "ask_count",
  "seller_count",
  "confidence",
  "page",
]

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ""
  let s = String(v)
  // Spreadsheet formula injection: item names are admin/imported data, still.
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function priceIndexCsv(index: PriceIndex): string {
  const lines = [CSV_COLUMNS.join(",")]
  for (const r of index.items)
    lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","))
  return lines.join("\n") + "\n"
}

function mdCell(v: string): string {
  return v.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ")
}

export function priceIndexMarkdown(index: PriceIndex): string {
  const out = [
    "# SC Market player listings: asking prices (Star Citizen)",
    "",
    index.date
      ? `Snapshot of ${index.date} (UTC), computed ${index.as_of}. Asking prices in SC Market player listings only (not an in-game or market-wide price); every row says how many listings and sellers it is based on. A median needs ${RULES.minSellersForMedian}+ sellers. ${UNIT_NOTE}`
      : "No snapshot yet.",
    "",
    `Coverage: ${index.count} items with listings; ${index.coverage.high} high, ${index.coverage.medium} medium and ${index.coverage.low} low confidence (low = under ${RULES.minSellersForMedian} sellers, no median).`,
    "",
    `Methodology: ${METHODOLOGY.text}`,
    "",
    `${PRICE_ATTRIBUTION} ${PRICE_FEED_INFO.terms} Dataset "${PRICE_FEED_INFO.dataset}", version ${PRICE_FEED_INFO.version}.`,
    "",
    "| Item | Type | Lowest ask (aUEC) | Median ask (aUEC) | 30-day median (aUEC) | 30-day change | Listings | Sellers | Confidence |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ]
  const n = (v: number | null) =>
    v === null ? "–" : Math.round(v).toLocaleString("en-US")
  for (const r of index.items) {
    out.push(
      `| [${mdCell(r.name)}](${r.page}) | ${mdCell(r.type ?? "")} | ${n(r.lowest_ask)} | ${n(r.median_ask)} | ${n(r.median_30d)} | ${
        r.change_pct_30d === null
          ? "–"
          : `${r.change_pct_30d > 0 ? "+" : ""}${r.change_pct_30d.toFixed(1)}%`
      } | ${r.ask_count} | ${r.seller_count} | ${r.confidence} |`,
    )
  }
  return out.join("\n") + "\n"
}
