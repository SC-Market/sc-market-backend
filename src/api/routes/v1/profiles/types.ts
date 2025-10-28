export type PaymentTypes =
  | "one-time"
  | "hourly"
  | "daily"
  | "unit"
  | "box"
  | "scu"
  | "cscu"
  | "mscu"

export const paymentTypeMessages = new Map<PaymentTypes, string>()
paymentTypeMessages.set("one-time", "")
paymentTypeMessages.set("hourly", "per hour")
paymentTypeMessages.set("daily", "per day")
paymentTypeMessages.set("unit", "per unit")
paymentTypeMessages.set("box", "per box")
paymentTypeMessages.set("scu", "per SCU")
paymentTypeMessages.set("cscu", "per cSCU")
paymentTypeMessages.set("mscu", "per mSCU")
