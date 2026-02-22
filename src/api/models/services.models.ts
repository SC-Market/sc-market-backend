/**
 * Services Models
 * Type definitions for service-related API requests and responses
 */

import { ApiResponse, PaymentType } from "./common.models.js"

/**
 * Service status
 */
export type ServiceStatus = "active" | "inactive" | "archived"

/**
 * Service kind/type
 */
export type ServiceKind = string | null

/**
 * Service definition
 */
export interface Service {
  service_id: string
  service_name: string
  service_description: string
  title: string
  description: string
  kind: ServiceKind
  cost: number
  rush: boolean
  departure: string | null
  destination: string | null
  collateral: number
  payment_type: PaymentType
  status: ServiceStatus
  contractor_id: string | null
  user_id: string | null
  photos: string[]
  timestamp: string
  updated_at: string
  contractor?: any
  user?: any
}

/**
 * Create service request payload
 */
export interface CreateServiceRequest {
  service_name: string
  service_description: string
  title: string
  description: string
  kind?: ServiceKind
  cost: number
  rush?: boolean
  departure?: string | null
  destination?: string | null
  collateral?: number
  payment_type: PaymentType
  status: ServiceStatus
  contractor?: string | null
  photos: string[]
}

/**
 * Update service request payload
 */
export interface UpdateServiceRequest {
  service_name?: string
  service_description?: string
  title?: string
  description?: string
  kind?: ServiceKind
  cost?: number
  rush?: boolean
  departure?: string | null
  destination?: string | null
  collateral?: number
  payment_type?: PaymentType
  status?: ServiceStatus
  photos?: string[]
}

/**
 * Service search/filter parameters
 */
export interface ServiceSearchParams {
  page?: number
  pageSize?: number
  search?: string
  kind?: string
  minCost?: number
  maxCost?: number
  paymentType?: string
  sortBy?: "timestamp" | "cost" | "service_name"
  sortOrder?: "asc" | "desc"
  language_codes?: string
  contractor?: string
  user?: string
}

/**
 * Service photo upload response
 */
export interface ServicePhotoUploadResponse extends ApiResponse<{
  result: string
  photos: Array<{
    resource_id: string
    url: string
  }>
}> {}

/**
 * Service analytics response
 */
export interface ServiceAnalyticsResponse extends ApiResponse<{
  services: Array<{
    service_id: string
    service_name: string
    views: number
    unique_viewers: number
  }>
  total_service_views: number
  time_period: string
  user_id: string
}> {}

/**
 * Single service response
 */
export interface ServiceResponse extends ApiResponse<Service> {}

/**
 * Service list response
 */
export interface ServiceListResponse extends ApiResponse<Service[]> {}

/**
 * Paginated service list response
 */
export interface ServicePaginatedResponse extends ApiResponse<{
  data: Service[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}> {}

/**
 * Service creation response
 */
export interface ServiceCreationResponse extends ApiResponse<{
  service_id: string
}> {}

/**
 * Service update response
 */
export interface ServiceUpdateResponse extends ApiResponse<{
  result: string
}> {}

/**
 * Service view tracking response
 */
export interface ServiceViewResponse {
  message: string
}
