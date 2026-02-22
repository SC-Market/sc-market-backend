/**
 * Deliveries API Type Definitions
 * Models for delivery management
 */

/**
 * Create delivery request
 */
export interface CreateDeliveryRequest {
  /** Departure location */
  start: string
  /** Destination location */
  end: string
  /** Order ID */
  order_id: string
  /** Ship ID */
  ship_id: string
}

/**
 * Delivery response
 */
export interface DeliveryResponse {
  id: string
  departure: string
  destination: string
  order_id: string
  ship_id: string
  progress: number
  status: string
  created_at: string
  updated_at: string
  order?: any
  ship?: any
}

/**
 * Create delivery response
 */
export interface CreateDeliveryResponse {
  result: "Success"
}

/**
 * List deliveries response
 */
export interface DeliveriesListResponse {
  deliveries: DeliveryResponse[]
}
