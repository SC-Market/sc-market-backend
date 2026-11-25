import { RequestHandler, RequestParamHandler, Router } from "express"
import { isUuid } from "../../v2/util/short-slug.js"
import { createErrorResponse, createNotFoundErrorResponse } from "./response.js"
import { ErrorCode } from "./error-codes.js"

export { isUuid }

/**
 * `router.param` handler that answers 404 NOT_FOUND for a path param that is
 * not a canonical UUID, before any middleware or handler binds it to a uuid
 * column (Postgres rejects the cast with 22P02, which in an async v1 handler
 * escapes Express 4 as an unhandled rejection / 500).
 *
 * Scanners hit the OpenAPI templates literally (`/listings/{listing_id}`), so
 * the bad value is not echoed back.
 */
export function uuidParamGuard(resource: string): RequestParamHandler {
  return (_req, res, next, value) => {
    if (isUuid(value)) {
      next()
      return
    }
    res.status(404).json(createNotFoundErrorResponse(resource))
  }
}

/**
 * Register `uuidParamGuard` on `router` for each `{ param: resource }` entry.
 * Applies to every route on that router that declares the param (router.param
 * does not reach sub-routers, so each router registers its own).
 */
export function requireUuidParams(
  router: Router,
  params: Record<string, string>,
): void {
  for (const [name, resource] of Object.entries(params)) {
    router.param(name, uuidParamGuard(resource))
  }
}

/**
 * Middleware: 400 VALIDATION_ERROR when one of the named query params is
 * present (non-empty) but not a UUID. For optional filters on uuid columns,
 * where a bad value is bad input rather than a missing resource.
 */
export function requireUuidQuery(...names: string[]): RequestHandler {
  return (req, res, next) => {
    for (const name of names) {
      const value = req.query[name]
      if (value === undefined || value === "") continue
      if (!isUuid(value)) {
        res.status(400).json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            `${name} must be a UUID`,
            undefined,
            [{ field: name, message: "must be a UUID", code: "invalid_uuid" }],
          ),
        )
        return
      }
    }
    next()
  }
}
