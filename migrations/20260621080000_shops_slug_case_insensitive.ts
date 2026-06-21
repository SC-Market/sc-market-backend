import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Lowercase all existing slugs
  await knex.raw(`UPDATE shops SET slug = LOWER(slug) WHERE slug != LOWER(slug)`)

  // Change slug column to citext for case-insensitive uniqueness
  await knex.raw(`ALTER TABLE shops ALTER COLUMN slug TYPE citext`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE shops ALTER COLUMN slug TYPE varchar(50)`)
}
