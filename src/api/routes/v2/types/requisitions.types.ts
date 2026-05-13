/**
 * Requisition Order Types
 *
 * Types for supplier requisition orders — orders where line items are anchored
 * to game items (not listings). Suppliers decide which listing to fulfil from.
 *
 * A requisition order has orders.kind = 'requisition' and its line items live in
 * requisition_items instead of market_orders / order_market_items_v2.
 */

export interface RequisitionLineItem {
  requisition_item_id: string
  game_item_id: string
  game_item_name: string
  quantity: number
  price_per_unit: number
  fulfilled_quantity: number
  quality_tier_min?: number | null
  quality_tier_max?: number | null
}

export interface CreateRequisitionRequest {
  /** UUID of target supplier user (mutually exclusive with target_contractor_id) */
  target_supplier_id?: string
  /** UUID of target supplier contractor org */
  target_contractor_id?: string
  title: string
  description?: string
  items: CreateRequisitionItem[]
  /** Link to an existing buy order that triggered this requisition (optional) */
  buy_order_id?: string
}

export interface CreateRequisitionItem {
  game_item_id: string
  quantity: number
  price_per_unit: number
  quality_tier_min?: number
  quality_tier_max?: number
}

export interface CreateRequisitionResponse {
  order_id: string
  offer_session_id: string
  status: string
  items: RequisitionLineItem[]
  created_at: string
}

export interface RequisitionDetail {
  order_id: string
  offer_session_id?: string | null
  status: string
  kind: 'requisition'
  title: string
  description: string
  buyer: { user_id: string; username: string; display_name: string; avatar?: string | null }
  supplier: { user_id: string; username: string; display_name: string; avatar?: string | null } | null
  supplier_contractor: { contractor_id: string; spectrum_id: string; name: string; avatar?: string | null } | null
  items: RequisitionLineItem[]
  total_price: number
  created_at: string
  updated_at: string
}

export interface GetRequisitionsResponse {
  requisitions: RequisitionDetail[]
  total: number
  page: number
  page_size: number
}

/** Item-anchored line item inside an offer negotiation on a requisition */
export interface OfferRequisitionItem {
  id: string
  offer_id: string
  game_item_id: string
  game_item_name: string
  quantity: number
  price_per_unit: number
  /** Optional: listing the supplier plans to fulfil from */
  listing_id?: string | null
  listing_title?: string | null
}

/** Request body for creating or updating offer_requisition_items on an offer */
export interface SetOfferRequisitionItemsRequest {
  offer_id: string
  items: OfferRequisitionItemInput[]
}

export interface OfferRequisitionItemInput {
  game_item_id: string
  quantity: number
  price_per_unit: number
  listing_id?: string
}
