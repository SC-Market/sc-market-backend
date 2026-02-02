#!/usr/bin/env tsx
/**
 * Find duplicate game items in the database using various patterns
 */

import { database } from "../src/clients/database/knex-db.js"
import { normalizeItemName } from "./name-normalizer.js"

interface DuplicateGroup {
  name: string
  count: number
  ids: string[]
  names: string[]
  uex_uuids: (string | null)[]
  cstone_uuids: (string | null)[]
}

async function findDuplicates() {
  console.log("Finding duplicate game items...\n")

  // Get all items
  const allItems = await database
    .knex("game_items")
    .select("id", "name", "uex_uuid", "cstone_uuid")

  // Group by exact name match
  const exactDuplicates = new Map<string, typeof allItems>()
  for (const item of allItems) {
    const key = item.name.toLowerCase()
    if (!exactDuplicates.has(key)) {
      exactDuplicates.set(key, [])
    }
    exactDuplicates.get(key)!.push(item)
  }

  // Group by normalized name (armor variations)
  const normalizedDuplicates = new Map<string, typeof allItems>()
  for (const item of allItems) {
    const key = normalizeItemName(item.name)
    if (!normalizedDuplicates.has(key)) {
      normalizedDuplicates.set(key, [])
    }
    normalizedDuplicates.get(key)!.push(item)
  }

  // Find fuzzy matches using various patterns
  const fuzzyDuplicates = new Map<string, typeof allItems>()
  for (const item of allItems) {
    // Remove common suffixes/prefixes and extra words
    let fuzzyKey = item.name
      .toLowerCase()
      .replace(
        /\s+(livery|paint|skin|edition|version|mk\s*\d+|mark\s*\d+)$/i,
        "",
      )
      .replace(/^(rsi|origin|anvil|aegis|crusader|drake|misc|argo)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim()

    if (!fuzzyDuplicates.has(fuzzyKey)) {
      fuzzyDuplicates.set(fuzzyKey, [])
    }
    fuzzyDuplicates.get(fuzzyKey)!.push(item)
  }

  // Find exact duplicates
  const exactDups = Array.from(exactDuplicates.entries())
    .filter(([, items]) => items.length > 1)
    .sort((a, b) => b[1].length - a[1].length)

  // Find normalized duplicates (excluding exact matches)
  const normalizedDups = Array.from(normalizedDuplicates.entries())
    .filter(([key, items]) => {
      if (items.length <= 1) return false
      // Exclude if all items have exact same name
      const uniqueNames = new Set(items.map((i) => i.name.toLowerCase()))
      return uniqueNames.size > 1
    })
    .sort((a, b) => b[1].length - a[1].length)

  // Find fuzzy duplicates (excluding exact and normalized matches)
  const fuzzyDups = Array.from(fuzzyDuplicates.entries())
    .filter(([key, items]) => {
      if (items.length <= 1) return false
      // Exclude if all items have exact same name
      const uniqueNames = new Set(items.map((i) => i.name.toLowerCase()))
      if (uniqueNames.size <= 1) return false
      // Exclude if already caught by normalized duplicates
      const normalizedKey = normalizeItemName(items[0].name)
      const normalizedGroup = normalizedDuplicates.get(normalizedKey)
      if (normalizedGroup && normalizedGroup.length === items.length) {
        return false
      }
      return true
    })
    .sort((a, b) => b[1].length - a[1].length)

  let foundIssues = false

  if (exactDups.length > 0) {
    foundIssues = true
    console.log(`⚠️  Found ${exactDups.length} exact duplicate names:\n`)
    for (const [name, items] of exactDups) {
      console.log(`"${items[0].name}" (${items.length} copies)`)
      items.forEach((item) => {
        console.log(
          `  - ID: ${item.id}, UEX: ${item.uex_uuid || "none"}, CStone: ${item.cstone_uuid || "none"}`,
        )
      })
      console.log()
    }
  }

  if (normalizedDups.length > 0) {
    foundIssues = true
    console.log(
      `⚠️  Found ${normalizedDups.length} normalized duplicates (armor variations):\n`,
    )
    for (const [normalizedName, items] of normalizedDups) {
      console.log(
        `Normalized: "${normalizedName}" (${items.length} variations)`,
      )
      items.forEach((item) => {
        console.log(
          `  - "${item.name}" (ID: ${item.id}, UEX: ${item.uex_uuid || "none"}, CStone: ${item.cstone_uuid || "none"})`,
        )
      })
      console.log()
    }
  }

  if (fuzzyDups.length > 0) {
    foundIssues = true
    console.log(
      `⚠️  Found ${fuzzyDups.length} fuzzy duplicates (possible variations):\n`,
    )
    for (const [fuzzyKey, items] of fuzzyDups) {
      console.log(`Fuzzy match: "${fuzzyKey}" (${items.length} variations)`)
      items.forEach((item) => {
        console.log(
          `  - "${item.name}" (ID: ${item.id}, UEX: ${item.uex_uuid || "none"}, CStone: ${item.cstone_uuid || "none"})`,
        )
      })
      console.log()
    }
  }

  if (!foundIssues) {
    console.log("✓ No duplicates found")
    process.exit(0)
  }

  process.exit(1)
}

findDuplicates()
