/**
 * Images V2 Controller
 *
 * TSOA controller for standalone image uploads.
 * Allows uploading and validating images before form submission (two-phase upload).
 * Returns a resource_id that can be referenced when creating/updating listings.
 */

import { Post, Route, Tags, Request, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import fs from "node:fs"
import crypto from "crypto"
import { BaseController } from "../base/BaseController.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { ImageModerationError } from "../../../../clients/image-lambda/image-lambda.js"
import logger from "../../../../logger/logger.js"

/**
 * Narrow an unknown thrown value to something carrying a string `message`.
 * The CDN client rejects with plain objects as well as Error instances, so
 * `instanceof Error` alone would miss those.
 */
function hasMessage(value: unknown): value is { message?: string } {
  return typeof value === "object" && value !== null && "message" in value
}

/**
 * Response for a single image upload
 */
export interface ImageUploadResponse {
  resource_id: string
  url: string
}

@Route("images")
@Tags("Images V2")
export class ImagesV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Upload a single image
   *
   * Uploads and validates an image immediately (before form submission).
   * The returned resource_id can be used in photo_resource_ids when creating a listing.
   *
   * @summary Upload image
   * @param request Express request (multer populates req.file)
   * @returns The uploaded image resource_id and CDN URL
   */
  @Security("loggedin")
  @Post("upload")
  public async uploadImage(
    @Request() request: ExpressRequest,
  ): Promise<ImageUploadResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    const file = request.file

    if (!file) {
      this.throwValidationError("No image provided", [
        { field: "photo", message: "An image file is required" },
      ])
    }

    try {
      const ext = file.mimetype.split("/")[1] || "png"
      const filename = `upload-${userId}-${crypto.randomUUID()}.${ext}`

      logger.info("Uploading standalone image", {
        userId,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      })

      const resource = await cdn.uploadFile(
        filename,
        file.path,
        file.mimetype,
      )

      const url =
        resource.external_url ||
        `https://cdn.sc-market.space/${resource.filename}`

      logger.info("Standalone image uploaded successfully", {
        userId,
        resourceId: resource.resource_id,
      })

      return {
        resource_id: resource.resource_id,
        url,
      }
    } catch (uploadError: unknown) {
      if (uploadError instanceof ImageModerationError) {
        this.throwValidationError("Image failed moderation", [
          {
            field: "photo",
            message: uploadError.labels.length > 0
              ? `Rejected for: ${uploadError.labels.join(", ")} (${uploadError.confidence.toFixed(0)}% confidence)`
              : "Image failed content moderation checks",
          },
        ])
      }

      const msg = hasMessage(uploadError)
        ? uploadError.message || "Image upload failed"
        : "Image upload failed"

      if (msg.includes("Unsupported") || msg.includes("UNSUPPORTED")) {
        this.throwValidationError("Unsupported image format", [
          { field: "photo", message: msg },
        ])
      }

      throw uploadError
    } finally {
      // Clean up temp file
      if (file?.path) {
        try {
          fs.unlinkSync(file.path)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}
