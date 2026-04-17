/**
 * TypeScript interfaces for Market V2 Analytics API
 * 
 * These types are used by TSOA controllers for OpenAPI generation and type-safe API endpoints.
 * All types are strongly typed with no `any` or `unknown` types.
 * 
 * Requirements: 46.1-46.5
 */

// ============================================================================
// Price History Types
// ============================================================================

/**
 * Query parameters for price history endpoint
 */
export interface GetPriceHistoryRequest {
  /** Game item UUID to get price history for (required) */
  game_item_id: string;
  
  /** Optional quality tier filter (1-5) */
  quality_tier?: number;
  
  /** Start date for time range (ISO 8601 format) */
  start_date?: string;
  
  /** End date for time range (ISO 8601 format) */
  end_date?: string;
  
  /** Time interval for aggregation (default: 'day') */
  interval?: 'hour' | 'day' | 'week' | 'month';
}

/**
 * Price data point in time series
 */
export interface PriceDataPoint {
  /** ISO 8601 timestamp for this data point */
  timestamp: string;
  
  /** Average price during this time period */
  avg_price: number;
  
  /** Minimum price during this time period */
  min_price: number;
  
  /** Maximum price during this time period */
  max_price: number;
  
  /** Number of transactions/listings during this time period */
  volume: number;
  
  /** Optional quality tier for this data series */
  quality_tier?: number;
}

/**
 * Response for price history endpoint
 */
export interface GetPriceHistoryResponse {
  /** Game item UUID */
  game_item_id: string;
  
  /** Game item name */
  game_item_name: string;
  
  /** Time series data points */
  data: PriceDataPoint[];
  
  /** Start date of the time range */
  start_date: string;
  
  /** End date of the time range */
  end_date: string;
  
  /** Time interval used for aggregation */
  interval: string;
}

// ============================================================================
// Quality Distribution Types
// ============================================================================

/**
 * Query parameters for quality distribution endpoint
 */
export interface GetQualityDistributionRequest {
  /** Game item UUID to get quality distribution for (required) */
  game_item_id: string;
  
  /** Start date for time range (ISO 8601 format) */
  start_date?: string;
  
  /** End date for time range (ISO 8601 format) */
  end_date?: string;
}

/**
 * Quality tier distribution data
 */
export interface QualityTierDistribution {
  /** Quality tier (1-5) */
  quality_tier: number;
  
  /** Total quantity available for this tier */
  quantity_available: number;
  
  /** Number of listings offering this tier */
  listing_count: number;
  
  /** Average price for this tier */
  avg_price: number;
  
  /** Minimum price for this tier */
  min_price: number;
  
  /** Maximum price for this tier */
  max_price: number;
  
  /** Number of unique sellers offering this tier */
  seller_count: number;
}

/**
 * Response for quality distribution endpoint
 */
export interface GetQualityDistributionResponse {
  /** Game item UUID */
  game_item_id: string;
  
  /** Game item name */
  game_item_name: string;
  
  /** Distribution data by quality tier */
  distribution: QualityTierDistribution[];
  
  /** Total quantity across all tiers */
  total_quantity: number;
  
  /** Start date of the time range (if filtered) */
  start_date?: string;
  
  /** End date of the time range (if filtered) */
  end_date?: string;
}

// ============================================================================
// Seller Stats Types
// ============================================================================

/**
 * Query parameters for seller stats endpoint
 */
export interface GetSellerStatsRequest {
  /** Optional seller ID filter (defaults to current user) */
  seller_id?: string;
}

/**
 * Sales data by quality tier
 */
export interface QualityTierSales {
  /** Quality tier (1-5) */
  quality_tier: number;
  
  /** Total sales volume (number of items sold) */
  volume: number;
  
  /** Average sale price for this tier */
  avg_price: number;
  
  /** Average time to sale in hours */
  avg_time_to_sale_hours: number;
}

/**
 * Price premium data by quality tier
 */
export interface QualityTierPremium {
  /** Quality tier (1-5) */
  quality_tier: number;
  
  /** Price premium percentage compared to tier 1 baseline */
  premium_percentage: number;
}

/**
 * Response for seller stats endpoint
 */
export interface GetSellerStatsResponse {
  /** Seller ID */
  seller_id: string;
  
  /** Sales data grouped by quality tier */
  sales_by_quality: QualityTierSales[];
  
  /** Current inventory distribution by quality tier */
  inventory_distribution: QualityTierDistribution[];
  
  /** Price premium percentages by quality tier */
  price_premiums: QualityTierPremium[];
}
