/**
 * Supplier Relationship Types
 *
 * Types for the supplier roster feature — aggregators maintaining a list of
 * trusted/approved suppliers with tier, notes, and status tracking.
 */

export type SupplierTier = 'preferred' | 'approved' | 'restricted'
export type SupplierStatus = 'active' | 'suspended' | 'removed'

/** Minimal profile shape for either a user or contractor org */
export interface SupplierEntityInfo {
  id: string
  username: string
  display_name: string
  avatar?: string | null
  /** 'user' | 'contractor' */
  kind: 'user' | 'contractor'
  /** Contractor spectrum_id, only present when kind = 'contractor' */
  spectrum_id?: string
}

export interface SupplierRelationship {
  relationship_id: string
  aggregator: SupplierEntityInfo
  supplier: SupplierEntityInfo
  tier?: SupplierTier | null
  notes?: string | null
  status: SupplierStatus
  created_at: string
  updated_at: string
}

/** Request to add a supplier to your roster */
export interface AddSupplierRequest {
  /** UUID of user to add as supplier (mutually exclusive with supplier_contractor_id) */
  supplier_id?: string
  /** UUID of contractor org to add as supplier (mutually exclusive with supplier_id) */
  supplier_contractor_id?: string
  tier?: SupplierTier
  notes?: string
}

/** Request to update an existing supplier relationship */
export interface UpdateSupplierRequest {
  tier?: SupplierTier | null
  notes?: string | null
  status?: SupplierStatus
}

export interface GetSuppliersResponse {
  suppliers: SupplierRelationship[]
  total: number
  page: number
  page_size: number
}

export interface AddSupplierResponse {
  relationship: SupplierRelationship
}

export interface UpdateSupplierResponse {
  relationship: SupplierRelationship
}
