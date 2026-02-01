#!/usr/bin/env tsx
/**
 * Find duplicate game items in the database
 */

import { database } from "../src/clients/database/knex-db.js"

interface DuplicateGroup {
  name: string
  count: number
  ids: string[]
  uex_uuids: (string | null)[]
}

async function findDuplicates() {
  console.log("Finding duplicate game items...")

  // Find items with duplicate names
  const duplicates = await database.knex.raw<{ rows: DuplicateGroup[] }>(`
    SELECT 
      name,
      COUNT(*) as count,
      ARRAY_AGG(id) as ids,
      ARRAY_AGG(uex_uuid) as uex_uuids
    FROM game_items
    GROUP BY name
    HAVING COUNT(*) > 1
    ORDER BY count DESC, name
  `)

  if (duplicates.rows.length === 0) {
    console.log("✓ No duplicates found")
    process.exit(0)
  }

  console.log(`\n⚠️  Found ${duplicates.rows.length} duplicate item names:\n`)

  for (const dup of duplicates.rows) {
    console.log(`${dup.name} (${dup.count} copies)`)
    dup.ids.forEach((id, i) => {
      console.log(`  - ID: ${id}, UEX UUID: ${dup.uex_uuids[i] || "none"}`)
    })
    console.log()
  }

  process.exit(1)
}

findDuplicates()
