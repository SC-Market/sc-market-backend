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
import multer from "multer"
import {
  createErrorResponse,
  ValidationError as ValidationErrorType,
} from "../routes/v1/util/response.js"
import { ErrorCode } from "../routes/v1/util/error-codes.js"
import {
  isTestIsolationDbError,
  testIsolationError,
} from "../../services/test-accounts/isolation.js"
import {
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} from "../routes/v1/util/errors.js"
import {
  InvalidQuantityError,
  InsufficientStockError,
  OverAllocationError,
  CharacterLimitError,
  ConcurrentModificationError,
} from "../../services/stock-lot/errors.js"
import { applyCorsHeaders } from "./cors-helper.js"
import logger from "../../logger/logger.js"

/**
 * The subset of the Bugsnag client this module uses. Declared locally (rather
 * than importing `BugsnagStatic`) because the module is loaded lazily and may
 * legitimately be absent, so we only ever touch these two members.
 */
interface BugsnagLike {
  isStarted?: () => boolean
  notify: (
    error: Error,
    onError?: (event: {
      addMetadata: (section: string, values: Record<string, unknown>) => void
    }) => void,
  ) => void
}

/**
 * `@bugsnag/js` is CJS, so under esModuleInterop the awaited namespace nests the
 * real client under `default`. The shipped .d.ts does not describe that interop
 * shape, so the value is narrowed structurally rather than asserted.
 */
function isBugsnagClient(value: unknown): value is BugsnagLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { notify?: unknown }).notify === "function"
  )
}

function asBugsnagClient(module: unknown): BugsnagLike | false {
  if (typeof module !== "object" || module === null) return false
  const named = (module as { default?: unknown }).default
  if (isBugsnagClient(named)) return named
  if (isBugsnagClient(module)) return module
  return false
}

// Bugsnag reference — populated lazily. `false` marks it as unavailable.
let Bugsnag: BugsnagLike | false | null = null

async function ensureBugsnag(): Promise<BugsnagLike | false> {
  if (Bugsnag !== null) return Bugsnag
  try {
    Bugsnag = asBugsnagClient(await import("@bugsnag/js"))
  } catch {
    Bugsnag = false // mark as unavailable
  }
  return Bugsnag
}

function notifyBugsnag(err: Error, req: Request) {
  ensureBugsnag().then((bs) => {
    if (!bs || !bs.isStarted?.()) return
    try {
      bs.notify(err, (event) => {
        event.addMetadata("request", {
          path: req.path,
          method: req.method,
          user_id: req.user?.user_id,
          request_id: req.requestId,
        })
      })
    } catch { /* ignore */ }
  }).catch(() => {})
}

/**
 * Pull a human-readable message out of an error response body. Bodies are
 * either a StandardErrorResponse (`{ error: { message } }`) or a legacy
 * `{ error: "..." }`; anything else falls back to a generic label.
 */
function describeErrorBody(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const { error } = body as { error: unknown }
    if (typeof error === "object" && error !== null) {
      const { message } = error as { message?: unknown }
      if (message) return String(message)
    }
    if (error) return String(error)
  }
  return "Internal Server Error"
}

/**
 * Middleware that intercepts 500 responses to log them in Bugsnag.
 */
export function track500Responses(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res)
  res.json = function(this: Response, body?: unknown) {
    if (res.statusCode >= 500) {
      const message = describeErrorBody(body)
      notifyBugsnag(new Error(`[${res.statusCode}] ${req.method} ${req.path}: ${message}`), req)
    }
    return originalJson(body)
  }
  next()
}

/**
 * AJV validation error structure
 */
interface AjvValidationError {
  instancePath: string
  schemaPath: string
  keyword: string
  // AJV's `params` payload varies by keyword; only the two members this handler
  // reads are described.
  params: {
    missingProperty?: string
    allowedValues?: unknown[]
  }
  message: string
}

/**
 * Read the `validationErrors` array that the @wesleytodd/openapi validation
 * middleware attaches to the thrown error (or, when wrapped by http-errors, to
 * its `cause`). It is not part of the Error type, hence the structural read.
 */
function readValidationErrors(
  source: unknown,
): AjvValidationError[] | undefined {
  if (typeof source !== "object" || source === null) return undefined
  const { validationErrors } = source as { validationErrors?: unknown }
  return Array.isArray(validationErrors)
    ? (validationErrors as AjvValidationError[])
    : undefined
}

/**
 * Convert AJV validation errors to frontend-friendly format
 */
