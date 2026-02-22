/**
 * Contracts API Type Definitions
 * Models for public contract management
 */

import { PaymentTypes } from "../routes/v1/types/payment-types.js"

/**
 * Create public contract request
 */
export interface CreateContractRequest {
  /** Contract title */
  title: string
  /** Contract description */
  description: string
  /** Departure location */
  departure: string
  /** Destination location */
  destination: string
  /** Contract cost as string (decimal) */
  cost: string
  /** Payment type */
  payment_type: "one-time" | "hourly" | "daily"
  /** Contract kind/type */
  kind: string
  /** Collateral amount as string (decimal) */
  collateral: string
}

/**
 * Create offer on contract request
 */
export interface CreateContractOfferRequest {
  /** Offer title */
  title: string
  /** Offer description */
  description: string
  /** Offer cost as string (decimal) */
  cost: string
  /** Payment type */
  payment_type: "one-time" | "hourly" | "daily"
  /** Offer kind/type */
  kind: string
  /** Collateral amount as string (decimal) */
  collateral?: string
  /** Optional contractor spectrum ID (for contractor offers) */
  contractor?: string
}

/**
 * Public contract response
 */
export interface ContractResponse {
  id: string
  title: string
  description: string
  departure: string
  destination: string
  kind: string
  cost: string
  payment_type: PaymentTypes
  collateral: string
  customer_id: string
  timestamp: string
  status: string
  expiration: string
  customer?: any
}

/**
 * Create contract response
 */
export interface CreateContractResponse {
  contract_id: string
}

/**
 * Create contract offer response
 */
export interface CreateContractOfferResponse {
  session_id: string
  discord_invite?: string
}

/**
 * List contracts response
 */
export interface ContractsListResponse {
  contracts: ContractResponse[]
}
