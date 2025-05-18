export interface MarketListingBody {
  price: number
  title: string
  description: string
  sale_type: string
  item_type: string
  quantity_available: number
}

export const sortingMethods = [
  "title",
  "timestamp",
  "minimum_price",
  "maximum_price",
  "avg_rating",
  "total_rating",
  "expiration",
]

export interface MarketSearchQueryArguments {
  item_type: string | null
  sale_type: string | null
  minCost: string
  rating: string | null
  maxCost: string | null
  quantityAvailable: string
  query: string
  sort: string
  seller_rating: string
  index: string
  page_size: string
  user_seller: string
  contractor_seller: string
  listing_type: string | null
}

export interface MarketSearchQuery {
  item_type: string | null
  sale_type: string | null
  minCost: number
  rating: number | null
  maxCost: number | null
  quantityAvailable: number
  query: string
  sort: string
  seller_rating: number
  index: number
  page_size: number
  reverseSort: boolean
  user_seller_id?: string | null
  contractor_seller_id?: string | null
  listing_type?: string | null
}
