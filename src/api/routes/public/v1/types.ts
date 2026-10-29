/** Response shapes of the public API (design doc §6). */

import type { PublicScope } from "./scope-catalog.js"

/** Every success response: `{ "data": T }`. */
export interface PublicData<T> {
  data: T
}

export interface PublicOrgRef {
  contractor_id: string
  spectrum_id: string
  name: string
}

export interface PublicMe {
  user: {
    user_id: string
    username: string
    display_name: string
  }
  token: {
    id: string
    name: string
    preset: string
    scopes: PublicScope[]
    /** Orgs the token may act for. Empty: personal shops only. */
    orgs: PublicOrgRef[]
    expires_at: string
    last_used_at: string | null
    created_at: string
  }
}

export interface PublicShopPermissions {
  can_manage: boolean
  manage_market: boolean
  manage_stock: boolean
  manage_orders: boolean
}

export interface PublicShop {
  shop_id: string
  slug: string
  name: string
  description: string
  status: string
  owner: {
    type: "user" | "org"
    user_id: string | null
    /** The owning org's spectrum id, for org shops. */
    spectrum_id: string | null
  }
  supported_languages: string[]
  tags: string[]
  accepts_custom_orders: boolean
  created_at: string
  updated_at: string
  /** What the token's user may do in this shop, right now. */
  permissions: PublicShopPermissions
}

export interface PublicShopList {
  shops: PublicShop[]
  total: number
  page: number
  page_size: number
}

export interface OrderStatusChangeBody {
  status: "in-progress" | "fulfilled" | "cancelled"
}

export interface OrderStatusChangeResult {
  order_id: string
  status: "in-progress" | "fulfilled" | "cancelled"
}

export interface OfferAcceptResult {
  offer_id: string
  /** The order the accepted offer created. */
  order_id: string
}

export interface OfferDeclineResult {
  offer_id: string
  status: "rejected"
}
