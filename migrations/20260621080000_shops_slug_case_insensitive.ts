import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Find and resolve slug collisions before lowercasing
  // If two shops have the same slug when lowercased, append UUID suffix to all but the oldest
  await knex.raw(`
    UPDATE shops s1
    SET slug = LOWER(s1.slug) || '-' || substr(s1.shop_id::text, 1, 8)
    WHERE s1.shop_id IN (
      SELECT s2.shop_id
      FROM shops s2
      WHERE LOWER(s2.slug) IN (
        SELECT LOWER(slug) FROM shops GROUP BY LOWER(slug) HAVING COUNT(*) > 1
      )
      AND s2.shop_id != (
        SELECT s3.shop_id FROM shops s3
        WHERE LOWER(s3.slug) = LOWER(s2.slug)
        ORDER BY s3.created_at ASC
        LIMIT 1
      )
    )
  `)

  // Now safely lowercase all remaining slugs
  await knex.raw(`UPDATE shops SET slug = LOWER(slug) WHERE slug != LOWER(slug)`)

  // Change slug column to citext for case-insensitive uniqueness
  await knex.raw(`ALTER TABLE shops ALTER COLUMN slug TYPE citext`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE shops ALTER COLUMN slug TYPE varchar(50)`)
}
