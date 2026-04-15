/**
 * CORS Helper for Error Handler
 *
 * IMPORTANT: This function should ONLY be called in the top-level error handler.
 * Regular CORS middleware (app.use(cors())) handles CORS for normal responses.
 * This is specifically for error responses when routes crash with unhandled errors,
 * ensuring browsers don't block error responses due to missing CORS headers.
 */

import { Request, Response } from "express"
import { env } from "../../config/env.js"

const backend_url = new URL(env.BACKEND_URL || "http://localhost:7000")
const frontend_url = new URL(env.FRONTEND_URL || "http://localhost:5173")

const allowlist: string[] = [
  `http://${backend_url.host}`,
  `https://${backend_url.host}`,
  `http://${frontend_url.host}`,
  `https://${frontend_url.host}`,
  "https://discord.com",
  ...(env.PREMIUM_HOSTS || "")
    .split(",")
    .filter((h) => h.trim())
    .map((h) => `https://${h.trim()}`),
]

// Cache of custom domains from DB
let customDomainCache: string[] = []
let cacheTimestamp = 0
const CACHE_TTL = 60_000

async function getCustomDomains(): Promise<string[]> {
  if (Date.now() - cacheTimestamp < CACHE_TTL) return customDomainCache
  try {
    const { getKnex } = await import("../../clients/database/knex-db.js")
    const rows = await getKnex()("org_premium_tiers")
      .whereNotNull("custom_domain")
      .whereNull("revoked_at")
      .select("custom_domain")
    customDomainCache = rows.flatMap((r: any) => [
      `https://${r.custom_domain}`,
      `http://${r.custom_domain}`,
    ])
    cacheTimestamp = Date.now()
  } catch { /* DB not ready */ }
  return customDomainCache
}

/**
 * Apply CORS headers to response
 *
 * IMPORTANT: This function should ONLY be called in the top-level error handler.
 * Regular CORS middleware handles CORS for normal responses. This is specifically
 * for error responses when routes crash with unhandled errors, ensuring browsers
 * don't block error responses due to missing CORS headers.
 */
export async function applyCorsHeaders(req: Request, res: Response): Promise<void> {
  const origin = req.header("Origin")

  if (origin) {
    // Check static allowlist first (always works, no DB needed)
    let allowed = allowlist.includes(origin)

    // Try dynamic domains only if static didn't match
    if (!allowed) {
      try {
        const dynamicDomains = await getCustomDomains()
        allowed = dynamicDomains.includes(origin)
      } catch {
        // DB failure — fall back to static allowlist only
      }
    }

    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin)
      res.setHeader("Access-Control-Allow-Credentials", "true")
    }
  }

  // Set other CORS headers
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  )
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  )
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Type")
}
