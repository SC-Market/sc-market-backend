/**
 * Who sells through a shop: its owning org, or else its owning user. The
 * seller_id / seller_type pair listings and orders store, and the branch
 * every "whose shop is this" check takes.
 */
export type ShopSeller =
  | { type: "contractor"; id: string }
  | { type: "user"; id: string }

export function shopSeller(shop: {
  owner_user_id: string | null
  owner_contractor_id: string | null
}): ShopSeller {
  if (shop.owner_contractor_id)
    return { type: "contractor", id: shop.owner_contractor_id }
  // A shop has exactly one owner (DB check), so this is set.
  return { type: "user", id: shop.owner_user_id! }
}
