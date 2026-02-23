/**
 * TSOA Error Handler Middleware
 *
 * Transforms TSOA-specific errors to match v1 error format for consistency.
 * This middleware should be applied to the v2 router before the main error handler.
 */

import { Request, Response, NextFunction } from "express"
import { ValidateError } from "tsoa"
import {
  createErrorResponse,
  ValidationError as ValidationErrorType,
} from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import logger from "../../logger/logger.js"

/**
 * Transform TSOA ValidateError to v1 validation error format
 */
function transformTsoaValidationError(
  tsoaError: ValidateError,
): ValidationErrorType[] {
  const validationErrors: ValidationErrorType[] = []

  // TSOA ValidateError has a 'fields' property with validation details
  // Format: { fieldName: { message: string, value?: any } }
  for (const [fieldName, fieldError] of Object.entries(tsoaError.fields)) {
    validationErrors.push({
      field: fieldName,
      message: fieldError.message,
      code: "VALIDATION_ERROR",
    })
  }

  return validationErrors
}

/**
 * TSOA error handler middleware
 *
 * Catches TSOA-specific errors and transforms them to v1 error format.
 * Should be mounted on the v2 router before other error handlers.
 */
export function tsoaErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // TSOA validation errors
  if (err instanceof ValidateError) {
    logger.warn("TSOA validation error", {
      path: req.path,
      method: req.method,
      fields: err.fields,
    })

    const validationErrors = transformTsoaValidationError(err)

    res.status(400).json(
      createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Request validation failed",
        undefined,
        validationErrors,
      ),
    )
    return
  }

  // TSOA authentication errors (thrown by authentication handler)
  // These come with status 401
  if (err.status === 401 || err.statusCode === 401) {
    logger.warn("TSOA authentication error", {
      path: req.path,
      method: req.method,
      message: err.message,
    })

    res.status(401).json(
      createErrorResponse(
        ErrorCode.UNAUTHORIZED,
        err.message || "Authentication required",
      ),
    )
    return
  }

  // TSOA authorization errors
  // These come with status 403
  if (err.status === 403 || err.statusCode === 403) {
    logger.warn("TSOA authorization error", {
      path: req.path,
      method: req.method,
      message: err.message,
    })

    res.status(403).json(
      createErrorResponse(
        ErrorCode.FORBIDDEN,
        err.message || "Access denied",
      ),
    )
    return
  }

  // TSOA not found errors
  // These come with status 404
  if (err.status === 404 || err.statusCode === 404) {
    res.status(404).json(
      createErrorResponse(
        ErrorCode.NOT_FOUND,
        err.message || "Resource not found",
      ),
    )
    return
  }

  // Pass other errors to the next error handler (main error handler)
  next(err)
}
