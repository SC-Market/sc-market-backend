import type { Knex } from "knex";

/**
 * Migration: Market V2 Cart Feature Parity
 * 
 * Adds missing fields to achieve feature parity with V1 cart:
 * - seller_id: Support multi-seller carts
 * - buyer_note: Support order notes per seller
 * - offer_amount: Support counter-offers
 * - discord_invite: Support Discord invites on purchase
 * - session_id: Support navigation to offer page
 */
export async function up(knex: Knex): Promise<void> {
  // Add seller_id to cart_items_v2 for multi-seller support
  await knex.schema.alterTable("cart_items_v2", (table) => {
    table.uuid("seller_id").references("user_id").inTable("accounts");
    table.index("seller_id", "idx_cart_items_v2_seller_id");
    table.comment("Seller ID for grouping cart items by seller");
  });

  // Add buyer_note to cart_items_v2 for per-seller notes
  await knex.schema.alterTable("cart_items_v2", (table) => {
    table.text("buyer_note").nullable();
    table.comment("Buyer's notes for this seller (Markdown supported)");
  });

  // Add offer_amount to orders for counter-offer support
  await knex.schema.alterTable("orders", (table) => {
    table.bigInteger("offer_amount").nullable();
    table.comment("Custom offer amount if different from total_price");
  });

  // Add buyer_note to orders
  await knex.schema.alterTable("orders", (table) => {
    table.text("buyer_note").nullable();
    table.comment("Buyer's notes/instructions for the seller");
  });

  // Add discord_invite to orders
  await knex.schema.alterTable("orders", (table) => {
    table.text("discord_invite").nullable();
    table.comment("Discord invite code for buyer-seller communication");
  });

  // Add session_id to orders for navigation
  await knex.schema.alterTable("orders", (table) => {
    table.uuid("session_id").nullable();
    table.comment("Session ID for offer page navigation");
  });

  // Populate seller_id for existing cart items
  await knex.raw(`
    UPDATE cart_items_v2 ci
    SET seller_id = l.seller_id
    FROM listings l
    WHERE ci.listing_id = l.listing_id
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove added columns from orders
  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("session_id");
    table.dropColumn("discord_invite");
    table.dropColumn("buyer_note");
    table.dropColumn("offer_amount");
  });

  // Remove added columns from cart_items_v2
  await knex.schema.alterTable("cart_items_v2", (table) => {
    table.dropColumn("buyer_note");
    table.dropIndex("seller_id", "idx_cart_items_v2_seller_id");
    table.dropColumn("seller_id");
  });
}

