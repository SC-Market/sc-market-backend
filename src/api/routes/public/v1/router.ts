/**
 * /api/public/v1: the public, token-only API (design: drafts/scmarket-public-api-v1.md).
 *
 * Mounted in server.ts BEFORE the session, cookie, CORS, CSRF and passport
 * middleware: nothing here reads cookies, and responses carry no CORS headers
 * (tokens must not live in browser JavaScript).
 *
 * Order:
 *   GET /openapi.json            anonymous (the spec)
 *   authenticatePublicRequest    token → user, rate limits, own DB pool
 *   express.json (256 kB)        bodies parsed only once authenticated
 *   TSOA routes                  per-route @Security("apiToken", [scopes])
 *   404, error handler           the public error envelope
 */

import express from "express"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { RegisterRoutes } from "./generated/routes.js"
import { authenticatePublicRequest } from "./auth.js"
import { PublicApiError, publicErrorHandler } from "./errors.js"
import { track500Responses } from "../../../middleware/error-handler.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

let cachedSpec: unknown = null
function spec(): unknown {
  cachedSpec ??= JSON.parse(
    readFileSync(join(__dirname, "generated", "swagger.json"), "utf-8"),
  )
  return cachedSpec
}

export const publicApiV1Router = express.Router()

publicApiV1Router.use(track500Responses)

publicApiV1Router.get("/openapi.json", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300")
  res.json(spec())
})

publicApiV1Router.use(authenticatePublicRequest)
publicApiV1Router.use(express.json({ limit: "256kb" }))

RegisterRoutes(publicApiV1Router)

publicApiV1Router.use((_req, _res, next) => {
  next(new PublicApiError(404, "NOT_FOUND", "No such public API route"))
})

publicApiV1Router.use(publicErrorHandler)
