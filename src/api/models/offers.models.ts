/**
 * Offers API Type Definitions
 * Models for offer session management and negotiation
 */

/**
 * Market listing item in an offer
 */
export interface OfferMarketListing {
  listing_id: string
  quantity: number
}

/**
 * Counter offer request body
 */
export interface CounterOfferRequest {
  /** Offer title */
  title: string
  /** Offer kind/type */
  kind: string
  /** Offer cost as string (decimal) */
  cost: string
  /** Offer description */
  description: string
  /** Optional service ID */
  service_id?: string | null
  /** Market listings included in offer */
  market_listings: OfferMarketListing[]
  /** Payment type */
  payment_type: "one-time" | "hourly" | "daily"
}

/**
 * Update offer session status request
 */
export interface UpdateOfferSessionRequest {
  /** New status for the offer */
  status: "accepted" | "rejected" | "cancelled" | "counteroffered"
  /** Counter offer details (required if status is counteroffered) */
  counter_offer?: CounterOfferRequest
}

/**
 * Offer session response
 */
export interface OfferSessionResponse {
  id: string
  customer_id: string
  contractor_id?: string | null
  assigned_id?: string | null
  status: string
  thread_id?: string | null
  created_at: string
  updated_at: string
  offers: OfferResponse[]
  customer?: any
  contractor?: any
  assigned?: any
}

/**
 * Individual offer within a session
 */
export interface OfferResponse {
  id: string
  session_id: string
  actor_id: string
  kind: string
  cost: string
  title: string
  description: string
  service_id?: string | null
  payment_type: "one-time" | "hourly" | "daily"
  status: string
  created_at: string
  market_listings?: any[]
  service?: any
}

/**
 * Offer session stub (minimal info for lists)
 */
export interface OfferSessionStub {
  id: string
  customer_id: string
  contractor_id?: string | null
  assigned_id?: string | null
  status: string
  created_at: string
  updated_at: string
  most_recent_offer?: {
    title: string
    cost: string
    kind: string
  }
}

/**
 * Offer search query parameters
 */
export interface OfferSearchQuery {
  /** Sort method */
  sort_method?: "title" | "customer_name" | "status" | "timestamp" | "contractor_name"
  /** Filter by status */
  status?: "to-seller" | "to-customer" | "accepted" | "rejected"
  /** Filter by assigned user (username) */
  assigned?: string
  /** Filter by contractor (spectrum ID) */
  contractor?: string
  /** Filter by customer (username) */
  customer?: string
  /** Pagination index */
  index?: number
  /** Page size */
  page_size?: number
  /** Reverse sort order */
  reverse_sort?: boolean
  /** Filter by buyer username */
  buyer_username?: string
  /** Filter by seller username */
  seller_username?: string
  /** Filter by presence of market listings */
  has_market_listings?: boolean
  /** Filter by presence of service */
  has_service?: boolean
  /** Minimum cost filter */
  cost_min?: number
  /** Maximum cost filter */
  cost_max?: number
  /** Date from filter (ISO string) */
  date_from?: string
  /** Date to filter (ISO string) */
  date_to?: string
}

/**
 * Offer search response
 */
export interface OfferSearchResponse {
  item_counts: {
    total: number
    filtered: number
  }
  items: OfferSessionStub[]
}

/**
 * Create thread request
 */
export interface CreateThreadRequest {
  // Empty body - thread creation is automatic
}

/**
 * Create thread response
 */
export interface CreateThreadResponse {
  result: "Success"
}

/**
 * Merge offers request
 */
export interface MergeOffersRequest {
  /** Array of offer session IDs to merge (minimum 2) */
  offer_session_ids: string[]
}

/**
 * Merge offers response
 */
export interface MergeOffersResponse {
  result: "Success"
  merged_offer_session: OfferSessionResponse
  source_offer_session_ids: string[]
  message: string
}

/**
 * Accept offer response
 */
export interface AcceptOfferResponse {
  order_id: string
}

/**
 * Generic success response
 */
export interface OfferSuccessResponse {
  result: "Success"
}
