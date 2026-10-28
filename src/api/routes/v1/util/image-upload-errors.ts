/**
 * v1 responses for image uploads rejected because of the user's file.
 *
 * cdn.uploadFile throws ImageUploadUserError for those; anything else it
 * throws is a system failure, which the handler reports as a 500 with
 * logger.error. User faults are a 400, logged at debug, and never reach
 * Bugsnag (which picks up 500s).
 *
 * The v1 upload handlers use two response styles, so there is one function
 * per style; both keep the wording the handlers already returned.
 */

import type { Response } from "express"
import { ImageUploadUserError } from "../../../../clients/image-lambda/image-upload-error.js"
import logger from "../../../../logger/logger.js"
import { createErrorResponse, ErrorCode } from "./response.js"

/**
 * Profile and contractor avatar / banner uploads (legacy
 * `{ error, message, details }` body).
 */
export function sendImageUploadUserError(
  res: Response,
  error: ImageUploadUserError,
  subject: "avatar" | "banner",
): void {
  const Subject = subject === "avatar" ? "Avatar" : "Banner"
  logger.debug(`${Subject} upload rejected:`, {
    code: error.code,
    error: error.message,
  })

  switch (error.code) {
    case "MODERATION_FAILED":
      res.status(400).json(
        createErrorResponse({
          error: "Content Moderation Failed",
          message: `${Subject} failed content moderation checks`,
          details: `The ${subject} image contains inappropriate content and cannot be uploaded.`,
        }),
      )
      return
    case "VALIDATION_ERROR":
    case "UNSUPPORTED_FORMAT":
      res.status(400).json(
        createErrorResponse({
          error: "Validation Failed",
          message: `${Subject} failed validation: ${error.message}`,
          details: "Please check the file format and try again.",
        }),
      )
      return
    case "UNSUPPORTED_MIME":
      res.status(400).json(
        createErrorResponse({
          error: "Unsupported File Type",
          message: `${Subject} has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.`,
          details: `Please ensure the ${subject} is in a supported format.`,
        }),
      )
      return
  }
}

/**
 * Service photo uploads (`createErrorResponse(code, message, details)` body).
 * `photoNumber` is 1-based.
 */
export function sendPhotoUploadUserError(
  res: Response,
  error: ImageUploadUserError,
  photoNumber: number,
): void {
  logger.debug(`Photo ${photoNumber} upload rejected:`, {
    code: error.code,
    error: error.message,
  })

  switch (error.code) {
    case "MODERATION_FAILED":
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          `Photo ${photoNumber} failed content moderation checks and cannot be uploaded.`,
          { details: "One or more photos contain inappropriate content." },
        ),
      )
      return
    case "VALIDATION_ERROR":
    case "UNSUPPORTED_FORMAT":
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          `Photo ${photoNumber} failed validation: ${error.message}`,
          { details: "Please check the file format and try again." },
        ),
      )
      return
    case "UNSUPPORTED_MIME":
      res.status(400).json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          `Photo ${photoNumber} has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.`,
          { details: "Please ensure all photos are in supported formats." },
        ),
      )
      return
  }
}
