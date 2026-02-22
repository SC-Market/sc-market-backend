/**
 * TSOA Models for Starmap API
 * 
 * These models define the request/response types for starmap endpoints.
 * They are used by TSOA to generate OpenAPI specifications and validate requests.
 */

/**
 * Starmap route between two locations
 * 
 * @example
 * {
 *   "data": {
 *     "route": [
 *       {
 *         "name": "Stanton",
 *         "type": "system",
 *         "distance": 0
 *       },
 *       {
 *         "name": "Pyro",
 *         "type": "system",
 *         "distance": 5.2
 *       }
 *     ],
 *     "total_distance": 5.2,
 *     "jump_points": 1
 *   }
 * }
 */
export interface StarmapRoute {
  /** Route data from RSI API */
  [key: string]: any
}

/**
 * Celestial object information
 * 
 * @example
 * {
 *   "data": {
 *     "id": "stanton",
 *     "name": "Stanton",
 *     "type": "system",
 *     "description": "A star system in the United Empire of Earth",
 *     "affiliation": "UEE",
 *     "habitable": true
 *   }
 * }
 */
export interface StarmapObject {
  /** Object data from RSI API */
  [key: string]: any
}

/**
 * Starmap search results
 * 
 * @example
 * {
 *   "data": {
 *     "results": [
 *       {
 *         "id": "stanton",
 *         "name": "Stanton",
 *         "type": "system"
 *       },
 *       {
 *         "id": "crusader",
 *         "name": "Crusader",
 *         "type": "planet"
 *       }
 *     ]
 *   }
 * }
 */
export interface StarmapSearchResult {
  /** Search results from RSI API */
  results: StarmapObject[]
}

/**
 * Route response
 */
export interface RouteResponse {
  data: StarmapRoute
}

/**
 * Object response
 */
export interface ObjectResponse {
  data: StarmapObject
}

/**
 * Search response
 */
export interface SearchResponse {
  data: StarmapSearchResult
}
