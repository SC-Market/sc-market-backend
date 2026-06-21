import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("shops", (table) => {
    table.uuid("shop_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("slug", 50).notNullable().unique()
    table.string("name", 100).notNullable()
    table.string("description", 2000).notNullable().defaultTo("")
    table
      .uuid("banner")
      .references("resource_id")
      .inTable("image_resources")
      .onDelete("SET NULL")
    table
      .uuid("logo")
      .references("resource_id")
      .inTable("image_resources")
      .onDelete("SET NULL")
    table
      .uuid("owner_user_id")
      .references("user_id")
      .inTable("accounts")
      .onDelete("SET NULL")
    table
      .uuid("owner_contractor_id")
      .references("contractor_id")
      .inTable("contractors")
      .onDelete("SET NULL")
    table.specificType("supported_languages", "TEXT[]").defaultTo(knex.raw("ARRAY['en']"))
    table.string("market_order_template", 2000).defaultTo("")
    table.string("default_pickup_method", 20).nullable()
    table
      .string("status", 20)
      .notNullable()
      .defaultTo("active")
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  await knex.raw(`
    ALTER TABLE shops ADD CONSTRAINT chk_shops_status
      CHECK (status IN ('active', 'suspended', 'archived'))
  `)

  await knex.raw(`
    ALTER TABLE shops ADD CONSTRAINT chk_shops_owner
      CHECK (
        (owner_user_id IS NOT NULL AND owner_contractor_id IS NULL) OR
        (owner_user_id IS NULL AND owner_contractor_id IS NOT NULL)
      )
  `)

  await knex.raw(`CREATE INDEX idx_shops_owner_user ON shops(owner_user_id) WHERE owner_user_id IS NOT NULL`)
  await knex.raw(`CREATE INDEX idx_shops_owner_contractor ON shops(owner_contractor_id) WHERE owner_contractor_id IS NOT NULL`)

  await knex.schema.createTable("shop_ratings", (table) => {
    table.uuid("rating_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table
      .uuid("shop_id")
      .notNullable()
      .references("shop_id")
      .inTable("shops")
      .onDelete("CASCADE")
    table.uuid("order_id").notNullable()
    table
      .uuid("reviewer_id")
      .notNullable()
      .references("user_id")
      .inTable("accounts")
      .onDelete("CASCADE")
    table.integer("rating").notNullable()
    table.text("comment").nullable()
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.unique(["order_id", "reviewer_id"])
  })

  await knex.raw(`
    ALTER TABLE shop_ratings ADD CONSTRAINT chk_shop_ratings_range
      CHECK (rating >= 1 AND rating <= 5)
  `)

  await knex.raw(`CREATE INDEX idx_shop_ratings_shop ON shop_ratings(shop_id)`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("shop_ratings")
  await knex.schema.dropTableIfExists("shops")
}
