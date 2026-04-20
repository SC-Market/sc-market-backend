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
// This allows the controller to access req.file
apiV2Router.post(
  "/admin/import-game-data",
  gameDataZipUpload.single("file"),
)

RegisterRoutes(apiV2Router)

// Apply TSOA error handler middleware
// This must come after route registration to catch errors from TSOA controllers
apiV2Router.use(tsoaErrorHandler)
