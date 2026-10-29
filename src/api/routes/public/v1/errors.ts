/**
 * Errors of the public API, in the envelope of design doc §6:
 *   { "error": { "code", "message", "details"?, "validationErrors"? } }
 *
 * Codes: VALIDATION_ERROR, UNAUTHORIZED, INVALID_TOKEN, FORBIDDEN,
 * INSUFFICIENT_SCOPE, ACCOUNT_BANNED, NOT_FOUND, CONFLICT,
 * RATE_LIMIT_EXCEEDED, SERVICE_UNAVAILABLE, INTERNAL_SERVER_ERROR.
 */

import type { NextFunction, Request, Response } from "express"
import { ValidateError } from "tsoa"
import {
  BusinessLogicError,
  NotFoundError,
  ValidationError,
} from "../../v1/util/errors.js"
import logger from "../../../../logger/logger.js"

export type PublicErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "INVALID_TOKEN"
  | "FORBIDDEN"
  | "INSUFFICIENT_SCOPE"
  | "ACCOUNT_BANNED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT_EXCEEDED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_SERVER_ERROR"

export interface PublicValidationError {
  field: string
  message: string
  code: string
}

/** The error body of every non-2xx public API response. */
export interface PublicErrorBody {
  error: {
    code: PublicErrorCode
    message: string
    details?: Record<string, unknown>
    validationErrors?: PublicValidationError[]
  }
}

export class PublicApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: PublicErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly headers?: Record<string, string>,
  ) {
    super(message)
    this.name = "PublicApiError"
  }
}

export const notFound = (what = "Resource") =>
  new PublicApiError(404, "NOT_FOUND", `${what} not found`)

function body(
  code: PublicErrorCode,
  message: string,
  details?: Record<string, unknown>,
  validationErrors?: PublicValidationError[],
): PublicErrorBody {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(validationErrors?.length ? { validationErrors } : {}),
    },
  }
}

export function sendPublicError(res: Response, err: PublicApiError): void {
  for (const [k, v] of Object.entries(err.headers ?? {})) res.setHeader(k, v)
  if (err.status === 401)
    res.setHeader("WWW-Authenticate", 'Bearer realm="sc-market-public-api"')
  res.status(err.status).json(body(err.code, err.message, err.details))
}

const BUSINESS_STATUS: Record<string, [number, PublicErrorCode]> = {
  VALIDATION_ERROR: [400, "VALIDATION_ERROR"],
  UNAUTHORIZED: [401, "UNAUTHORIZED"],
  FORBIDDEN: [403, "FORBIDDEN"],
  NOT_FOUND: [404, "NOT_FOUND"],
  CONFLICT: [409, "CONFLICT"],
  RATE_LIMIT_EXCEEDED: [429, "RATE_LIMIT_EXCEEDED"],
}

/** Express error handler for the public router. Never passes errors on. */
export function publicErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return

  if (err instanceof PublicApiError) return sendPublicError(res, err)

  if (err instanceof ValidateError) {
    const fields = Object.entries(err.fields).map(([field, f]) => ({
      field,
      message: f.message,
      code: "VALIDATION_ERROR",
    }))
    res
      .status(400)
      .json(
        body(
          "VALIDATION_ERROR",
          "Request validation failed",
          undefined,
          fields,
        ),
      )
    return
  }
  if (err instanceof ValidationError) {
    const fields = (err.validationErrors ?? []).map((v) => ({
      field: v.field ?? "",
      message: v.message,
      code: v.code ?? "VALIDATION_ERROR",
    }))
    res
      .status(400)
      .json(body("VALIDATION_ERROR", err.message, undefined, fields))
    return
  }
  if (err instanceof NotFoundError) {
    res.status(404).json(body("NOT_FOUND", err.message))
    return
  }
  if (err instanceof BusinessLogicError && BUSINESS_STATUS[err.code]) {
    const [status, code] = BUSINESS_STATUS[err.code]
    res.status(status).json(body(code, err.message))
    return
  }
  // The public pool is full (acquireConnectionTimeout): back off.
  if (err instanceof Error && err.name === "KnexTimeoutError") {
    res.setHeader("Retry-After", "5")
    res
      .status(503)
      .json(
        body("SERVICE_UNAVAILABLE", "The public API is busy, retry shortly"),
      )
    return
  }
  // body-parser: malformed JSON, too large, wrong charset.
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode
  const type = (err as { type?: string })?.type
  if (type === "entity.too.large") {
    res
      .status(413)
      .json(body("VALIDATION_ERROR", "Request body too large (256 kB max)"))
    return
  }
  if (type === "entity.parse.failed") {
    res.status(400).json(body("VALIDATION_ERROR", "Malformed JSON body"))
    return
  }
  // statement_timeout / lock_timeout on the public pool.
  const pgCode = (err as { code?: string })?.code
  if (pgCode === "57014" || pgCode === "55P03") {
    res.setHeader("Retry-After", "5")
    res
      .status(503)
      .json(
        body("SERVICE_UNAVAILABLE", "The request took too long, retry shortly"),
      )
    return
  }
  if (status && status >= 400 && status < 500) {
    const code: PublicErrorCode =
      status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "FORBIDDEN"
          : status === 404
            ? "NOT_FOUND"
            : "VALIDATION_ERROR"
    res
      .status(status)
      .json(body(code, (err as Error)?.message || "Request refused"))
    return
  }

  logger.error("Public API request failed", {
    path: req.originalUrl,
    method: req.method,
    error: err,
  })
  res.status(500).json(body("INTERNAL_SERVER_ERROR", "Internal server error"))
}
