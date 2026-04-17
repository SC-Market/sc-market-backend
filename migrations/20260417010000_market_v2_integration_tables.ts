import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // ORDER_MARKET_ITEMS_V2 TABLE
  // ============================================================================
  // Links V1 orders to V2 listings with variant information
  // This is a JOIN TABLE connecting V2 listings to V1 orders system
  await knex.schema.createTable('order_market_items_v2', (table) => {
    table.uuid('order_item_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('item_id').notNullable();
    table.uuid('variant_id').notNullable();
    table.integer('quantity').notNullable();
    table.bigInteger('price_per_unit').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Foreign keys to V2 tables
    table.foreign('listing_id')
      .references('listing_id')
      .inTable('listings');
    table.foreign('item_id')
      .references('item_id')
      .inTable('listing_items');
    table.foreign('variant_id')
      .references('variant_id')
      .inTable('item_variants');
    
    // Note: order_id references V1 orders table (not created in this migration)
    // The V1 orders table should already exist in the database
    
    // Check constraints
    table.check(
      'quantity > 0',
      [],
      'chk_order_market_items_v2_quantity'
    );
    table.check(
      'price_per_unit > 0',
      [],
      'chk_order_market_items_v2_price'
    );
    
    // Indexes
    table.index(['order_id'], 'idx_order_market_items_v2_order');
    table.index(['listing_id'], 'idx_order_market_items_v2_listing');
    table.index(['variant_id'], 'idx_order_market_items_v2_variant');
  });

  await knex.raw(`
    COMMENT ON TABLE order_market_items_v2 IS 'JOIN TABLE linking V1 orders to V2 listings with variant tracking'
  `);
  await knex.raw(`
    COMMENT ON COLUMN order_market_items_v2.price_per_unit IS 'Snapshot of variant price at time of purchase'
  `);
  await knex.raw(`
    COMMENT ON COLUMN order_market_items_v2.order_id IS 'References V1 orders table (existing)'
  `);

  // ============================================================================
  // CART_ITEMS_V2 TABLE
  // ============================================================================
  // Shopping cart for V2 users with variant selection
  // This replaces V1 cart for users with V2 feature flag enabled
  await knex.schema.createTable('cart_items_v2', (table) => {
    table.uuid('cart_item_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('listing_id').notNullable();
    table.uuid('item_id').notNullable();
    table.uuid('variant_id').notNullable();
    table.integer('quantity').notNullable();
    table.bigInteger('price_per_unit').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Foreign keys to V2 tables
    table.foreign('listing_id')
      .references('listing_id')
      .inTable('listings')
      .onDelete('CASCADE');
    table.foreign('item_id')
      .references('item_id')
      .inTable('listing_items')
      .onDelete('CASCADE');
    table.foreign('variant_id')
      .references('variant_id')
      .inTable('item_variants');
    
    // Note: user_id references V1 accounts table (not created in this migration)
    // The V1 accounts/users table should already exist in the database
    
    // Unique constraint: one cart entry per user/listing/variant combination
    table.unique(['user_id', 'listing_id', 'variant_id'], {
      indexName: 'uq_cart_items_v2_user_listing_variant'
    });
    
    // Check constraints
    table.check(
      'quantity > 0',
      [],
      'chk_cart_items_v2_quantity'
    );
    table.check(
      'price_per_unit > 0',
      [],
      'chk_cart_items_v2_price'
    );
    
    // Indexes
    table.index(['user_id'], 'idx_cart_items_v2_user');
    table.index(['listing_id'], 'idx_cart_items_v2_listing');
    table.index(['variant_id'], 'idx_cart_items_v2_variant');
  });

  await knex.raw(`
    COMMENT ON TABLE cart_items_v2 IS 'Shopping cart for V2 users with variant-specific item selection'
  `);
  await knex.raw(`
    COMMENT ON COLUMN cart_items_v2.price_per_unit IS 'Snapshot of variant price at time of add-to-cart'
  `);
  await knex.raw(`
    COMMENT ON COLUMN cart_items_v2.user_id IS 'References V1 accounts/users table (existing)'
  `);

  // ============================================================================
  // BUY_ORDERS_V2 TABLE
  // ============================================================================
  // Buyer requests with quality tier requirements
  await knex.schema.createTable('buy_orders_v2', (table) => {
    table.uuid('buy_order_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('buyer_id').notNullable();
    table.uuid('game_item_id').notNullable();
    table.integer('quality_tier_min');
    table.integer('quality_tier_max');
    table.jsonb('desired_attributes');
    table.bigInteger('price_min');
    table.bigInteger('price_max');
    table.integer('quantity_desired').notNullable();
    table.string('status', 20).notNullable().defaultTo('active');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    
    // Note: buyer_id references V1 accounts table (not created in this migration)
    // Note: game_item_id references V1 game_items table (not created in this migration)
    
    // Check constraints
    table.check(
      "status IN ('active', 'fulfilled', 'cancelled', 'expired')",
      [],
      'chk_buy_orders_v2_status'
    );
    table.check(
      'quality_tier_min >= 1 AND quality_tier_min <= 5',
      [],
      'chk_buy_orders_v2_quality_tier_min'
    );
    table.check(
      'quality_tier_max >= 1 AND quality_tier_max <= 5',
      [],
      'chk_buy_orders_v2_quality_tier_max'
    );
    table.check(
      'quality_tier_min <= quality_tier_max',
      [],
      'chk_buy_orders_v2_quality_tier_range'
    );
    table.check(
      'price_min <= price_max',
      [],
      'chk_buy_orders_v2_price_range'
    );
    table.check(
      'quantity_desired > 0',
      [],
      'chk_buy_orders_v2_quantity_desired'
    );
    table.check(
      'price_min >= 0',
      [],
      'chk_buy_orders_v2_price_min'
    );
    table.check(
      'price_max >= 0',
      [],
      'chk_buy_orders_v2_price_max'
    );
    
    // Indexes
    table.index(['buyer_id'], 'idx_buy_orders_v2_buyer');
    table.index(['game_item_id'], 'idx_buy_orders_v2_game_item');
    table.index(['status'], 'idx_buy_orders_v2_status');
    table.index(['game_item_id', 'status'], 'idx_buy_orders_v2_game_item_status');
  });

  await knex.raw(`
    COMMENT ON TABLE buy_orders_v2 IS 'Buyer requests with quality tier requirements for matching with V2 listings'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.quality_tier_min IS 'Minimum acceptable quality tier (1-5)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.quality_tier_max IS 'Maximum quality tier (1-5)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.desired_attributes IS 'Additional variant attribute requirements (JSONB)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.buyer_id IS 'References V1 accounts/users table (existing)'
  `);
  await knex.raw(`
    COMMENT ON COLUMN buy_orders_v2.game_item_id IS 'References V1 game_items table (existing)'
  `);

  // Create GIN index on desired_attributes JSONB field
  await knex.raw(`
    CREATE INDEX idx_buy_orders_v2_desired_attributes ON buy_orders_v2 USING GIN (desired_attributes)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('buy_orders_v2');
  await knex.schema.dropTableIfExists('cart_items_v2');
  await knex.schema.dropTableIfExists('order_market_items_v2');
}
