import { Request, Response, NextFunction } from "express"
import { ValidateError } from "tsoa"
import {
  createErrorResponse,
  ErrorCode,
  StandardErrorResponse,
} from "../routes/v1/util/response.js"
import logger from "../../logger/logger.js"

/**
 * TSOA error handler middleware
 * 
 * Transforms TSOA-specific errors (ValidateError, authentication errors, etc.)
 * to match the legacy error response format for backward compatibility.
 * 
 * This middleware ensures that API clients see consistent error responses
 * regardless of whether the endpoint is using TSOA or legacy routing.
 * 
 * Error transformations:
 * - ValidateError (TSOA validation) -> 400 with VALIDATION_ERROR code
 * - Authentication errors -> 401 with UNAUTHORIZED code
 * - Authorization errors -> 403 with FORBIDDEN code
 * - Custom errors with status codes -> Preserved status with appropriate code
 * - Unhandled errors -> 500 with INTERNAL_SERVER_ERROR code
 * 
 * All errors are logged with appropriate context for debugging.
 * 
 * @param err - Error object from TSOA or controller
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function tsoaErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err)
  }

  // Handle TSOA validation errors
  if (err instanceof ValidateError) {
    logger.warn("TSOA validation error", {
      fields: err.fields,
      path: req.path,
      method: req.method,
    })

    const response: StandardErrorResponse = createErrorResponse(
      ErrorCode.VALIDATION_ERROR,
      "Validation failed",
      { fields: err.fields },
    )

    res.status(400).json(response)
    return
  }

  // Handle authentication errors from expressAuthentication
  if (
    err.message === "Not authenticated" ||
    err.message === "No bearer token provided" ||
    err.message === "Invalid or expired token" ||
    err.message === "User is banned"
  ) {
    logger.warn("TSOA authentication error", {
      message: err.message,
      path: req.path,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      isAuthenticated: req.isAuthenticated?.(),
    })

    const response: StandardErrorResponse = createErrorResponse(
      ErrorCode.UNAUTHORIZED,
      err.message,
    )

    res.status(401).json(response)
    return
  }

  // Handle authorization errors from expressAuthentication
  if (
    err.message === "Admin access required" ||
    err.message === "Insufficient permissions"
  ) {
    logger.warn("TSOA authorization error", {
      message: err.message,
      path: req.path,
      method: req.method,
      user: req.user ? (req.user as any).user_id : undefined,
    })

    const response: StandardErrorResponse = createErrorResponse(
      ErrorCode.FORBIDDEN,
      err.message,
    )

    res.status(403).json(response)
    return
  }

  // Handle custom errors with status codes (from BaseController.handleError)
  if (err.status && typeof err.status === "number") {
    logger.warn("TSOA custom error", {
      status: err.status,
      code: err.code,
      message: err.message,
      path: req.path,
      method: req.method,
    })

    const response: StandardErrorResponse = createErrorResponse(
      err.code || ErrorCode.INTERNAL_SERVER_ERROR,
      err.message || "An error occurred",
      err.details,
    )

    res.status(err.status).json(response)
    return
  }

  // Handle unknown security scheme error
  if (err.message === "Unknown security scheme") {
    logger.error("TSOA unknown security scheme", {
      message: err.message,
      path: req.path,
      method: req.method,
    })

    const response: StandardErrorResponse = createErrorResponse(
      ErrorCode.INTERNAL_SERVER_ERROR,
      "Authentication configuration error",
    )

    res.status(500).json(response)
    return
  }

  // Default error handler for unhandled errors
  logger.error("Unhandled error in TSOA route", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
    user: req.user ? (req.user as any).user_id : undefined,
  })

  const response: StandardErrorResponse = createErrorResponse(
    ErrorCode.INTERNAL_SERVER_ERROR,
    "Internal server error",
  )

  res.status(500).json(response)
}
