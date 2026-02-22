/**
 * TSOA Models for Commodities API
 * 
 * These models define the request/response types for commodity endpoints.
 * They are used by TSOA to generate OpenAPI specifications and validate requests.
 */

/**
 * Commodity data from UEX Corp API
 * 
 * @example
 * {
 *   "id": 1,
 *   "id_parent": null,
 *   "name": "Agricium",
 *   "code": "AGRI",
 *   "slug": "agricium",
 *   "kind": "Metal",
 *   "weight_scu": 1,
 *   "price_buy": 25.50,
 *   "price_sell": 28.75,
 *   "is_available": 1,
 *   "is_available_live": 1,
 *   "is_visible": 1,
 *   "is_extractable": 1,
 *   "is_mineral": 1,
 *   "is_raw": 0,
 *   "is_pure": 0,
 *   "is_refined": 1,
 *   "is_refinable": 0,
 *   "is_harvestable": 0,
 *   "is_buyable": 1,
 *   "is_sellable": 1,
 *   "is_temporary": 0,
 *   "is_illegal": 0,
 *   "is_volatile_qt": 0,
 *   "is_volatile_time": 0,
 *   "is_inert": 0,
 *   "is_explosive": 0,
 *   "is_buggy": 0,
 *   "is_fuel": 0,
 *   "wiki": "https://starcitizen.tools/Agricium",
 *   "date_added": 1609459200,
 *   "date_modified": 1640995200
 * }
 */
export interface Commodity {
  /** Unique commodity ID */
  id: number
  
  /** Parent commodity ID (for refined/processed variants) */
  id_parent: number | null
  
  /** Commodity name */
  name: string
  
  /** UEX commodity code */
  code: string
  
  /** UEX commodity slug */
  slug: string
  
  /** Commodity kind/category */
  kind: string | null
  
  /** Weight in SCU (tons) */
  weight_scu: number | null
  
  /** Average buy price per SCU */
  price_buy: number
  
  /** Average sell price per SCU */
  price_sell: number
  
  /** Available in UEX database */
  is_available: number
  
  /** Available in live Star Citizen */
  is_available_live: number
  
  /** Visible in UEX (public) */
  is_visible: number
  
  /** Extractable via mining only */
  is_extractable: number
  
  /** Is a mineral */
  is_mineral: number
  
  /** Is in raw form */
  is_raw: number
  
  /** Is in pure form */
  is_pure: number
  
  /** Is in refined form */
  is_refined: number
  
  /** Can be refined */
  is_refinable: number
  
  /** Can be harvested */
  is_harvestable: number
  
  /** Can be bought */
  is_buyable: number
  
  /** Can be sold */
  is_sellable: number
  
  /** Is temporary */
  is_temporary: number
  
  /** Restricted in certain jurisdictions */
  is_illegal: number
  
  /** Volatile during quantum travel */
  is_volatile_qt: number
  
  /** Becomes unstable over time */
  is_volatile_time: number
  
  /** Is an inert gas */
  is_inert: number
  
  /** Risk of explosion */
  is_explosive: number
  
  /** Has known bugs reported recently */
  is_buggy: number
  
  /** Is fuel */
  is_fuel: number
  
  /** Wiki URL */
  wiki: string | null
  
  /** Date added (Unix timestamp) */
  date_added: number
  
  /** Date modified (Unix timestamp) */
  date_modified: number
}

/**
 * Commodities list response
 * 
 * @example
 * {
 *   "data": [
 *     {
 *       "id": 1,
 *       "name": "Agricium",
 *       "code": "AGRI",
 *       "slug": "agricium",
 *       "price_buy": 25.50,
 *       "price_sell": 28.75
 *     }
 *   ]
 * }
 */
export interface CommoditiesResponse {
  data: Commodity[]
}
