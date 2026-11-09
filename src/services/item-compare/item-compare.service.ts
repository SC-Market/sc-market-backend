/**
 * Comparison tables of the wiki: every game item of one category with the
 * stats the category compares (compare-categories.ts) and its market price
 * (services/market-prices), in one document.
 *
 * Bounded load: three indexed queries (items, their attributes, their live
 * listings) under a short statement timeout, behind a 5-minute in-process
 * cache per category (and the edge cache in front of the endpoint). The
 * largest category (helmets) is under a thousand rows.
 */

import type { Knex } from "knex"
import { LRUCache } from "lru-cache"
import { getKnex } from "../../clients/database/knex-db.js"
import { withStatementTimeout } from "../../clients/database/session-settings.js"
import {
  loadManufacturerNameLookup,
  lookupManufacturerName,
} from "../../api/routes/v2/game-data/wiki/manufacturer-names.js"
import type {
  WikiCompareResponse,
  WikiCompareRow,
} from "../../api/routes/v2/game-data/wiki/wiki.types.js"
import { fetchMarketPrices } from "../market-prices/market-prices.service.js"
import {
  COMPARE_CATEGORIES,
  type CompareCategoryKey,
  informativeStats,
  parseStatNumber,
  readClass,
  readGrade,
  readStat,
} from "./compare-categories.js"

export const COMPARE_TIMEOUT = "5s"

interface CompareItemRow {
  id: string
  name: string
  sub_type: string | null
  size: number | null
  grade: number | null
  manufacturer: string | null
  image_url: string | null
  thumbnail_path: string | null
}

interface AttributeRow {
  game_item_id: string
  attribute_name: string
  attribute_value: string
}

/** sub_type values that carry no meaning (the game files' defaults). */
const EMPTY_SUB_TYPES = new Set(["", "UNDEFINED", "NONE"])

/** The attribute names the category reads, so the query skips the rest. */
function neededAttributes(key: CompareCategoryKey): string[] {
  const def = COMPARE_CATEGORIES[key]
  const names = new Set<string>(["size", "grade", "manufacturer"])
  for (const name of def.classAttrs) names.add(name)
  for (const stat of def.stats) for (const name of stat.attrs) names.add(name)
  return [...names]
}

/** Build the document (no cache). */
export async function buildCompareDocument(
  knex: Knex,
  key: CompareCategoryKey,
): Promise<WikiCompareResponse> {
  const def = COMPARE_CATEGORIES[key]
  const types = [...def.types]

  const { items, attributes, prices } = await withStatementTimeout(
    knex,
    COMPARE_TIMEOUT,
    async (trx) => {
      const items = (await trx("game_items")
        .whereIn("type", types)
        .select(
          "id",
          "name",
          "sub_type",
          "size",
          "grade",
          "manufacturer",
          "image_url",
          "thumbnail_path",
        )
        .orderBy("name", "asc")
        .orderBy("id", "asc")) as CompareItemRow[]
      const attributes = (await trx("game_item_attributes as gia")
        .join("game_items as gi", "gi.id", "gia.game_item_id")
        .whereIn("gi.type", types)
        .whereIn("gia.attribute_name", neededAttributes(key))
        .select(
          "gia.game_item_id",
          "gia.attribute_name",
          "gia.attribute_value",
        )) as AttributeRow[]
      const prices = await fetchMarketPrices(trx, {
        sql: `li.game_item_id IN (SELECT id FROM game_items WHERE type = ANY(?::text[]))`,
        bindings: [types],
      })
      return { items, attributes, prices }
    },
  )

  const byItem = new Map<string, Record<string, string>>()
  for (const a of attributes) {
    let attrs = byItem.get(a.game_item_id)
    if (!attrs) {
      attrs = {}
      byItem.set(a.game_item_id, attrs)
    }
    attrs[a.attribute_name] = a.attribute_value
  }

  const mfrLookup = await loadManufacturerNameLookup(
    knex,
    items.map((i) => i.manufacturer),
  )

  const rows: WikiCompareRow[] = items.map((item) => {
    const attrs = byItem.get(item.id) ?? {}
    const stats: { [key: string]: number | string } = {}
    for (const stat of def.stats) {
      const value = readStat(stat, attrs)
      if (value !== null) stats[stat.key] = value
    }
    const sizeAttr = attrs.size ? parseStatNumber(attrs.size) : null
    const subType = item.sub_type?.trim() ?? ""
    return {
      id: item.id,
      name: item.name,
      size: item.size ?? sizeAttr,
      grade: readGrade(def.graded, item.grade, attrs),
      class: readClass(def, attrs),
      sub_type: EMPTY_SUB_TYPES.has(subType.toUpperCase()) ? null : subType,
      manufacturer:
        lookupManufacturerName(mfrLookup, item.manufacturer) ??
        attrs.manufacturer ??
        item.manufacturer,
      manufacturer_code: item.manufacturer,
      image_url: item.image_url,
      thumbnail_path: item.thumbnail_path,
      stats,
      market: prices.get(item.id) ?? null,
    }
  })

  const columns = informativeStats(def.stats, rows).map((stat) => ({
    key: stat.key,
    kind: stat.kind,
    better: stat.better,
    unit: stat.unit,
  }))
  const shown = new Set(columns.map((c) => c.key))
  for (const row of rows) {
    for (const k of Object.keys(row.stats)) {
      if (!shown.has(k)) delete row.stats[k]
    }
  }

  return {
    category: key,
    group: def.group,
    columns,
    items: rows,
    as_of: new Date().toISOString(),
  }
}

/** In-process cache TTL; under the edge's s-maxage. */
const CACHE_TTL_MS = 5 * 60 * 1000

const cache = new LRUCache<CompareCategoryKey, Promise<WikiCompareResponse>>({
  max: 50,
  ttl: CACHE_TTL_MS,
})

/**
 * Cached document (5 minutes). Concurrent requests for one category share
 * one build; a failed build is not kept.
 */
export function getCompareDocument(
  key: CompareCategoryKey,
): Promise<WikiCompareResponse> {
  let p = cache.get(key)
  if (!p) {
    p = buildCompareDocument(getKnex(), key)
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}

/** Test hook. */
export function clearCompareCache(): void {
  cache.clear()
}
