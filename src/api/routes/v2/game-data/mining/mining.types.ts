/**
 * TypeScript interfaces for Game Data Mining API
 */

// ============================================================================
// Ore Search Types
// ============================================================================

export interface OreTopLocation {
  name: string
  system: string
  probability: number
}

export interface OreSearchResult {
  name: string
  resourceName: string | null
  instability: number | null
  resistance: number | null
  optimalWindowMidpoint: number | null
  optimalWindowThinness: number | null
  explosionMultiplier: number | null
  clusterFactor: number | null
  rarity: string
  marketPrice: number | null
  locationCount: number
  topLocations: OreTopLocation[]
}

export interface SearchOresResponse {
  ores: OreSearchResult[]
  total: number
  page: number
  page_size: number
}

// ============================================================================
// Ore Detail Types
// ============================================================================

export interface OreLocation {
  locationName: string
  system: string
  locationType: string
  groupName: string
  groupProbability: number
  relativeProbability: number
}

export interface OreDetailResponse {
  name: string
  resourceName: string | null
  instability: number | null
  resistance: number | null
  optimalWindowMidpoint: number | null
  optimalWindowMidpointRandomness: number | null
  optimalWindowThinness: number | null
  explosionMultiplier: number | null
  clusterFactor: number | null
  rarity: string
  marketPrice: number | null
  locations: OreLocation[]
}

// ============================================================================
// Location Search Types
// ============================================================================

export interface LocationGroup {
  groupName: string
  groupProbability: number
  oreCount: number
}

export interface LocationSearchResult {
  name: string
  displayName: string | null
  system: string
  locationType: string
  groups: LocationGroup[]
  hasRefinery: boolean
}

export interface SearchLocationsResponse {
  locations: LocationSearchResult[]
  total: number
  page: number
  page_size: number
}

// ============================================================================
// Location Detail Types
// ============================================================================

export interface LocationOre {
  presetName: string
  displayName: string
  elementName: string | null
  resourceName: string | null
  rarity: string
  relativeProbability: number
  instability: number | null
  resistance: number | null
  optimalWindowMidpoint: number | null
  optimalWindowThinness: number | null
  explosionMultiplier: number | null
  clusterFactor: number | null
  marketPrice: number | null
  estimatedValue: number | null
}

export interface LocationMiningGroup {
  groupName: string
  groupProbability: number
  ores: LocationOre[]
}

export interface LocationDetailResponse {
  name: string
  displayName: string | null
  system: string
  locationType: string
  groups: LocationMiningGroup[]
  hasRefinery: boolean
  amenities: string[]
}

// ============================================================================
// Refinery Types
// ============================================================================

export interface RefiningMethod {
  name: string
  speed: string
  quality: string
}

export interface RefiningMethodsResponse {
  methods: RefiningMethod[]
}
