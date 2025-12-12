export type OrderSearchSortMethod =
  | "title"
  | "customer_name"
  | "status"
  | "timestamp"
  | "contractor_name"

export const ORDER_SEARCH_SORT_METHODS = [
  "title",
  "customer_name",
  "status",
  "timestamp",
  "contractor_name",
]

export type OrderSearchStatus =
  | "fulfilled"
  | "in-progress"
  | "not-started"
  | "cancelled"
  | "active"
  | "past"

export const ORDER_SEARCH_STATUS = [
  "fulfilled",
  "in-progress",
  "not-started",
  "cancelled",
  "active",
  "past",
]

export interface OrderSearchQueryArguments {
  sort_method: OrderSearchSortMethod
  status?: OrderSearchStatus
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

export interface OrderSearchQuery {
  sort_method?: OrderSearchSortMethod
  status?: OrderSearchStatus
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
