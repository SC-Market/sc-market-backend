#!/usr/bin/env tsx
/**
 * Read-only report: existing shops whose slug is a reserved route word or a
 * name reserved for someone else (an org's Spectrum ID, a user's
 * <username>-shop or <username>). These shops keep their slug (see
 * src/services/shops/shop-slug.service.ts); this lists them so an admin can
 * decide on any rename. Runs SELECTs only.
 *
 *   npx tsx scripts/report-shop-slug-conflicts.ts
 */
import { database } from "../src/clients/database/knex-db.js"
import { findSlugReservationConflicts } from "../src/services/shops/shop-slug.service.js"

const rows = await findSlugReservationConflicts(database.knex)
const byKind = new Map<string, number>()
for (const row of rows) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1)

console.log(
  `Shops holding a reserved slug: ${new Set(rows.map((r) => r.shop_id)).size}`,
)
for (const [kind, count] of byKind) console.log(`  ${kind}: ${count}`)
for (const row of rows)
  console.log(`  ${row.slug}\t${row.kind}\t${row.holder}\t${row.shop_id}`)
await database.knex.destroy()
