import {
  DBAuctionDetails,
  DBBuyOrder,
  MinimalContractor,
  MinimalUser,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"

export const sortingMethods = [
  "title",
  "timestamp",
  "minimum_price",
  "maximum_price",
  "avg_rating",
  "total_rating",
  "expiration",
]

export interface UserListingsQuery {
  user_id: string
  query?: string
  statuses?: string[]
  sale_type?: string
  item_type?: string
  listing_type?: string
  minCost?: number
  maxCost?: number
  quantityAvailable?: number
  sort: string
  reverseSort: boolean
  index: number
  page_size: number
}

export interface ContractorListingsQuery {
  contractor_id: string
  query?: string
  statuses?: string[]
  sale_type?: string
  item_type?: string
  listing_type?: string
  minCost?: number
  maxCost?: number
  quantityAvailable?: number
  sort: string
  reverseSort: boolean
  index: number
  page_size: number
}

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
  statuses: string | null
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
  statuses?: string[] | null
}

export interface OrderStats {
  total_orders: number
  total_order_value: number
}

export interface ListingBase {
  listing_id: string
  price: number
  timestamp: Date
  quantity_available: number
  user_seller: MinimalUser | null
  contractor_seller: MinimalContractor | null
  status: string
  sale_type: string
  expiration: Date
  // Omitted for now
  orders?: any[]
  bids?: any[]
}

export type FormattedListing =
  | FormattedUniqueListing
  | FormattedAggregateListing
  | FormattedMultipleListing

export interface FormattedUniqueListing {
  type: "unique"
  listing: {
    listing_id: string
    sale_type: string
    price: number
    quantity_available: number
    status: string
    timestamp: Date
    expiration: Date
  }
  accept_offers: boolean
  auction_details?: DBAuctionDetails
  details: {
    title: string
    description: string
    item_type: string
  }
  photos: string[]
  stats: {
    order_count?: number
    offer_count?: number
    view_count: number | string
  }
}

export interface FormattedBuyOrder {
  buy_order_id: string
  aggregate_id: string
  quantity: number
  price: number
  buyer: MinimalUser
  expiry: Date
}

export interface FormattedAggregateListing {
  type: "aggregate"
  listing: {
    listing_id: string
    sale_type: string
    price: number
    quantity_available: number
    status: string
    timestamp: Date
    expiration: Date
  }
  buy_orders?: FormattedBuyOrder[]
  details: {
    item_type: string
  }
  photos: string[]
  stats: {
    order_count: number
    offer_count: number
    view_count: number
  }
}

export interface FormattedMultipleListing {
  type: "multiple"
  listing: {
    listing_id: string
    sale_type: string
    price: number
    quantity_available: number
    status: string
    timestamp: Date
    expiration: Date
  }
  details: {
    title: string
    description: string
    item_type: string
  }
  photos: string[]
  stats: {
    order_count: number
    offer_count: number
    view_count: number
  }
}
