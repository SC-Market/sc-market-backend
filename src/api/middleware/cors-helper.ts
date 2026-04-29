/**
 * CORS Helper for Error Handler
 *
 * IMPORTANT: This function should ONLY be called in the top-level error handler.
 * Regular CORS middleware (app.use(cors())) handles CORS for normal responses.
 * This is specifically for error responses when routes crash with unhandled errors,
 * ensuring browsers don't block error responses due to missing CORS headers.
 */

import { Request, Response } from "express"
import { isOriginAllowedAsync } from "../util/allowed-origins.js"

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
    const allowed = await isOriginAllowedAsync(origin)
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
