import type { Knex } from "knex"

/**
 * Fix storefront_enquiries' subdomain CHECK (20261101120000): its regex had
 * a `?`, which knex.raw turns into a `$1` positional binding even inside a
 * string literal, so the stored pattern ended in `$1$` and refused every
 * subdomain (every enquiry insert failed). Same rule, written without `?`:
 * one DNS label, 2–63 characters, letters/digits/hyphens, no leading or
 * trailing hyphen (services/storefront/enquiries.ts checkSubdomain).
 *
 * The table is new and empty (no insert could pass), so the brief lock is
 * harmless; lock_timeout anyway. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE storefront_enquiries
      DROP CONSTRAINT IF EXISTS storefront_enquiries_requested_subdomain_check
  `)
  await knex.raw(`
    ALTER TABLE storefront_enquiries
      ADD CONSTRAINT storefront_enquiries_requested_subdomain_check
      CHECK (requested_subdomain ~ '^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$')
  `)
}

export async function down(): Promise<void> {
  // The previous constraint was broken; nothing to restore.
}
