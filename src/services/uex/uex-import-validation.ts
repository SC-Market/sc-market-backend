/**
 * Per-listing checks for the UEX import. A listing that fails is skipped
 * with its reason; the rest of the batch still imports.
 */

import type { UexImportSkipReason } from "../../api/routes/v2/types/listings.types.js"

export interface UexImportCandidate {
  title?: unknown
  description?: unknown
  price?: unknown
  quantity?: unknown
}

/** Why `item` can't be imported, or null when it can. */
export function uexImportSkipReason(
  item: UexImportCandidate | null | undefined,
): Exclude<UexImportSkipReason, "failed"> | null {
  if (
    !item ||
    typeof item.title !== "string" ||
    item.title.trim().length === 0 ||
    item.title.length > 500
  ) {
    return "invalid_title"
  }
  if (
    item.description != null &&
    (typeof item.description !== "string" || item.description.length > 10000)
  ) {
    return "invalid_description"
  }
  // UEX reports an unpriced listing as 0 (or nothing at all).
  if (item.price == null || item.price === 0 || item.price === "") {
    return "no_price"
  }
  if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0) {
    return "invalid_price"
  }
  if (
    item.quantity != null &&
    (typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 1_000_000)
  ) {
    return "invalid_quantity"
  }
  return null
}
