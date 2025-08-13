/**
 * Payment types supported by the application
 * These represent different ways services can be priced and billed
 */
export enum PaymentType {
  ONE_TIME = "one-time",
  HOURLY = "hourly",
  DAILY = "daily",
  UNIT = "unit",
  BOX = "box",
  SCU = "scu",
  CSCU = "cscu",
  MSCU = "mscu",
}

/**
 * TypeScript type for payment types
 * Can be used for function parameters and return types
 */
export type PaymentTypes =
  | "one-time"
  | "hourly"
  | "daily"
  | "unit"
  | "box"
  | "scu"
  | "cscu"
  | "mscu"

/**
 * Array of all payment types for validation and iteration
 */
export const PAYMENT_TYPES: PaymentTypes[] = [
  PaymentType.ONE_TIME,
  PaymentType.HOURLY,
  PaymentType.DAILY,
  PaymentType.UNIT,
  PaymentType.BOX,
  PaymentType.SCU,
  PaymentType.CSCU,
  PaymentType.MSCU,
]

/**
 * Payment type descriptions for UI display
 */
export const PAYMENT_TYPE_DESCRIPTIONS: Record<PaymentTypes, string> = {
  [PaymentType.ONE_TIME]: "One-time payment",
  [PaymentType.HOURLY]: "Per hour",
  [PaymentType.DAILY]: "Per day",
  [PaymentType.UNIT]: "Per unit",
  [PaymentType.BOX]: "Per box",
  [PaymentType.SCU]: "Per SCU (Standard Cargo Unit)",
  [PaymentType.CSCU]: "Per cSCU (centi Standard Cargo Unit)",
  [PaymentType.MSCU]: "Per mSCU (milli Standard Cargo Unit)",
}

/**
 * Payment type labels for UI display (shorter versions)
 */
export const PAYMENT_TYPE_LABELS: Record<PaymentTypes, string> = {
  [PaymentType.ONE_TIME]: "One-time",
  [PaymentType.HOURLY]: "Hourly",
  [PaymentType.DAILY]: "Daily",
  [PaymentType.UNIT]: "Per Unit",
  [PaymentType.BOX]: "Per Box",
  [PaymentType.SCU]: "Per SCU",
  [PaymentType.CSCU]: "Per cSCU",
  [PaymentType.MSCU]: "Per mSCU",
}

/**
 * Legacy payment types (limited set used in some database models)
 * These are the original payment types before expansion
 */
export const LEGACY_PAYMENT_TYPES: PaymentTypes[] = [
  PaymentType.ONE_TIME,
  PaymentType.HOURLY,
  PaymentType.DAILY,
]

/**
 * Check if a payment type is valid
 */
export function isValidPaymentType(type: string): type is PaymentTypes {
  return PAYMENT_TYPES.includes(type as PaymentTypes)
}

/**
 * Get payment type description
 */
export function getPaymentTypeDescription(type: PaymentTypes): string {
  return PAYMENT_TYPE_DESCRIPTIONS[type]
}

/**
 * Get payment type label
 */
export function getPaymentTypeLabel(type: PaymentTypes): string {
  return PAYMENT_TYPE_LABELS[type]
}
