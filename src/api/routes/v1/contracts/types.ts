import { PaymentTypes } from "../profiles/types.js"

export interface DBPublicContract {
  id: string
  // rush: boolean
  departure: string
  destination: string
  kind: string
  cost: string
  payment_type: PaymentTypes
  collateral: string
  title: string
  description: string
  customer_id: string
  timestamp: Date
  status: string
  expiration: Date
}

export interface DBContractOffer {
  contract_id: string
  session_id: string
}
