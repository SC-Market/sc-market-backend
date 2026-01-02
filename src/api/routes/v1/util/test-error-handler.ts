/**
 * Test endpoint for error handler and CORS verification
 *
 * This endpoint is used to test that:
 * 1. CORS headers are present in error responses
 * 2. The error handler properly formats error responses
 * 3. Unhandled errors include CORS headers
 *
 * GET /api/test-error-handler?type=<error_type>
 *
 * Error types:
 * - unhandled: Throws an unhandled error (tests CORS in error handler)
 * - validation: Throws ValidationError
 * - notfound: Throws NotFoundError
 * - business: Throws BusinessLogicError
 * - database: Simulates database constraint error
 */

import { RequestHandler } from "express"
import { createErrorResponse } from "./response.js"
import { ValidationError, NotFoundError, BusinessLogicError } from "./errors.js"
import { ErrorCode } from "./error-codes.js"

export const testErrorHandler: RequestHandler = async (req, res) => {
  const errorType = req.query.type as string

  switch (errorType) {
    case "unhandled":
      // This will be caught by the error handler middleware
      // and should include CORS headers
      throw new Error("This is an unhandled error for testing CORS headers")

    case "validation":
      throw new ValidationError("Test validation error", [
        { field: "test_field", message: "Test validation message" },
      ])

    case "notfound":
      throw new NotFoundError("TestResource", "test-id-123")

    case "business":
      throw new BusinessLogicError(
        ErrorCode.INSUFFICIENT_BALANCE,
        "Test business logic error",
        { testDetail: "value" },
      )

    case "database":
      // Simulate database constraint error
      const dbError = new Error(
        "duplicate key value violates unique constraint",
      )
      throw dbError

    case "normal":
      // Normal response for comparison
      return res.json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Normal error response",
        ),
      )

    default:
      return res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Invalid error type. Use: unhandled, validation, notfound, business, database, or normal",
          ),
        )
  }
}
