import type { Knex } from "knex";

/**
 * Revert: Remove V2 columns added to V1 orders table
 *
 * The columns offer_amount, buyer_note, discord_invite, session_id were added
 * to the V1 orders table in 20260416211802_market_v2_cart_feature_parity but
 * are never written by any V2 code. V2 stores buyer_note on cart_items_v2,
 * and session_id/discord_invite come from V1 offer_sessions via createOffer.
 *
 * This restores the "don't modify old tables" design tenet.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("offer_amount");
    table.dropColumn("buyer_note");
    table.dropColumn("discord_invite");
    table.dropColumn("session_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("orders", (table) => {
    table.bigInteger("offer_amount").nullable();
    table.text("buyer_note").nullable();
    table.text("discord_invite").nullable();
    table.uuid("session_id").nullable();
  });
}
