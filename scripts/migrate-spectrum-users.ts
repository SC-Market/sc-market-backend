#!/usr/bin/env tsx

/**
 * CLI script to migrate existing verified users to use Spectrum user IDs
 *
 * Usage:
 *   tsx scripts/migrate-spectrum-users.ts [options]
 *
 * Options:
 *   --simulate, -s     Run in simulation mode (dry run)
 *   --batch-size=N      Number of users to process in each batch (default: 10)
 *   --delay=N          Delay in ms between batches (default: 1000)
 *   --status           Show migration status only
 *   --rollback         Rollback all Spectrum user IDs (WARNING: destructive!)
 *   --help, -h         Show this help message
 */

import {
  migrateExistingUsersToSpectrumIds,
  simulateSpectrumMigration,
  getMigrationStatus,
  rollbackSpectrumMigration,
  MigrationResult,
} from "../src/api/routes/v1/util/spectrum-migration.js"
import logger from "../src/logger/logger.js"

interface CliOptions {
  simulate: boolean
  batchSize: number
  delayBetweenBatches: number
  delayBetweenRequests: number
  status: boolean
  rollback: boolean
  help: boolean
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = {
    simulate: false,
    batchSize: 10,
    delayBetweenBatches: 1000,
    delayBetweenRequests: 500,
    status: false,
    rollback: false,
    help: false,
  }

  for (const arg of args) {
    if (arg === "--simulate" || arg === "-s") {
      options.simulate = true
    } else if (arg === "--status") {
      options.status = true
    } else if (arg === "--rollback") {
      options.rollback = true
    } else if (arg === "--help" || arg === "-h") {
      options.help = true
    } else if (arg.startsWith("--batch-size=")) {
      const value = parseInt(arg.split("=")[1])
      if (!isNaN(value) && value > 0) {
        options.batchSize = value
      }
    } else if (arg.startsWith("--delay-between-batches=")) {
      const value = parseInt(arg.split("=")[1])
      if (!isNaN(value) && value >= 0) {
        options.delayBetweenBatches = value
      }
    } else if (arg.startsWith("--delay-between-requests=")) {
      const value = parseInt(arg.split("=")[1])
      if (!isNaN(value) && value >= 0) {
        options.delayBetweenRequests = value
      }
    }
  }

  return options
}

function showHelp() {
  console.log(`
🚀 SC Market Spectrum User Migration CLI

Usage:
  tsx scripts/migrate-spectrum-users.ts [options]

Options:
  --simulate, -s     Run in simulation mode (dry run)
  --batch-size=N      Number of users to process in each batch (default: 10)
  --delay-between-batches=N  Delay in ms between batches (default: 1000)
  --delay-between-requests=N Delay in ms between individual requests (default: 500)
  --status           Show migration status only
  --rollback         Rollback all Spectrum user IDs (WARNING: destructive!)
  --help, -h         Show this help message

Examples:
  # Run simulation to see what would happen
  tsx scripts/migrate-spectrum-users.ts --simulate

  # Run actual migration with custom batch size and delays
  tsx scripts/migrate-spectrum-users.ts --batch-size=5 --delay-between-batches=2000 --delay-between-requests=1000

  # Check current migration status
  tsx scripts/migrate-spectrum-users.ts --status

  # Rollback all Spectrum user IDs (destructive!)
  tsx scripts/migrate-spectrum-users.ts --rollback

⚠️  WARNING: The rollback option will remove ALL Spectrum user IDs from the database!
`)
}

function printMigrationResult(result: MigrationResult) {
  console.log("\n📊 Migration Results:")
  console.log(`   Total users processed: ${result.totalUsers}`)
  console.log(`   ✅ Successfully migrated: ${result.successfulMigrations}`)
  console.log(`   ❌ Failed migrations: ${result.failedMigrations}`)
  console.log(`   🔄 Accounts unverified: ${result.unverifiedUsers}`)

  if (result.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`)
    for (const error of result.errors) {
      console.log(`   - ${error.username}: ${error.error}`)
    }
  }
}

async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  console.log("🚀 SC Market Spectrum User Migration CLI")
  console.log("==========================================\n")

  try {
    if (options.status) {
      // Show migration status only
      console.log("📊 Checking migration status...")
      const status = await getMigrationStatus()

      console.log("\n📈 Migration Status:")
      console.log(`   Total users: ${status.totalUsers}`)
      console.log(`   Verified users: ${status.verifiedUsers}`)
      console.log(`   Users with Spectrum ID: ${status.usersWithSpectrumId}`)
      console.log(`   Users needing migration: ${status.usersNeedingMigration}`)
      console.log(
        `   Users without Spectrum ID: ${status.usersWithoutSpectrumId}`,
      )

      if (status.usersNeedingMigration > 0) {
        console.log(`\n🔄 ${status.usersNeedingMigration} users need migration`)
        console.log("   Run with --simulate to see what would happen")
        console.log("   Run without --simulate to perform the migration")
      } else {
        console.log("\n✅ All users are already migrated!")
      }

      return
    }

    if (options.rollback) {
      // Rollback operation
      console.log(
        "⚠️  WARNING: This will remove ALL Spectrum user IDs from the database!",
      )
      console.log("   This action cannot be undone.")

      const readline = require("readline")
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const answer = await new Promise<string>((resolve) => {
        rl.question(
          'Are you sure you want to continue? Type "YES" to confirm: ',
          resolve,
        )
      })
      rl.close()

      if (answer !== "YES") {
        console.log("❌ Rollback cancelled")
        return
      }

      console.log("🔄 Starting rollback...")
      const affected = await rollbackSpectrumMigration()
      console.log(`✅ Rollback completed: ${affected} users affected`)
      return
    }

    if (options.simulate) {
      // Simulation mode
      console.log("🔍 Running migration simulation (dry run)...")
      console.log(`   Batch size: ${options.batchSize}`)
      console.log(`   Delay between batches: ${options.delayBetweenBatches}ms`)
      console.log(
        `   Delay between requests: ${options.delayBetweenRequests}ms`,
      )

      const result = await simulateSpectrumMigration(
        options.batchSize,
        options.delayBetweenRequests,
      )
      printMigrationResult(result)

      if (result.totalUsers > 0) {
        console.log(
          "\n💡 To run the actual migration, remove the --simulate flag",
        )
      }
    } else {
      // Actual migration
      console.log("🚀 Starting actual migration...")
      console.log(`   Batch size: ${options.batchSize}`)
      console.log(`   Delay between batches: ${options.delayBetweenBatches}ms`)
      console.log(
        `   Delay between requests: ${options.delayBetweenRequests}ms`,
      )
      console.log("   ⚠️  This will modify the database!")

      const readline = require("readline")
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const answer = await new Promise<string>((resolve) => {
        rl.question(
          'Are you sure you want to continue? Type "YES" to confirm: ',
          resolve,
        )
      })
      rl.close()

      if (answer !== "YES") {
        console.log("❌ Migration cancelled")
        return
      }

      const result = await migrateExistingUsersToSpectrumIds(
        options.batchSize,
        options.delayBetweenBatches,
        options.delayBetweenRequests,
      )
      printMigrationResult(result)

      if (result.successfulMigrations > 0) {
        console.log("\n🎉 Migration completed successfully!")
      }
    }
  } catch (error) {
    console.error("💥 Fatal error:", error)
    process.exit(1)
  }
}

// Run the CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("💥 Unhandled error:", error)
    process.exit(1)
  })
}
