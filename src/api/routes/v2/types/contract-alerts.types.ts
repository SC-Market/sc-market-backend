/** Opt-in alerts for new public contracts. */

/** The contract kinds the site offers (frontend orderIcons). */
export type ContractKind =
  | "Support"
  | "Escort"
  | "Transport"
  | "Construction"
  | "Resource Acquisition"
  | "Rental"
  | "Delivery"
  | "Medical"
  | "Intelligence Services"
  | "Misc"
  | "Custom"

export interface ContractAlertSubscription {
  /** null: personal; otherwise an org the user belongs to. */
  contractor_id: string | null
  /** Only these kinds; null: every kind. */
  kinds: ContractKind[] | null
}

export interface ContractAlertScope {
  contractor_id: string | null
  name: string
}

export interface ContractAlertsResponse {
  /** Alerts are off unless a subscription exists for the scope. */
  subscriptions: ContractAlertSubscription[]
  scopes: ContractAlertScope[]
  kinds: ContractKind[]
}

export interface UpdateContractAlertRequest {
  contractor_id?: string | null
  enabled: boolean
  /** Only these kinds; omit or null for every kind. */
  kinds?: ContractKind[] | null
}