function convertAjvErrorsToValidationErrors(
  ajvErrors: AjvValidationError[] | undefined,
): ValidationErrorType[] {
  if (!ajvErrors || !Array.isArray(ajvErrors)) {
    return []
  }

  return ajvErrors.map((ajvError) => {
    // Extract field name from instancePath
    // instancePath format: "/query/index" or "/params/post_id" or "/body/title"
    // We want to extract the field name in a user-friendly way
    const pathParts = ajvError.instancePath.split("/").filter(Boolean)

    if (pathParts.length === 0) {
      // Root level error (e.g., missing required property at root)
      const missingProperty = ajvError.params?.missingProperty
      return {
        field: missingProperty || "request",
        message: ajvError.message,
        code: ajvError.keyword,
      }
    }

    const location = pathParts[0] // query, params, body, headers
    const fieldPath = pathParts.slice(1)

    // For query/params, use just the parameter name
    // For body, use the full path if nested
    let field: string
    if (location === "query" || location === "params") {
      field = fieldPath[0] || location
    } else if (location === "body") {
      field = fieldPath.length > 0 ? fieldPath.join(".") : "body"
    } else {
      field =
        fieldPath.length > 0 ? `${location}.${fieldPath.join(".")}` : location
    }

    // Enhance message with field context and additional details
    let message = ajvError.message

    // Add field context first if not already present
    if (!message.toLowerCase().includes(field.toLowerCase())) {
      message = `${field}: ${message}`
    }

    // For enum errors, include the allowed values after the field context
    if (ajvError.keyword === "enum" && ajvError.params?.allowedValues) {
      const allowedValues = ajvError.params.allowedValues
      const valuesList =
        allowedValues.length <= 10
          ? allowedValues.map((v) => `"${v}"`).join(", ")
          : `${allowedValues
              .slice(0, 10)
              .map((v) => `"${v}"`)
              .join(", ")}, ... (${allowedValues.length} total)`
      message = `${message}. Allowed values: ${valuesList}`
    }

    return {
      field,
      message,
      code: ajvError.keyword,
    }
  })
}

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
    case ErrorCode.MFA_LOCKED:
      return 429
    case ErrorCode.MFA_REQUIRED:
    case ErrorCode.MFA_ENROLLMENT_REQUIRED:
    case ErrorCode.MFA_STEP_UP_REQUIRED:
      // 403, not 401: on 401 the frontend refreshes the session and retries,
      // which does nothing for MFA.
      return 403
    case ErrorCode.MFA_INVALID_CODE:
      return 400
    case ErrorCode.MFA_SESSION_UNSUPPORTED:
      return 409
    case ErrorCode.MFA_NOT_CONFIGURED:
      return 503
    case ErrorCode.INTERNAL_SERVER_ERROR:
    case ErrorCode.DATABASE_ERROR:
    case ErrorCode.SERVICE_UNAVAILABLE:
      return 500
    default:
      return 500
  }
}

/**
 * Postgres SQLSTATE 22P02 (invalid_text_representation): a value that cannot be
 * cast to the column type — almost always a non-UUID bound to a uuid column.
 * That is bad client input, not a server fault. pg/knex put the SQLSTATE on
 * `code` (knex may nest the driver error under `cause`/`nativeError`).
 */
const PG_INVALID_TEXT_REPRESENTATION = "22P02"

function isPgInvalidTextRepresentation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false
  const e = err as { code?: unknown; cause?: unknown; nativeError?: unknown }
  if (e.code === PG_INVALID_TEXT_REPRESENTATION) return true
  return (
    isPgCode(e.cause, PG_INVALID_TEXT_REPRESENTATION) ||
    isPgCode(e.nativeError, PG_INVALID_TEXT_REPRESENTATION)
  )
}

function isPgCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { code?: unknown }).code === code
  )
}

/**
 * Top-level error handler middleware
 *
 * Handles all unhandled errors and ensures CORS headers are present
 * in error responses so browsers don't block them.
 */
