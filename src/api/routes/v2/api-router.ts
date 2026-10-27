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
import {
  gameDataZipUpload,
  multiplePhotoUpload,
  removeUploadsWhenDone,
} from "../v1/util/upload.js"
import { tsoaWriteRateLimit } from "../../middleware/tsoa-ratelimit.js"
import { requireSecurity, tokenRequestGuard } from "./middleware/tsoa-auth.js"

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

// Multipart upload routes. Each one is authenticated and rate limited before
// multer parses anything, and (except the admin import) its temp files are
// deleted when the response ends, on every exit path.
//
// multer must run before the TSOA handler (it
// populates req.file / req.files), but it must NOT run before authentication:
// it parses the body and writes it to disk. So each upload route runs the same
// @Security check TSOA runs (requireSecurity -> expressAuthentication) first,
// and an anonymous request is rejected with 401 before any byte is parsed.
// The TSOA route still re-runs its own @Security check afterwards.
//
// These are registered per-method (.post) rather than with .use(): inside a
// .use("/admin/import-game-data") mount req.path is stripped to "/", which
// would hide the admin path from expressAuthentication's admin-role gate.

// Admin game data import (50 MB zip). expressAuthentication enforces the admin
// role for /admin/* paths, so non-admins get 403 before the upload is parsed.
apiV2Router.post(
  "/admin/import-game-data",
  requireSecurity("loggedin"),
  tsoaWriteRateLimit,
  // No removeUploadsWhenDone: the import job reads the zip after responding
  // and deletes it itself.
  gameDataZipUpload.single("file"),
)

// Listing photo uploads
apiV2Router.post(
  "/listings/:id/photos",
  requireSecurity("loggedin"),
  tsoaWriteRateLimit,
  removeUploadsWhenDone,
  multiplePhotoUpload.array("photos", 5),
)

// Standalone image upload (two-phase upload)
apiV2Router.post(
  "/images/upload",
  requireSecurity("loggedin"),
  tsoaWriteRateLimit,
  removeUploadsWhenDone,
  multiplePhotoUpload.single("photo"),
)

// SCMDB ingest: anonymous (the path token is the credential), so it's rate
// limited per token and per IP before the handler's DB lookup.
import { scmdbIngestRateLimit } from "./integrations/scmdb/ingest-rate-limit.js"
apiV2Router.post("/integrations/scmdb/ingest/:token", scmdbIngestRateLimit)

// NOTE: literal-path routes under a `{param}` path used to be hand-registered
// here, because TSOA emitted `/game-data/resources/{resource_id}` before
// `/game-data/resources/categories` and Express matches in registration order.
// They are now ordered correctly in the controllers themselves — TSOA emits
// routes in declaration order, so each literal @Get is simply declared above its
// `{param}` sibling. Do not reintroduce workarounds here: a hand-registered
// route bypasses TSOA's @Security middleware and its query-param binding, which
// is how /game-data/blueprints/inventory silently lost its pagination and sort
// arguments.

// Resolve short-slug URLs to full UUIDs before TSOA routes handle them
import { resolveShortSlug } from "./middleware/resolve-short-slug.js"
apiV2Router.use(resolveShortSlug)

// API-token scope and contractor_ids checks on every route, public ones
// included (after short slugs resolve, so ids are UUIDs).
apiV2Router.use(tokenRequestGuard())

RegisterRoutes(apiV2Router)

// Apply TSOA error handler middleware
// This must come after route registration to catch errors from TSOA controllers
apiV2Router.use(tsoaErrorHandler)
