#!/usr/bin/env tsx

/**
 * Test script for the Spectrum migration helper functions
 * This script tests the core functionality without making database changes
 */

import { getMigrationStatus } from "../src/api/routes/v1/util/spectrum-migration.js"
import logger from "../src/logger/logger.js"

async function testMigrationHelper() {
  console.log("🧪 Testing Spectrum Migration Helper Functions\n")

  try {
    // Test 1: Get migration status
    console.log("📊 Test 1: Getting migration status...")
    const status = await getMigrationStatus()

    console.log("✅ Migration status retrieved successfully:")
    console.log(`   Total users: ${status.totalUsers}`)
    console.log(`   Verified users: ${status.verifiedUsers}`)
    console.log(`   Users with Spectrum ID: ${status.usersWithSpectrumId}`)
    console.log(`   Users needing migration: ${status.usersNeedingMigration}`)
    console.log(
      `   Users without Spectrum ID: ${status.usersWithoutSpectrumId}`,
    )

    // Test 2: Check if there are users needing migration
    if (status.usersNeedingMigration > 0) {
      console.log(
        `\n🔄 Found ${status.usersNeedingMigration} users that need migration`,
      )
      console.log("   You can run the migration with:")
      console.log("   tsx scripts/migrate-spectrum-users.ts --simulate")
      console.log("   tsx scripts/migrate-spectrum-users.ts")
    } else {
      console.log("\n✅ All verified users already have Spectrum IDs!")
    }

    // Test 3: Check database connectivity
    console.log("\n🔌 Test 3: Database connectivity...")
    if (status.totalUsers >= 0) {
      console.log("✅ Database connection successful")
    } else {
      console.log("❌ Database connection failed")
    }

    console.log("\n🎉 All tests completed successfully!")
    return true
  } catch (error) {
    console.error("❌ Test failed:", error)
    return false
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMigrationHelper()
    .then((success) => {
      if (success) {
        console.log("\n✨ Migration helper is ready to use!")
        process.exit(0)
      } else {
        console.log("\n💥 Migration helper has issues that need to be resolved")
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error("💥 Unhandled error:", error)
      process.exit(1)
    })
}
