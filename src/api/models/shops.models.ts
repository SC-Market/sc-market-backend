/**
 * Shops Models
 * Type definitions for shop-related API requests and responses
 */

import { ApiResponse, MinimalContractor, MinimalUser } from "./common.models.js"

/**
 * Shop owner type
 */
export type ShopOwnerType = "user" | "contractor"

/**
 * Shop owner (can be user or contractor)
 */
export type ShopOwner = MinimalContractor | MinimalUser

/**
 * Shop definition
 */
export interface Shop {
  slug: string
  name: string
  description: string
  banner: string
  logo: string
  owner_type: ShopOwnerType
  owner: ShopOwner
}

/**
 * Create shop request payload
 */
export interface CreateShopRequest {
  slug: string
  name: string
  description: string
  banner: string
  logo: string
  owner_type: ShopOwnerType
  owner: string // spectrum_id or username
}

/**
 * Update shop request payload
 */
export interface UpdateShopRequest {
  name?: string
  description?: string
  banner?: string
  logo?: string
}

/**
 * Storage location definition
 */
export interface StorageLocation {
  id: string
  name: string
  description: string
  shop_slug: string
  user_id: string
  listed: boolean
}

/**
 * Create storage location request
 */
export interface CreateStorageLocationRequest {
  name: string
  description: string
  shop_slug: string
  listed: boolean
}

/**
 * Update storage location request
 */
export interface UpdateStorageLocationRequest {
  name?: string
  description?: string
  listed?: boolean
}

/**
 * Single shop response
 */
export interface ShopResponse extends ApiResponse<Shop> {}

/**
 * Shop list response
 */
export interface ShopListResponse extends ApiResponse<Shop[]> {}

/**
 * Single storage location response
 */
export interface StorageLocationResponse extends ApiResponse<StorageLocation> {}

/**
 * Storage location list response
 */
export interface StorageLocationListResponse extends ApiResponse<StorageLocation[]> {}

/**
 * Shop creation response
 */
export interface ShopCreationResponse extends ApiResponse<{
  slug: string
}> {}

/**
 * Shop update response
 */
export interface ShopUpdateResponse extends ApiResponse<{
  result: string
}> {}
