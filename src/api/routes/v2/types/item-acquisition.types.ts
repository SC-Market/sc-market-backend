/**
 * Item acquisition hub ("how to get <item>"): one document per game item
 * that puts SC Market player listings, the missions that reward the item,
 * the blueprints that craft it and in-game shop data side by side.
 *
 * Served by GET /api/v2/game-items/{id}/acquisition (ItemAcquisitionDocument)
 * and, without listing references, by the public feed
 * GET /api/public/items/{slug}.json (PublicItemAcquisitionDocument).
 */

import type {
  PriceOracleCurrent,
  PriceOracleItemRef,
  PriceOracleLinks,
  PriceOracleSales,
  PriceOracleTrend,
  PublicFeedInfo,
} from "./price-oracle.types.js"

/** Player-listing price stats: the price oracle's numbers for this item. */
export interface ItemAcquisitionPrice {
  /** Always "aUEC" (in-game currency, not ISO 4217) */
  currency: "aUEC"
  unit_note: string
  current: PriceOracleCurrent
  trend_30d: PriceOracleTrend
  sales_30d: PriceOracleSales
  /** Plain-text statement of the numbers, with sample size and confidence */
  summary: string
  /** links.json is the full price document, methodology included */
  links: PriceOracleLinks
}

/** One live listing of the item (the same facts its public listing page shows). */
export interface ItemAcquisitionListing {
  listing_id: string
  /** Short slug of the listing page, /market/{slug} */
  slug: string
  title: string
  /** Lowest per-unit asking price in the listing, aUEC; null for auctions without a price */
  price: number | null
  /** Units in stock */
  quantity_available: number
  sale_type: string
}

/** Live listings summary, without listing references (public feed). */
export interface ItemAcquisitionListingsSummary {
  /** Active public listings of the item with stock (test accounts excluded) */
  count: number
  /** Distinct sellers (shops) of those listings */
  seller_count: number
  /** Units in stock across them */
  quantity_available: number
  /**
   * Lowest fixed-price per-unit ask above the placeholder price, aUEC; null
   * without one. Unlike price.current.lowest_ask it includes listings younger
   * than 24 hours.
   */
  lowest_ask: number | null
  /** The item's market page (every listing) */
  page: string
}

/** Live listings summary plus the cheapest listings. */
export interface ItemAcquisitionListings extends ItemAcquisitionListingsSummary {
  /** Up to 5 listings, cheapest real ask first (placeholder prices last) */
  top: ItemAcquisitionListing[]
}

/** A mission that rewards the item, or the blueprint that crafts it. */
export interface ItemAcquisitionMission {
  mission_id: string
  mission_code: string
  mission_name: string
  /**
   * "item": completing the mission awards the item itself.
   * "blueprint": the mission can award the blueprint that crafts the item.
   */
  reward_kind: "item" | "blueprint"
  /** The blueprint awarded (reward_kind "blueprint"), else null */
  blueprint_id: string | null
  /** Drop chance in percent (0-100); null when the game data gives none (item rewards) */
  drop_probability: number | null
  /** Guaranteed blueprint drop; null when the game data doesn't say (item rewards) */
  is_guaranteed: boolean | null
  category: string
  /** Mission giver (organisation) */
  mission_giver_org: string | null
  faction: string | null
  star_system: string | null
  legal_status: "LEGAL" | "ILLEGAL" | null
  credit_reward_max: number | null
  /** Seasonal event the mission belongs to, if any */
  associated_event: string | null
}

export interface ItemAcquisitionMissions {
  /** Missions that reward the item or its blueprint (one per mission and kind) */
  total: number
  /** Up to 10: item rewards first, then by drop chance, then name */
  top: ItemAcquisitionMission[]
}

/** A crafting ingredient. */
export interface ItemAcquisitionIngredient {
  game_item_id: string
  /** Short slug of the ingredient's game item */
  slug: string
  name: string
  quantity: number
  /** Quantity in SCU, for resources measured in SCU */
  quantity_scu: number | null
  /** Minimum quality (0-1000), when the slot requires one */
  min_quality: number | null
  slot_display_name: string | null
}

/** A blueprint that crafts the item. */
export interface ItemAcquisitionBlueprint {
  blueprint_id: string
  blueprint_code: string
  blueprint_name: string
  output_quantity: number
  tier: number | null
  rarity: string | null
  crafting_station_type: string | null
  crafting_time_seconds: number | null
  /** Missions that can award this blueprint */
  mission_count: number
  ingredients: ItemAcquisitionIngredient[]
}

export interface ItemAcquisitionBlueprints {
  total: number
  /** Up to 10, by name */
  items: ItemAcquisitionBlueprint[]
}

/** An in-game NPC shop that sells or buys the item (game files). */
export interface ItemAcquisitionShop {
  name: string
  location: string
  /** Price the shop sells the item for, aUEC; null if it doesn't sell it */
  buy_price: number | null
  /** Price the shop pays for the item, aUEC; null if it doesn't buy it */
  sell_price: number | null
}

export interface ItemAcquisitionShops {
  total: number
  /** Up to 20, cheapest buy price first */
  shops: ItemAcquisitionShop[]
}

/** How a resource (crafting material, commodity) is obtained, from the game files. */
export interface ItemAcquisitionResource {
  can_be_mined: boolean
  can_be_purchased: boolean
  can_be_salvaged: boolean
  can_be_looted: boolean
  /** Location group -> locations, as extracted; null when unknown */
  mining_locations: { [group: string]: string[] } | null
  purchase_locations: { [group: string]: string[] } | null
}

export interface ItemAcquisitionFreshness {
  /** When this document was computed (ISO 8601); listings and current asks are as of then */
  as_of: string
  /** Game version of the mission, blueprint and resource data, e.g. "4.10.2-LIVE.12881860"; null without an active LIVE version */
  game_version: string | null
  /** When that game data was last imported (ISO 8601) */
  game_data_updated_at: string | null
  /** UTC day of this item's latest daily price snapshot (price.trend_30d); null when it has none */
  price_snapshot_date: string | null
}

export interface ItemAcquisitionLinks {
  /** Wiki item page */
  wiki: string
  /** Market page (all listings of the item) */
  market: string
  /** This document as the public JSON feed */
  json: string
}

interface ItemAcquisitionBase {
  feed: PublicFeedInfo
  item: PriceOracleItemRef
  /** When the document was computed (ISO 8601); same as freshness.as_of */
  as_of: string
  freshness: ItemAcquisitionFreshness
  price: ItemAcquisitionPrice
  missions: ItemAcquisitionMissions
  blueprints: ItemAcquisitionBlueprints
  /** In-game shops from the game files; total 0 when the data has none */
  in_game_shops: ItemAcquisitionShops
  /** Set when the item is a resource with acquisition data, else null */
  resource: ItemAcquisitionResource | null
  /** How to credit the data when citing or reusing it */
  attribution: string
  links: ItemAcquisitionLinks
}

/** GET /api/v2/game-items/{id}/acquisition */
export interface ItemAcquisitionDocument extends ItemAcquisitionBase {
  listings: ItemAcquisitionListings
}

/** GET /api/public/items/{slug}.json: the same, without listing references. */
export interface PublicItemAcquisitionDocument extends ItemAcquisitionBase {
  listings: ItemAcquisitionListingsSummary
}
