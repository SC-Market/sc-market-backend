/**
 * Upload Request/Response Models for TSOA Controllers
 *
 * These type definitions are used by TSOA controllers to define
 * request/response schemas for file upload endpoints in the OpenAPI spec.
 */

import { ApiResponse } from "./common.models.js"

/**
 * Photo upload response
 * Returned after successfully uploading a photo
 */
export interface PhotoUploadData {
  /**
   * Unique identifier for the uploaded resource
   */
  resource_id: string

  /**
   * URL to access the uploaded photo
   */
  url: string

  /**
   * Original filename
   */
  filename: string

  /**
   * File size in bytes
   */
  size: number

  /**
   * MIME type of the uploaded file
   */
  mimetype: string

  /**
   * Timestamp when the file was uploaded
   */
  uploaded_at: string
}

/**
 * Photo upload response wrapper
 */
export interface PhotoUploadResponse extends ApiResponse<PhotoUploadData> {}
