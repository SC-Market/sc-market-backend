import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create variant_types table first (referenced by item_variants)
  await knex.schema.createTable("variant_types", (table) => {
    table.uuid("variant_type_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("name", 100).notNullable().unique()
    table.string("display_name", 200).notNullable()
    table.text("description")

    // Behavior flags
    table.boolean("affects_pricing").notNullable().defaultTo(true)
    table.boolean("searchable").notNullable().defaultTo(true)
    table.boolean("filterable").notNullable().defaultTo(true)

    // Validation rules
    table
      .enum("value_type", ["integer", "decimal", "string", "enum"], {
        useNative: true,
        enumName: "variant_value_type",
      })
      .notNullable()
    table.decimal("min_value", 10, 2)
    table.decimal("max_value", 10, 2)
    table.jsonb("allowed_values")

    // Display configuration
    table.integer("display_order").notNullable().defaultTo(0)
    table.string("icon", 100)

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())

    // Indexes
    table.index("searchable", "idx_variant_types_searchable", {
      predicate: knex.whereRaw("searchable = true"),
    })

    // Table comment
    table.comment("Defines available variant attribute types and validation rules")
  })

  // Seed variant_types with initial data
  await knex("variant_types").insert([
    {
      name: "quality_tier",
      display_name: "Quality Tier",
      value_type: "integer",
      min_value: 1,
      max_value: 5,
      allowed_values: JSON.stringify(["1", "2", "3", "4", "5"]),
      display_order: 1,
    },
    {
      name: "quality_value",
      display_name: "Quality Value",
      value_type: "decimal",
      min_value: 0,
      max_value: 100,
      display_order: 2,
    },
    {
      name: "crafted_source",
      display_name: "Source",
      value_type: "enum",
      allowed_values: JSON.stringify(["crafted", "store", "looted", "unknown"]),
      display_order: 3,
    },
    {
      name: "blueprint_tier",
      display_name: "Blueprint Tier",
      value_type: "integer",
      min_value: 1,
      max_value: 5,
      allowed_values: JSON.stringify(["1", "2", "3", "4", "5"]),
      display_order: 4,
    },
  ])

  // Create listings table (unified listing model)
  await knex.schema.createTable("listings", (table) => {
    table.uuid("listing_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("seller_id").notNullable()
    table
      .enum("seller_type", ["user", "contractor"], {
        useNative: true,
        enumName: "seller_type_enum",
      })
      .notNullable()

    // Listing metadata
    table.string("title", 500).notNullable()
    table.text("description")
    table
      .enum("status", ["active", "sold", "expired", "cancelled"], {
        useNative: true,
        enumName: "listing_status_enum",
      })
      .notNullable()
      .defaultTo("active")
    table
      .enum("visibility", ["public", "private", "unlisted"], {
        useNative: true,
        enumName: "listing_visibility_enum",
      })
      .notNullable()
      .defaultTo("public")

    // Sale configuration
    table
      .enum("sale_type", ["fixed", "auction", "negotiable"], {
        useNative: true,
        enumName: "sale_type_enum",
      })
      .notNullable()
      .defaultTo("fixed")

    // Listing type (replaces V1's 3 separate tables)
    table
      .enum("listing_type", ["single", "bundle", "bulk"], {
        useNative: true,
        enumName: "listing_type_enum",
      })
      .notNullable()
      .defaultTo("single")

    // Timestamps
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("expires_at")

    // Indexes
    table.index(["seller_id", "seller_type"], "idx_listings_seller")
    table.index(["status", "created_at"], "idx_listings_status_created", {
      predicate: knex.whereRaw("status = 'active'"),
    })

    // Table comment
    table.comment("Unified listing table for V2 system - replaces V1 separate tables")
  })

  // Create listing_items table (items being sold in listings)
  await knex.schema.createTable("listing_items", (table) => {
    table.uuid("item_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table
      .uuid("listing_id")
      .notNullable()
      .references("listing_id")
      .inTable("listings")
      .onDelete("CASCADE")
    table.uuid("game_item_id").notNullable()
    // Note: game_item_id references game_items table which exists in V1 schema

    // Pricing strategy
    table
      .enum("pricing_mode", ["unified", "per_variant"], {
        useNative: true,
        enumName: "pricing_mode_enum",
      })
      .notNullable()
      .defaultTo("unified")
    table.bigInteger("base_price")

    // Display order (for bundles)
    table.integer("display_order").defaultTo(0)

    // Denormalized fields (updated by trigger)
    table.integer("quantity_available").notNullable().defaultTo(0)
    table.integer("variant_count").notNullable().defaultTo(0)

    // Indexes
    table.index("listing_id", "idx_listing_items_listing")
    table.index("game_item_id", "idx_listing_items_game_item")

    // Table comment
    table.comment("Items being sold in listings with pricing configuration")
  })

  // Create item_variants table (unique combinations of variant attributes)
  await knex.schema.createTable("item_variants", (table) => {
    table.uuid("variant_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("game_item_id").notNullable()
    // Note: game_item_id references game_items table which exists in V1 schema

    // Variant attributes (flexible JSONB for future attributes)
    table.jsonb("attributes").notNullable()

    // Computed hash for uniqueness (generated column)
    table.specificType(
      "attributes_hash",
      "VARCHAR(64) GENERATED ALWAYS AS (encode(digest(attributes::text, 'sha256'), 'hex')) STORED"
    )

    // Display names (auto-generated)
    table.string("display_name", 200)
    table.string("short_name", 100)

    // Pricing modifiers (optional)
    table.decimal("base_price_modifier", 5, 2)
    table.bigInteger("fixed_price_override")

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())

    // Constraints
    table.unique(["game_item_id", "attributes_hash"], {
      indexName: "uq_item_variants_game_item_hash",
    })

    // Indexes
    table.index("game_item_id", "idx_item_variants_game_item")
    table.index("attributes", "idx_item_variants_attributes", {
      indexType: "GIN",
    })

    // Table comment
    table.comment("Unique combinations of variant attributes for game items")
  })

  // Create stock_lots table (physical inventory with variants)
  await knex.schema.createTable("stock_lots", (table) => {
    table.uuid("lot_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table
      .uuid("item_id")
      .notNullable()
      .references("item_id")
      .inTable("listing_items")
      .onDelete("CASCADE")
    table
      .uuid("variant_id")
      .notNullable()
      .references("variant_id")
      .inTable("item_variants")

    // Quantity
    table.integer("quantity_total").notNullable().checkPositive()

    // Location & ownership
    table.uuid("location_id")
    // Note: location_id references locations table which exists in V1 schema
    table.uuid("owner_id")
    // Note: owner_id references accounts table which exists in V1 schema

    // Status
    table.boolean("listed").notNullable().defaultTo(true)
    table.string("notes", 1000)

    // Crafting metadata (if applicable)
    table.uuid("crafted_by")
    // Note: crafted_by references accounts table which exists in V1 schema
    table.timestamp("crafted_at")

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())

    // Indexes
    table.index("item_id", "idx_stock_lots_item")
    table.index("variant_id", "idx_stock_lots_variant")
    table.index("location_id", "idx_stock_lots_location")
    table.index("listed", "idx_stock_lots_listed", {
      predicate: knex.whereRaw("listed = true"),
    })

    // Table comment
    table.comment("Physical inventory units with specific variant attributes")
  })

  // Create variant_pricing table (per-variant pricing)
  await knex.schema.createTable("variant_pricing", (table) => {
    table.uuid("pricing_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table
      .uuid("item_id")
      .notNullable()
      .references("item_id")
      .inTable("listing_items")
      .onDelete("CASCADE")
    table
      .uuid("variant_id")
      .notNullable()
      .references("variant_id")
      .inTable("item_variants")
      .onDelete("CASCADE")
    table.bigInteger("price").notNullable()

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())

    // Constraints
    table.unique(["item_id", "variant_id"], {
      indexName: "uq_variant_pricing_item_variant",
    })

    // Indexes
    table.index("item_id", "idx_variant_pricing_item")

    // Table comment
    table.comment("Per-variant pricing when pricing_mode = per_variant")
  })
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order to respect foreign key constraints
  await knex.schema.dropTableIfExists("variant_pricing")
  await knex.schema.dropTableIfExists("stock_lots")
  await knex.schema.dropTableIfExists("item_variants")
  await knex.schema.dropTableIfExists("listing_items")
  await knex.schema.dropTableIfExists("listings")
  await knex.schema.dropTableIfExists("variant_types")

  // Drop custom enum types
  await knex.raw("DROP TYPE IF EXISTS variant_value_type CASCADE")
  await knex.raw("DROP TYPE IF EXISTS seller_type_enum CASCADE")
  await knex.raw("DROP TYPE IF EXISTS listing_status_enum CASCADE")
  await knex.raw("DROP TYPE IF EXISTS listing_visibility_enum CASCADE")
  await knex.raw("DROP TYPE IF EXISTS sale_type_enum CASCADE")
  await knex.raw("DROP TYPE IF EXISTS listing_type_enum CASCADE")
  await knex.raw("DROP TYPE IF EXISTS pricing_mode_enum CASCADE")
}
