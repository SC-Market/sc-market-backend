/**
 * UEX API Types
 * Based on UEX Corp API v2.0 documentation
 * @see https://api.uexcorp.uk/2.0/commodities
 */

export interface UEXCommodity {
  id: number
  id_parent: number | null
  name: string
  code: string // UEX code
  slug: string // UEX slug
  kind: string | null
  weight_scu: number | null // tons
  price_buy: number // average / SCU
  price_sell: number // average / SCU
  is_available: number // UEX
  is_available_live: number // Star Citizen
  is_visible: number // UEX (public)
  is_extractable: number // mining only
  is_mineral: number
  is_raw: number
  is_pure: number
  is_refined: number // refined form
  is_refinable: number // can be refined
  is_harvestable: number
  is_buyable: number
  is_sellable: number
  is_temporary: number
  is_illegal: number // if restricted in certain jurisdictions
  is_volatile_qt: number // if volatile in quantum travel
  is_volatile_time: number // if it becomes unstable over time
  is_inert: number // inert gas
  is_explosive: number // risk of explosion
  is_buggy: number // has known bugs reported recently
  is_fuel: number
  wiki: string | null
  date_added: number // timestamp
  date_modified: number // timestamp
}
