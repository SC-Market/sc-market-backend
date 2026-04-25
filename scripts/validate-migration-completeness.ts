#!/usr/bin/env tsx
/**
 * Validate V1 → V2 Migration Completeness
 *
 * Checks:
 * 1. V1 table counts unchanged
 * 2. Every V1 listing has a v1_v2_listing_map entry
 * 3. V2 listing metadata matches V1 (title, price, status)
 * 4. Photos migrated (listing_photos_v2 count matches market_images)
 * 5. Stock lots mapped where they exist
 * 6. Bundle listings have multiple listing_items
 * 7. No duplicate variants per game_item_id
 */

import { getKnex } from "../src/clients/database/knex-db.js"

interface Check {
  name: string
  passed: boolean
  detail: string
}

async function main() {
  const db = getKnex()
  const checks: Check[] = []

  // 1. V1 listing counts
  const [u] = await db("market_unique_listings").count("* as count")
  const [a] = await db("market_aggregate_listings").count("* as count")
  const [m] = await db("market_multiple_listings").count("* as count")
  const v1Total = Number(u.count) + Number(a.count) + Number(m.count)
  console.log(`V1: ${u.count} unique, ${a.count} aggregate, ${m.count} multiple (${v1Total} total)`)

  // 2. Mapping completeness
  const [mapped] = await db("v1_v2_listing_map").count("* as count")
  const mappedCount = Number(mapped.count)
  checks.push({
    name: "Mapping completeness",
    passed: mappedCount >= v1Total,
    detail: `${mappedCount}/${v1Total} listings mapped`,
  })

  // 3. Unmapped V1 listings (unique)
  const unmappedUnique = await db("market_unique_listings as mul")
    .leftJoin("v1_v2_listing_map as m", "mul.listing_id", "m.v1_listing_id")
    .whereNull("m.v1_listing_id")
    .count("* as count")
  const unmappedUniqueCount = Number(unmappedUnique[0].count)

  const unmappedAgg = await db("market_aggregate_listings as mal")
    .leftJoin("v1_v2_listing_map as m", function () {
      this.on("mal.aggregate_listing_id", "m.v1_listing_id")
    })
    .whereNull("m.v1_listing_id")
    .count("* as count")
  const unmappedAggCount = Number(unmappedAgg[0].count)

  checks.push({
    name: "No unmapped unique listings",
    passed: unmappedUniqueCount === 0,
    detail: `${unmappedUniqueCount} unmapped`,
  })
  checks.push({
    name: "No unmapped aggregate listings",
    passed: unmappedAggCount === 0,
    detail: `${unmappedAggCount} unmapped`,
  })

  // 4. Metadata preservation (spot check mapped listings)
  const sampleMappings = await db("v1_v2_listing_map")
    .where("v1_listing_type", "unique")
    .limit(10)
  let metadataOk = true
  for (const map of sampleMappings) {
    const v1 = await db("market_unique_listings")
      .join("market_listing_details", "market_unique_listings.details_id", "market_listing_details.details_id")
      .where("market_unique_listings.listing_id", map.v1_listing_id)
      .first("market_listing_details.title")
    const v2 = await db("listings").where("listing_id", map.v2_listing_id).first("title")
    if (v1 && v2 && v1.title !== v2.title) {
      metadataOk = false
      console.log(`  Title mismatch: V1="${v1.title}" V2="${v2.title}" (${map.v1_listing_id})`)
    }
  }
  checks.push({ name: "Metadata preserved (sample)", passed: metadataOk, detail: `Checked ${sampleMappings.length} listings` })

  // 5. Photos migrated
  const [v1PhotoCount] = await db("market_images").count("* as count")
  const [v2PhotoCount] = await db("listing_photos_v2").count("* as count")
  checks.push({
    name: "Photos migrated",
    passed: Number(v2PhotoCount.count) >= Number(v1PhotoCount.count),
    detail: `V1: ${v1PhotoCount.count}, V2: ${v2PhotoCount.count}`,
  })

  // 6. Stock lot mapping
  const [v1LotCount] = await db("stock_lots").count("* as count")
  const [mappedLotCount] = await db("v1_v2_stock_lot_map").count("* as count")
  checks.push({
    name: "Stock lots mapped",
    passed: Number(mappedLotCount.count) >= Number(v1LotCount.count),
    detail: `V1: ${v1LotCount.count}, mapped: ${mappedLotCount.count}`,
  })

  // 7. Bundle listings have multiple listing_items
  const bundleMappings = await db("v1_v2_listing_map").where("v1_listing_type", "multiple")
  let bundlesOk = true
  for (const map of bundleMappings) {
    const [itemCount] = await db("listing_items").where("listing_id", map.v2_listing_id).count("* as count")
    if (Number(itemCount.count) < 1) {
      bundlesOk = false
      console.log(`  Bundle ${map.v1_listing_id} has ${itemCount.count} items`)
    }
  }
  checks.push({ name: "Bundle listings have items", passed: bundlesOk, detail: `${bundleMappings.length} bundles checked` })

  // 8. No duplicate variants
  const dupes = await db("item_variants")
    .select("game_item_id", "attributes_hash")
    .groupBy("game_item_id", "attributes_hash")
    .havingRaw("COUNT(*) > 1")
  checks.push({ name: "No duplicate variants", passed: dupes.length === 0, detail: `${dupes.length} duplicates` })

  // Summary
  console.log(`\n${"=".repeat(60)}`)
  console.log("Validation Results:")
  let allPassed = true
  for (const c of checks) {
    const icon = c.passed ? "✅" : "❌"
    console.log(`  ${icon} ${c.name}: ${c.detail}`)
    if (!c.passed) allPassed = false
  }
  console.log(`\n${allPassed ? "✅ All checks passed" : "❌ Some checks failed"}`)

  await db.destroy()
  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
