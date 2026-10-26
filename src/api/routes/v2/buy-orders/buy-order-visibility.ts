/**
 * Who may see a standing buy order (buy_orders_v2.visibility):
 * - 'public'      — everyone, anonymous visitors included;
 * - 'roster_only' — suppliers on the buyer's active roster
 *                   (supplier_relationships, as a user or through an org);
 * - 'private'     — the one supplier it is directed at (target_supplier_id,
 *                   or a member of target_supplier_contractor_id).
 * The buyer always sees their own orders.
 *
 * The same rule decides who may fulfill (fulfillment-rules.ts), so a supplier
 * who can fulfill an order can also find and open it.
 */

import type { Knex } from "knex"

/** `where` callback over `buy_orders_v2 as bo`. */
export function buyOrderVisibleTo(
  db: Knex,
  viewerUserId: string | undefined,
): (this: Knex.QueryBuilder) => void {
  return function () {
    if (!viewerUserId) {
      this.where("bo.visibility", "public")
      return
    }
    const viewerOrgs = db("contractor_members")
      .select("contractor_id")
      .where("user_id", viewerUserId)
    this.where("bo.visibility", "public")
      .orWhere("bo.buyer_id", viewerUserId)
      .orWhere(function () {
        this.where("bo.visibility", "roster_only").whereExists(function () {
          this.select(db.raw("1"))
            .from("supplier_relationships as sr")
            .where("sr.status", "active")
            .whereRaw("sr.aggregator_id = bo.buyer_id")
            .where(function () {
              this.where("sr.supplier_id", viewerUserId).orWhereIn(
                "sr.supplier_contractor_id",
                viewerOrgs.clone(),
              )
            })
        })
      })
      .orWhere(function () {
        this.where("bo.visibility", "private").where(function () {
          this.where("bo.target_supplier_id", viewerUserId).orWhereIn(
            "bo.target_supplier_contractor_id",
            viewerOrgs.clone(),
          )
        })
      })
  }
}
