export class OfferMergeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = "OfferMergeError"
  }
}

export class OfferNotFoundError extends OfferMergeError {
  constructor(message: string = "One or more offer sessions not found") {
    super(message, "OFFER_NOT_FOUND", 404)
    this.name = "OfferNotFoundError"
  }
}

export class OfferNotActiveError extends OfferMergeError {
  constructor(message: string = "All offer sessions must be active") {
    super(message, "OFFER_NOT_ACTIVE", 409)
    this.name = "OfferNotActiveError"
  }
}

export class OfferValidationError extends OfferMergeError {
  constructor(
    message: string,
    public readonly validationType:
      | "DIFFERENT_CUSTOMER"
      | "DIFFERENT_CONTRACTOR"
      | "DIFFERENT_ASSIGNED"
      | "DIFFERENT_PAYMENT_TYPE"
      | "HAS_SERVICES",
  ) {
    super(message, validationType, 400)
    this.name = "OfferValidationError"
  }
}

export class OfferPermissionError extends OfferMergeError {
  constructor(
    message: string = "You do not have permission to merge these offers",
  ) {
    super(message, "OFFER_PERMISSION_DENIED", 403)
    this.name = "OfferPermissionError"
  }
}
