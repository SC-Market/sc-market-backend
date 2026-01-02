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

/**
 * Apply CORS headers to response
 *
 * IMPORTANT: This function should ONLY be called in the top-level error handler.
 * Regular CORS middleware handles CORS for normal responses. This is specifically
 * for error responses when routes crash with unhandled errors, ensuring browsers
 * don't block error responses due to missing CORS headers.
 */
export function applyCorsHeaders(req: Request, res: Response): void {
  const origin = req.header("Origin")

  // Check if origin is in allowlist
  if (origin && allowlist.indexOf(origin) !== -1) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
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
