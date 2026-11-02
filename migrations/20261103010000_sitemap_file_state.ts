import type { Knex } from "knex"

/**
 * sitemap_file_state: per sitemap file key (e.g. "static-0", "wiki-1"), the
 * hash of its URL entries and when they last changed
 * (services/sitemap/sitemap-file-state.ts). The sitemap index dates files
 * whose URLs carry no lastmod by last_changed_at, which only moves when the
 * hash does, so a deploy or restart no longer resets it.
 *
 * Additive: one new, empty table (rebuilt by the sitemap on its next build).
 * Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sitemap_file_state (
      file_key TEXT PRIMARY KEY CHECK (file_key ~ '^[a-z]+(-[a-z]+)*-[0-9]{1,3}$'),
      content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
      last_changed_at TIMESTAMPTZ NOT NULL
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS sitemap_file_state")
}
