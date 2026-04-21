/**
 * v2 API Router
 *
 * Main router for all TSOA-generated v2 API routes.
 * This router is mounted at /api/v2 in the main server.
 */

import express from "express"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { apiReference } from "@scalar/express-api-reference"
import { tsoaErrorHandler } from "../../middleware/tsoa-error-handler.js"
import {
  canViewV2DebugInternals,
  filterV2DebugFromOpenApiSpec,
} from "./util/openapi-debug-visibility.js"
import { gameDataZipUpload } from "../v1/util/upload.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const apiV2Router = express.Router()

// Health check endpoint for v2 API
apiV2Router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  })
})

// Serve v2 OpenAPI spec
apiV2Router.get("/openapi.json", (req, res) => {
  try {
    const specPath = join(__dirname, "generated", "swagger.json")
    const spec = JSON.parse(readFileSync(specPath, "utf-8"))
    const payload = canViewV2DebugInternals(req)
      ? spec
      : filterV2DebugFromOpenApiSpec(spec)
    res.json(payload)
  } catch (error) {
    res.status(404).json({
      error: {
        code: "SPEC_NOT_FOUND",
        message:
          "OpenAPI spec not found. Run 'npm run tsoa:spec' to generate it.",
      },
    })
  }
})

// Serve Scalar API documentation
apiV2Router.use(
  "/docs",
  apiReference({
    url: "/api/v2/openapi.json",
    theme: "purple",
  }),
)

// TSOA-generated routes will be registered here
// This will be populated after running 'npm run tsoa:routes'
// Import and register routes like this:
import { RegisterRoutes } from "./generated/routes.js"

// Register file upload middleware for admin import endpoint BEFORE TSOA routes
// multer processes the file and attaches it to req.file, then next() passes to TSOA
apiV2Router.use(
  "/admin/import-game-data",
  gameDataZipUpload.single("file"),
)

// DEV ONLY: unauthenticated import endpoint for testing — REMOVE BEFORE PRODUCTION
apiV2Router.post("/dev/import-game-data", gameDataZipUpload.single("file"), async (req, res) => {
  const { gameDataImportService } = await import("../../services/game-data/import.service.js")
  const { getKnex } = await import("../../clients/database/knex-db.js")
  const fs = await import("fs")
  const path = await import("path")
  const { execSync } = await import("child_process")

  const file = (req as express.Request & { file?: Express.Multer.File }).file
  if (!file) return res.status(400).json({ error: "No file" })

  const tmpDir = path.join("/tmp", `dev-import-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  try {
    execSync(`unzip -o "${file.path}" -d "${tmpDir}"`, { stdio: "pipe", timeout: 30000 })
    const jsonPath = path.join(tmpDir, "game-data.json")
    const gameData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))
    if (req.body?.gameVersion) gameData.gameVersion = req.body.gameVersion
    if (req.body?.gameChannel) gameData.gameChannel = req.body.gameChannel
    const stats = await gameDataImportService.importGameData(getKnex(), gameData)
    res.json({ success: true, stats })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    try { if (file.path) fs.unlinkSync(file.path) } catch {}
  }
})

// Register static routes that conflict with TSOA parameterized routes
// TSOA registers /:param before /static, so we need to handle these manually
import { BlueprintsController } from "./game-data/blueprints/BlueprintsController.js"
import { ResourcesController } from "./game-data/resources/ResourcesController.js"
import { MissionsController } from "./game-data/missions/MissionsController.js"

const staticRoutes: Array<{ path: string; handler: (req: express.Request, res: express.Response, next: express.NextFunction) => void }> = [
  {
    path: "/game-data/blueprints/categories",
    handler: async (req, res, next) => {
      try {
        const c = new BlueprintsController(req)
        res.json(await c.getBlueprintCategories(req.query.version_id as string | undefined))
      } catch (err) { next(err) }
    },
  },
  {
    path: "/game-data/blueprints/inventory",
    handler: async (req, res, next) => {
      try {
        const c = new BlueprintsController(req)
        res.json(await c.getUserBlueprintInventory(
          req.query.item_category as string | undefined,
          req.query.rarity as string | undefined,
          req.query.version_id as string | undefined,
        ))
      } catch (err) { next(err) }
    },
  },
  {
    path: "/game-data/resources/categories",
    handler: async (req, res, next) => {
      try {
        const c = new ResourcesController(req)
        res.json(await c.getResourceCategories(req.query.version_id as string | undefined))
      } catch (err) { next(err) }
    },
  },
  {
    path: "/game-data/missions/chains",
    handler: async (req, res, next) => {
      try {
        const c = new MissionsController(req)
        res.json(await c.getMissionChains(
          req.query.version_id as string | undefined,
        ))
      } catch (err) { next(err) }
    },
  },
]

for (const route of staticRoutes) {
  apiV2Router.get(route.path, route.handler)
}

RegisterRoutes(apiV2Router)

// Apply TSOA error handler middleware
// This must come after route registration to catch errors from TSOA controllers
apiV2Router.use(tsoaErrorHandler)
