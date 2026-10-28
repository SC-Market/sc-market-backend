/**
 * v2 errors for image uploads rejected because of the user's file.
 *
 * cdn.uploadFile throws ImageUploadUserError for those; the v2 controllers
 * turn it into a ValidationError (a 400 from the error handler, not reported
 * to Bugsnag). Anything else cdn.uploadFile throws is a system failure and
 * must be rethrown (a 500).
 */

import { ImageModerationError } from "../../../../clients/image-lambda/image-lambda.js"
import { ImageUploadUserError } from "../../../../clients/image-lambda/image-upload-error.js"
import { ValidationError } from "../../v1/util/errors.js"
import logger from "../../../../logger/logger.js"

/**
 * @param field The multipart field the file came from ("photo", "photos").
 * @param photoLabel Prefix for multi-photo uploads, e.g. "Photo 2".
 */
export function imageUploadValidationError(
  error: ImageUploadUserError,
  field: string,
  photoLabel?: string,
): ValidationError {
  logger.debug("Image upload rejected:", {
    code: error.code,
    error: error.message,
    photo: photoLabel,
  })

  switch (error.code) {
    case "MODERATION_FAILED": {
      // Existing wording: "Rejected for: ..." / "Photo 2 rejected for: ...".
      const reason =
        error instanceof ImageModerationError && error.labels.length > 0
          ? `for: ${error.labels.join(", ")} (${error.confidence.toFixed(0)}% confidence)`
          : null
      const message = photoLabel
        ? reason
          ? `${photoLabel} rejected ${reason}`
          : `${photoLabel} failed content moderation checks`
        : reason
          ? `Rejected ${reason}`
          : "Image failed content moderation checks"
      return new ValidationError("Image failed moderation", [{ field, message }])
    }
    case "VALIDATION_ERROR":
      return new ValidationError("Image failed validation", [
        { field, message: photoLabel ? `${photoLabel}: ${error.message}` : error.message },
      ])
    case "UNSUPPORTED_FORMAT":
    case "UNSUPPORTED_MIME":
      return new ValidationError("Unsupported image format", [
        { field, message: photoLabel ? `${photoLabel}: ${error.message}` : error.message },
      ])
  }
}