export async function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // CRITICAL: Apply CORS headers before sending any error response
  // This ensures browsers don't block error responses when routes crash
  // Only apply if headers haven't been sent yet
  if (!res.headersSent) {
    try {
      await applyCorsHeaders(req, res)
    } catch {
      // CORS header application failed — continue to send error response anyway
    }
  }

  // Log error with context — only log unexpected errors, not client errors
  const isClientError =
    err instanceof multer.MulterError ||
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof InvalidQuantityError ||
    err instanceof InsufficientStockError ||
    err instanceof OverAllocationError ||
    err instanceof CharacterLimitError ||
    err instanceof ConcurrentModificationError ||
    (err instanceof BusinessLogicError &&
      [
        ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN, ErrorCode.VALIDATION_ERROR, ErrorCode.NOT_FOUND, ErrorCode.CONFLICT,
        ErrorCode.RATE_LIMIT_EXCEEDED, ErrorCode.MFA_REQUIRED, ErrorCode.MFA_ENROLLMENT_REQUIRED,
        ErrorCode.MFA_STEP_UP_REQUIRED, ErrorCode.MFA_INVALID_CODE, ErrorCode.MFA_LOCKED,
        ErrorCode.MFA_SESSION_UNSUPPORTED,
      ].includes(err.code as ErrorCode))

  // Safety net for endpoints that bind an unvalidated id to a uuid column.
  // Endpoints should validate ids themselves (isUuid -> 404/400); anything that
  // still reaches Postgres malformed is answered as a 400, never a 500. The
  // driver message embeds the SQL and the bad value, so it is not echoed back.
  if (isPgInvalidTextRepresentation(err)) {
    logger.warn("Invalid input rejected by database (22P02)", {
      path: req.path,
      method: req.method,
      user_id: req.user?.user_id,
    })
    if (res.headersSent) return next(err)
    return res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Invalid identifier or value format in request",
        ),
      )
  }

  // A test-account isolation trigger refused a row mixing test and real
  // parties (migration 20261026100000_test_accounts). Same 403 as the
  // application-level check.
  if (isTestIsolationDbError(err)) {
    logger.warn("Test-account isolation refused a write", {
      path: req.path,
      method: req.method,
      user_id: req.user?.user_id,
    })
    if (res.headersSent) return next(err)
    const e = testIsolationError()
    return res.status(403).json(createErrorResponse(e.code, e.message, e.details))
  }

  if (!isClientError) {
    logger.error("Request error", {
      error: err,
      path: req.path,
      method: req.method,
      user_id: req.user?.user_id,
      stack: err.stack,
    })
  }

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err)
  }

  // Handle OpenAPI validation errors
  // These come from @wesleytodd/openapi validation middleware
  // The validation errors are attached to the error object as err.validationErrors
  // Note: http-errors may wrap the original error, so we check both the error and its cause
  if (
    err.message === "Request validation failed" ||
    err.message?.includes("Request validation failed")
  ) {
    // Extract AJV validation errors from the error object — attached by the
    // @wesleytodd/openapi validation middleware, so not on the Error type.
    let ajvErrors = readValidationErrors(err)

    // If not found, check the cause (http-errors may wrap the original error)
    if (!ajvErrors && err.cause) {
      ajvErrors = readValidationErrors(err.cause)
    }

    // Convert AJV errors to frontend-friendly format
    const validationErrors = convertAjvErrorsToValidationErrors(ajvErrors)

    return res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          validationErrors.length > 0
            ? `Request validation failed: ${validationErrors.map((e) => e.message).join("; ")}`
            : "Request validation failed",
          undefined,
          validationErrors,
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
    return res.status(404).json(
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

  // Handle stock/quantity errors as 400 (client errors, not server errors)
  if (
    err instanceof InvalidQuantityError ||
    err instanceof InsufficientStockError ||
    err instanceof OverAllocationError ||
    err instanceof CharacterLimitError
  ) {
    return res.status(400).json(
      createErrorResponse(
        err.code || ErrorCode.VALIDATION_ERROR,
        err.message,
        err.toJSON(),
      ),
    )
  }

  if (err instanceof ConcurrentModificationError) {
    return res.status(409).json(
      createErrorResponse(
        err.code || ErrorCode.CONFLICT,
        err.message,
        err.toJSON(),
      ),
    )
  }

  // Multer file-upload errors (e.g. a file that exceeds the size limit).
  // Without this branch multer's error falls through to the generic 500 below,
  // so an oversized image surfaced to the user as "An unexpected error
  // occurred" instead of an actionable message. Map the size limit to 413
  // (Payload Too Large) and the remaining multer limits to 400.
  if (err instanceof multer.MulterError) {
    const multerMessages: Record<string, string> = {
      LIMIT_FILE_SIZE:
        "File too large. Please upload a smaller file and try again.",
      LIMIT_FILE_COUNT: "Too many files uploaded.",
      LIMIT_UNEXPECTED_FILE: "Unexpected file field in upload.",
      LIMIT_PART_COUNT: "Too many parts in the upload.",
      LIMIT_FIELD_KEY: "Upload field name is too long.",
      LIMIT_FIELD_VALUE: "Upload field value is too long.",
      LIMIT_FIELD_COUNT: "Too many fields in the upload.",
    }
    const message = multerMessages[err.code] || "File upload failed."
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400
    return res.status(status).json(
      createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        message,
        { code: err.code },
        [{ field: err.field || "file", message, code: err.code }],
      ),
    )
  }

  // Database errors
  if (
    err.message?.includes("violates foreign key constraint") ||
    err.message?.includes("duplicate key value") ||
    err.message?.includes("unique constraint")
  ) {
    // The driver message names tables, columns, constraints and the
    // conflicting values: log it, never send it to the client.
    logger.warn("Database constraint violation", {
      path: req.path,
      method: req.method,
      error: err.message,
    })
    return res
      .status(409)
      .json(
        createErrorResponse(
          ErrorCode.CONFLICT,
          "This conflicts with existing data. Please refresh and try again.",
        ),
      )
  }

  // Default to internal server error
  notifyBugsnag(err, req)
  res
    .status(500)
    .json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "An unexpected error occurred",
      ),
    )
}
