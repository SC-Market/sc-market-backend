import type { Knex } from "knex"

/**
 * Adds item-anchored line items for supplier requisition orders.
 *
 * requisition_items:
 *   Line items for orders where kind = 'requisition'.
 *   Anchored to game_item (not listing) — the supplier decides which listing to fulfil from.
 *
 * offer_requisition_items:
 *   Item-anchored counterpart to offer_market_items for offer negotiations on requisitions.
 *   listing_id is optional: if set, it's the listing the supplier intends to use (informational only).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("requisition_items", (table) => {
    table.uuid("requisition_item_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("order_id").notNullable()
      .references("order_id").inTable("orders").onDelete("CASCADE")
    table.uuid("game_item_id").notNullable()
      .references("id").inTable("game_items").onDelete("RESTRICT")
    table.integer("quantity").notNullable()
    table.bigInteger("price_per_unit").notNullable()
    table.integer("fulfilled_quantity").notNullable().defaultTo(0)
    table.integer("quality_tier_min").nullable()
    table.integer("quality_tier_max").nullable()
    table.string("game_item_name", 200).nullable()  // snapshotted at order creation
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.check("quantity > 0",                      [], "chk_req_items_quantity")
    table.check("price_per_unit >= 0",               [], "chk_req_items_price")
    table.check("fulfilled_quantity >= 0",           [], "chk_req_items_fulfilled")
    table.check("fulfilled_quantity <= quantity",    [], "chk_req_items_fulfilled_lte")
  })

  await knex.schema.table("requisition_items", (table) => {
    table.index(["order_id"],     "idx_req_items_order")
    table.index(["game_item_id"], "idx_req_items_game_item")
  })

  // Item-anchored offer line items (complement offer_market_items for requisition negotiations)
  await knex.schema.createTable("offer_requisition_items", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    // References the specific offer revision (order_offers.id), not the session
    table.uuid("offer_id").notNullable()
      .references("id").inTable("order_offers").onDelete("CASCADE")
    table.uuid("game_item_id").notNullable()
      .references("id").inTable("game_items").onDelete("RESTRICT")
    table.integer("quantity").notNullable()
    table.bigInteger("price_per_unit").notNullable()
    // Optional: listing the supplier intends to fulfil from
    table.uuid("listing_id").nullable()
      .references("listing_id").inTable("listings").onDelete("SET NULL")
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.check("quantity > 0",      [], "chk_offer_req_items_quantity")
    table.check("price_per_unit >= 0", [], "chk_offer_req_items_price")
  })

  await knex.schema.table("offer_requisition_items", (table) => {
    table.index(["offer_id"],     "idx_offer_req_items_offer")
    table.index(["game_item_id"], "idx_offer_req_items_game_item")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("offer_requisition_items")
  await knex.schema.dropTableIfExists("requisition_items")
}
