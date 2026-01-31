#!/usr/bin/env tsx

/**
 * Import Component Attributes Script
 *
 * This script imports game item attributes from external data sources:
 * - UEX Corp Space API (structured data - PRIMARY SOURCE)
 * - cstone.space (parsed data - SECONDARY SOURCE)
 *
 * Usage:
 *   tsx scripts/import-component-attributes.ts [--source=uex|cstone|all]
 *
 * Options:
 *   --source=uex     Import only from UEX Corp Space API
 *   --source=cstone  Import only from cstone.space
 *   --source=all     Import from both sources (default)
 *
 * Examples:
 *   tsx scripts/import-component-attributes.ts
 *   tsx scripts/import-component-attributes.ts --source=uex
 *   tsx scripts/import-component-attributes.ts --source=cstone
 */

import { gameItemImportService } from "../src/services/game-items/game-item-import.service.js"
import logger from "../src/logger/logger.js"
import { getKnex } from "../src/clients/database/knex-db.js"

// Parse command line arguments
const args = process.argv.slice(2)
const sourceArg = args.find((arg) => arg.startsWith("--source="))
const source = sourceArg ? sourceArg.split("=")[1] : "all"

async function main() {
  logger.info("Starting component attributes import", { source })

  try {
    switch (source) {
      case "uex":
        logger.info("Importing from UEX Corp Space API only")
        await gameItemImportService.importFromUEX()
        break

      case "cstone":
        logger.info("Importing from cstone.space only")
        await gameItemImportService.importFromCStone()
        break

      case "all":
        logger.info("Importing from all sources (UEX + CStone)")
        await gameItemImportService.importAll()
        break

      default:
        logger.error("Invalid source specified", { source })
        console.error(
          'Invalid source. Use --source=uex, --source=cstone, or --source=all (default)',
        )
        process.exit(1)
    }

    logger.info("Import completed successfully")
    process.exit(0)
  } catch (error) {
    logger.error("Import failed", { error })
    console.error("Import failed:", error)
    process.exit(1)
  } finally {
    // Close database connection
    const knex = getKnex()
    await knex.destroy()
  }
}

// Run the script
main()
