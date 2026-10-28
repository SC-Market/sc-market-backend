/**
 * An image upload rejected because of the user's file, not a system failure.
 *
 * Handlers map this to a 400 (see v1/util/image-upload-errors.ts and
 * v2/images/image-upload-errors.ts). Anything else thrown by cdn.uploadFile is
 * a system failure: a 500 that is logged as an error and reaches Bugsnag.
 *
 * - MODERATION_FAILED, VALIDATION_ERROR, UNSUPPORTED_FORMAT: the image
 *   Lambda's user-fault error codes.
 * - UNSUPPORTED_MIME: BackBlazeCDN.uploadFile's MIME check, before the Lambda.
 */
export type ImageUploadUserErrorCode =
  | "MODERATION_FAILED"
  | "VALIDATION_ERROR"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_MIME"

export class ImageUploadUserError extends Error {
  public readonly code: ImageUploadUserErrorCode

  constructor(code: ImageUploadUserErrorCode, message: string) {
    super(message)
    this.name = "ImageUploadUserError"
    this.code = code
  }
}
