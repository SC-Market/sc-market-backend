import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Lock rules for new migrations (docs/migrations.md "Locks"). On 2026-10-26 a
 * migration that took ACCESS EXCLUSIVE on accounts, contractors and shops in
 * one transaction, then failed, queued the whole site behind it.
 *
 * - A transactional migration may ALTER at most one hot table: each ALTER
 *   holds ACCESS EXCLUSIVE until the transaction ends, so several stack up.
 *   Split them into one migration per table.
 * - CREATE INDEX on a hot table must be CONCURRENTLY, in a migration with
 *   `export const config = { transaction: false }`.
 *
 * Migrations up to RULES_START predate the rules and are not checked.
 */
const RULES_START = "20261026100000"

const HOT_TABLES = [
  "accounts",
  "contractors",
  "contractor_members",
  "shops",
  "listings",
  "listing_items",
  "listing_item_lots",
  "item_variants",
  "orders",
  "market_orders",
  "order_market_items_v2",
  "offer_sessions",
  "market_listings",
  "market_unique_listings",
]

const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations", import.meta.url))

function tableRef(name: string): string {
  return `(?:public\\.)?"?${name}"?`
}

/** Hot tables a migration's source ALTERs (knex schema builder or raw SQL). */
function alteredHotTables(source: string): string[] {
  return HOT_TABLES.filter((t) => {
    const knexAlter = new RegExp(`schema\\.(?:alterTable|table)\\(\\s*["'\`]${t}["'\`]`)
    const rawAlter = new RegExp(
      `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${tableRef(t)}(?![\\w"])`,
      "i",
    )
    return knexAlter.test(source) || rawAlter.test(source)
  })
}

/** Hot tables indexed without CONCURRENTLY. */
function blockingIndexedHotTables(source: string): string[] {
  return HOT_TABLES.filter((t) =>
    new RegExp(
      `CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?!CONCURRENTLY)[^;]*?\\sON\\s+(?:ONLY\\s+)?${tableRef(t)}(?![\\w"])`,
      "i",
    ).test(source),
  )
}

function isNonTransactional(source: string): boolean {
  return /export\s+const\s+config\s*=\s*\{\s*transaction\s*:\s*false\s*\}/.test(source)
}

function checkedMigrations(): Array<{ file: string; source: string }> {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_.*\.(ts|js)$/.test(f) && f.slice(0, 14) > RULES_START)
    .map((file) => ({
      file,
      source: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8"),
    }))
}

describe("migration lock rules", () => {
  it("detects hot-table ALTERs and blocking index builds", () => {
    expect(
      alteredHotTables(`
        await knex.schema.alterTable("accounts", (t) => t.boolean("x"))
        await knex.raw('ALTER TABLE IF EXISTS public.shops ADD COLUMN y int')
        await knex.raw("ALTER TABLE shops_extra ADD COLUMN z int")
      `),
    ).toEqual(["accounts", "shops"])
    expect(blockingIndexedHotTables("CREATE INDEX idx_a ON orders (customer_id)")).toEqual(["orders"])
    expect(
      blockingIndexedHotTables("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_a ON public.orders (customer_id)"),
    ).toEqual([])
    expect(isNonTransactional("export const config = { transaction: false }")).toBe(true)
  })

  it("a transactional migration ALTERs at most one hot table", () => {
    const offenders = checkedMigrations()
      .filter(({ source }) => !isNonTransactional(source))
      .map(({ file, source }) => ({ file, tables: alteredHotTables(source) }))
      .filter(({ tables }) => tables.length > 1)
    expect(offenders).toEqual([])
  })

  it("indexes on hot tables are built CONCURRENTLY outside a transaction", () => {
    const offenders = checkedMigrations().flatMap(({ file, source }) => {
      const blocking = blockingIndexedHotTables(source)
      const concurrentInTrx =
        /CONCURRENTLY/i.test(source) && !isNonTransactional(source)
      return blocking.length > 0 || concurrentInTrx ? [{ file, blocking, concurrentInTrx }] : []
    })
    expect(offenders).toEqual([])
  })
})
