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
import logger from "../../../../logger/logger.js"

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

    const file = (request as any).file as Express.Multer.File | undefined

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
    } catch (uploadError: any) {
      const msg = uploadError?.message || "Image upload failed"

      if (
        msg.includes("moderation") ||
        msg.includes("Moderation") ||
        msg.includes("MODERATION")
      ) {
        this.throwValidationError("Image failed moderation", [
          { field: "photo", message: `Image was rejected: ${msg}` },
        ])
      }

      if (
        msg.includes("Unsupported") ||
        msg.includes("UNSUPPORTED")
      ) {
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
