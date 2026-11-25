import type { Knex } from "knex"
import {
  decodeHtmlEntities,
  HTML_ENTITY_PATTERN,
} from "../src/clients/rsi/text.js"

/**
 * Org names scraped from RSI were stored with their HTML entities still
 * encoded ("Crash&rsquo;s Candy Shop", "Rock &amp; Stone"): fetchRSIOrgDirect
 * cut the name out of the raw markup without decoding it (fixed alongside
 * this migration). Decode the entities in the names already stored, once.
 *
 * - contractors.name: the RSI name, set at verification.
 * - shops.name: an org's shop took the org's name (20260621020000).
 *
 * Plain-text columns only. Descriptions are markdown, which already renders
 * entities as characters, and decoding "&lt;" there would turn text into
 * markup.
 *
 * Only rows whose name holds an entity reference are read, and each changed
 * row is updated by primary key: row locks only, no ALTER.
 * Safe to run twice: a decoded name has nothing left to match (only a name
 * RSI itself double-encoded would keep a literal entity, and none of the
 * live names is one: the public lists showed one affected org, CANDYSHOP,
 * "Crash&rsquo;s Candy Shop", and no shops). Neither
 * name column is unique; if a unique index on one ever exists, the table is
 * skipped and logged rather than risking a collision.
 */
const TARGETS = [
  { table: "contractors", key: "contractor_id" },
  { table: "shops", key: "id" },
] as const

async function hasUniqueNameIndex(knex: Knex, table: string): Promise<boolean> {
  const result = await knex.raw<{ rows: unknown[] }>(
    `SELECT 1
       FROM pg_index i
       JOIN pg_class t ON t.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
      WHERE n.nspname = current_schema()
        AND t.relname = ?
        AND a.attname = 'name'
        AND i.indisunique
      LIMIT 1`,
    [table],
  )
  return result.rows.length > 0
}

export async function up(knex: Knex): Promise<void> {
  for (const { table, key } of TARGETS) {
    if (!(await knex.schema.hasTable(table))) continue
    if (await hasUniqueNameIndex(knex, table)) {
      console.warn(
        `[decode_rsi_org_name_entities] ${table}.name has a unique index; skipped`,
      )
      continue
    }

    const rows: { id: string; name: string }[] = await knex(table)
      .select({ id: key, name: "name" })
      .whereRaw(
        `name ~ '&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);'`,
      )

    const changes = rows
      .filter((row) => HTML_ENTITY_PATTERN.test(row.name))
      .map((row) => ({ id: row.id, from: row.name, name: decodeHtmlEntities(row.name).trim() }))
      .filter((row) => row.name && row.name !== row.from)

    // A handful of rows: one UPDATE per row, by primary key.
    for (const change of changes) {
      await knex(table).where(key, change.id).update({ name: change.name })
    }
    console.log(
      `[decode_rsi_org_name_entities] ${table}: ${changes.length} of ${rows.length} matching names decoded`,
    )
  }
}

export async function down(): Promise<void> {
  // Re-encoding would bring the bug back; nothing to undo.
}
