/**
 * Top-level Error Handler Middleware
 *
 * CRITICAL: This is the ONLY place where applyCorsHeaders should be called.
 * This ensures CORS headers are present even when routes crash with unhandled errors,
 * preventing browsers from blocking error responses.
 *
 * Regular CORS middleware (app.use(cors())) handles CORS for normal responses.
 * This handler is specifically for error cases where CORS headers might be missing.
 */

import { Request, Response, NextFunction } from "express"
import { createErrorResponse } from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import {
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} from "../routes/v1/util/errors.js"
import { applyCorsHeaders } from "./cors-helper.js"
import logger from "../../logger/logger.js"

/**
 * Get HTTP status code for error code
 */
function getStatusCodeForErrorCode(code: ErrorCode | string): number {
  switch (code) {
    case ErrorCode.VALIDATION_ERROR:
      return 400
    case ErrorCode.UNAUTHORIZED:
      return 401
    case ErrorCode.FORBIDDEN:
      return 403
    case ErrorCode.NOT_FOUND:
      return 404
    case ErrorCode.CONFLICT:
      return 409
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429
    case ErrorCode.INTERNAL_SERVER_ERROR:
    case ErrorCode.DATABASE_ERROR:
    case ErrorCode.SERVICE_UNAVAILABLE:
      return 500
    default:
      return 500
  }
}

/**
 * Top-level error handler middleware
 *
 * Handles all unhandled errors and ensures CORS headers are present
 * in error responses so browsers don't block them.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // CRITICAL: Apply CORS headers before sending any error response
  // This ensures browsers don't block error responses when routes crash
  // Only apply if headers haven't been sent yet
  if (!res.headersSent) {
    applyCorsHeaders(req, res)
  }

  // Log error with context
  logger.error("Request error", {
    error: err,
    path: req.path,
    method: req.method,
    user_id: (req.user as any)?.user_id,
    stack: err.stack,
  })

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err)
  }

  // Handle OpenAPI validation errors
  // These come from @wesleytodd/openapi validation middleware
  if (
    err.message === "Request validation failed" ||
    err.message?.includes("Request validation failed")
  ) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Request validation failed",
          { originalError: err.message },
        ),
      )
  }

  // Handle known error types
  if (err instanceof ValidationError) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          err.message,
          undefined,
          err.validationErrors,
        ),
      )
  }

  if (err instanceof NotFoundError) {
    return res
      .status(404)
      .json(
        createErrorResponse(ErrorCode.NOT_FOUND, err.message, {
          resource: err.resource,
          identifier: err.identifier,
        }),
      )
  }

  if (err instanceof BusinessLogicError) {
    const statusCode = getStatusCodeForErrorCode(err.code)
    return res
      .status(statusCode)
      .json(createErrorResponse(err.code, err.message, err.details))
  }

  // Database errors
  if (
    err.message?.includes("violates foreign key constraint") ||
    err.message?.includes("duplicate key value") ||
    err.message?.includes("unique constraint")
  ) {
    return res
      .status(409)
      .json(
        createErrorResponse(
          ErrorCode.CONFLICT,
          "Database constraint violation",
          { originalError: err.message },
        ),
      )
  }

  // Default to internal server error
  res
    .status(500)
    .json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "An unexpected error occurred",
      ),
    )
}
