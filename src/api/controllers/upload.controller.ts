/**
 * Upload Controller
 *
 * Handles file upload endpoints with multer integration.
 * Supports photo uploads with validation for size and type.
 *
 * Requirements:
 * - 7.1: Integrate with existing multer middleware
 * - 7.2: Generate correct OpenAPI spec for multipart/form-data
 * - 7.3: Maintain same upload behavior as legacy system
 * - 7.4: Enforce same file size and type restrictions
 */

import {
  Controller,
  Post,
  Route,
  UploadedFile,
  Security,
  Middlewares,
  Request,
  Response,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController, ValidationErrorClass } from "./base.controller.js"
import { PhotoUploadResponse } from "../models/upload.models.js"
import {
  ErrorResponse,
  Unauthorized,
  Forbidden,
  ValidationErrorResponse,
} from "../models/common.models.js"
import { tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import { singlePhotoUpload } from "../routes/v1/util/upload.js"
import { cdn } from "../../clients/cdn/cdn.js"
import { randomUUID } from "crypto"

/**
 * Controller for file upload operations
 */
@Route("api/v1/upload")
export class UploadController extends BaseController {
  /**
   * Upload a photo
   *
   * Uploads a single photo file with validation for size and type.
   * The file is uploaded to the CDN and a resource ID is returned.
   *
   * File requirements:
   * - Maximum size: 2.5MB
   * - Allowed types: image/jpeg, image/png, image/gif, image/webp
   *
   * @summary Upload a photo file
   * @param file - The photo file to upload
   * @param request - Express request object (injected by TSOA)
   * @returns Photo upload response with resource ID and URL
   */
  @Post("photo")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(singlePhotoUpload.single("photo"))
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Photo uploaded successfully")
  @Response<ValidationErrorClass>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async uploadPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Request() request: ExpressRequest,
  ): Promise<PhotoUploadResponse> {
    try {
      const user = this.getUser(request)

      // Get the uploaded file from request (multer attaches it here)
      const uploadedFile = (request as any).file as Express.Multer.File

      // Validate file was provided
      if (!uploadedFile) {
        throw new ValidationErrorClass("No photo file provided")
      }

      // Validate file size (2.5MB limit)
      const maxSize = 2.5 * 1000 * 1000 // 2.5MB
      if (uploadedFile.size > maxSize) {
        throw new ValidationErrorClass(
          `File too large. Maximum size is ${maxSize / 1000000}MB`,
        )
      }

      // Validate file type
      const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ]
      if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
        throw new ValidationErrorClass(
          `Invalid file type. Allowed types: ${allowedMimeTypes.join(", ")}`,
        )
      }

      // Generate unique filename
      const fileExtension = uploadedFile.mimetype.split("/")[1] || "png"
      const filename = `${user.user_id}_photo_${randomUUID()}.${fileExtension}`

      // Upload to CDN (includes moderation)
      this.logInfo(
        "uploadPhoto",
        `Uploading photo for user ${user.user_id}`,
        {
          filename,
          size: uploadedFile.size,
          mimetype: uploadedFile.mimetype,
        },
      )

      const resource = await cdn.uploadFile(
        filename,
        uploadedFile.path,
        uploadedFile.mimetype,
      )

      // Get CDN URL for response
      const url = await cdn.getFileLinkResource(resource.resource_id)

      this.logInfo("uploadPhoto", `Photo uploaded successfully`, {
        resource_id: resource.resource_id,
        user_id: user.user_id,
        url,
      })

      // Return success response
      return this.success({
        resource_id: resource.resource_id,
        url: url || "",
        filename: uploadedFile.originalname,
        size: uploadedFile.size,
        mimetype: uploadedFile.mimetype,
        uploaded_at: new Date().toISOString(),
      })
    } catch (error) {
      return this.handleError(error, "uploadPhoto")
    }
  }
}
