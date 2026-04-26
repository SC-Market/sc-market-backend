import type { Knex } from "knex"

/**
 * Create auction_details_v2 and bids_v2 tables for V2 auction support.
 * See docs/v2-auction-feature-parity.md for full design.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("auction_details_v2", (table) => {
    table.uuid("listing_id").primary()
    table.foreign("listing_id").references("listing_id").inTable("listings").onDelete("CASCADE")
    table.timestamp("end_time", { useTz: true }).notNullable()
    table.bigInteger("min_bid_increment").notNullable().defaultTo(1000)
    table.bigInteger("buyout_price").nullable()
    table.bigInteger("reserve_price").nullable()
    table.string("status", 20).notNullable().defaultTo("active")
    table.uuid("winner_id").nullable()
    table.bigInteger("winning_bid").nullable()
    table.timestamp("concluded_at", { useTz: true }).nullable()
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.check("min_bid_increment >= 1", [], "chk_auction_min_bid_increment")
    table.check("status IN ('active', 'concluded', 'cancelled', 'no_bids')", [], "chk_auction_status")

    table.index(["status"], "idx_auction_details_v2_status")
  })

  // Partial index for active auctions by end_time (used by timer polling)
  await knex.raw(`CREATE INDEX idx_auction_details_v2_end_time ON auction_details_v2(end_time) WHERE status = 'active'`)

  await knex.schema.createTable("bids_v2", (table) => {
    table.uuid("bid_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("listing_id").notNullable()
    table.foreign("listing_id").references("listing_id").inTable("listings").onDelete("CASCADE")
    table.uuid("bidder_id").notNullable()
    table.string("bidder_type", 20).notNullable().defaultTo("user")
    table.uuid("contractor_id").nullable()
    table.bigInteger("amount").notNullable()
    table.boolean("is_active").notNullable().defaultTo(true)
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.check("amount > 0", [], "chk_bids_v2_amount")
    table.check("bidder_type IN ('user', 'contractor')", [], "chk_bids_v2_bidder_type")

    table.index(["bidder_id"], "idx_bids_v2_bidder")
  })

  // Partial indexes for active bids
  await knex.raw(`CREATE INDEX idx_bids_v2_listing_active ON bids_v2(listing_id) WHERE is_active = true`)
  await knex.raw(`CREATE UNIQUE INDEX idx_bids_v2_one_active_per_user ON bids_v2(listing_id, bidder_id) WHERE is_active = true`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("bids_v2")
  await knex.schema.dropTableIfExists("auction_details_v2")
}
