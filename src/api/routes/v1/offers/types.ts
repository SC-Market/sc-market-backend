export interface CounterOfferBody {
  session_id: string
  title: string
  kind: string
  cost: string
  description: string
  service_id: string | null
  market_listings: { listing_id: string; quantity: number }[]
  payment_type: string
}

export type OfferSearchSortMethod =
  | "title"
  | "customer_name"
  | "status"
  | "timestamp"
  | "contractor_name"

export const OFFER_SEARCH_SORT_METHODS = [
  "title",
  "customer_name",
  "status",
  "timestamp",
  "contractor_name",
]

export type OfferSearchStatus =
  | "to-seller"
  | "to-customer"
  | "accepted"
  | "rejected"

export const OFFER_SEARCH_STATUS = [
  "to-seller",
  "to-customer",
  "accepted",
  "rejected",
]

export interface OfferSearchQueryArguments {
  sort_method: OfferSearchSortMethod
  status?: OfferSearchStatus
  assigned_id?: string
  contractor_id?: string
  customer_id?: string
  index: number
  page_size: number
  reverse_sort: boolean
  buyer_username?: string
  seller_username?: string
  has_market_listings?: boolean
  has_service?: boolean
  cost_min?: number
  cost_max?: number
  date_from?: string
  date_to?: string
}

export interface OfferSearchQuery {
  sort_method?: OfferSearchSortMethod
  status?: OfferSearchStatus
  assigned?: string
  contractor?: string
  customer?: string
  index?: string
  page_size?: string
  reverse_sort?: string
  buyer_username?: string
  seller_username?: string
  has_market_listings?: string
  has_service?: string
  cost_min?: string
  cost_max?: string
  date_from?: string
  date_to?: string
}
