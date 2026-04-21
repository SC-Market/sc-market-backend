#!/usr/bin/env npx tsx
/**
 * Standalone CLI for P4K game data import.
 * Uses its own knex connection — no app context needed.
 *
 * Usage:
 *   npm run import-game-data -- --file ./game-data-export/game-data.json [--dry]
 *   npm run import-game-data -- --file ./game-data-export/game-data.zip
 */

import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import knexLib from "knex"
import { gameDataImportService } from "../src/services/game-data/import.service.js"
import type { GameDataPayload } from "../src/services/game-data/import.service.js"

const DRY_RUN = process.argv.includes("--dry")
const FILE_IDX = process.argv.indexOf("--file")
const FILE_ARG = FILE_IDX !== -1 ? process.argv[FILE_IDX + 1] : null

if (!FILE_ARG) {
  console.error("Usage: --file <game-data.json or .zip> [--dry]")
  process.exit(1)
}

const db = knexLib({
  client: "pg",
  connection: {
    host: process.env.DATABASE_HOST || "localhost",
    port: +(process.env.DATABASE_PORT || "5432"),
    user: process.env.DATABASE_USER || "scmarket",
    password: process.env.DATABASE_PASS || "scmarket",
    database: process.env.DATABASE_TARGET || "scmarket",
    connectTimeout: 10000,
  },
  pool: { min: 0, max: 10 },
  acquireConnectionTimeout: 30000,
})

async function run() {
  let jsonPath = FILE_ARG!
  if (jsonPath.endsWith(".zip")) {
    const tmpDir = path.join("/tmp", "game-data-import-" + Date.now())
    fs.mkdirSync(tmpDir, { recursive: true })
    execSync(`unzip -o "${jsonPath}" -d "${tmpDir}"`, { stdio: "pipe" })
    jsonPath = path.join(tmpDir, "game-data.json")
  }

  const gameData: GameDataPayload = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))
  console.log(`Loaded: ${gameData.items.length} items, ${gameData.missions.length} missions, ${gameData.blueprints.length} blueprints`)

  if (DRY_RUN) {
    const valid = gameData.items.filter((i) => i.name && !i.name.startsWith("@") && !i.name.includes("PLACEHOLDER"))
    console.log(`[DRY RUN] ${valid.length} valid items would be processed`)
    await db.destroy()
    return
  }

  const stats = await gameDataImportService.importGameData(db, gameData)
  console.log("Import complete:", JSON.stringify(stats, null, 2))
  await db.destroy()
}

run().catch((err) => {
  console.error("Import failed:", err.message)
  db.destroy().then(() => process.exit(1))
})
