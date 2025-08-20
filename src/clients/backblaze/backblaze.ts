import fs from "node:fs"
import { database } from "../database/knex-db.js"
import { DBImageResource } from "../database/db-models.js"
import { CDN, CDNError, valid_domains } from "../cdn/cdn.js"
import { env } from "../../config/env.js"
import { S3, S3ClientConfig } from "@aws-sdk/client-s3"
import logger from "../../logger/logger.js"
import { ImageLambdaClient } from "../image-lambda/image-lambda.js"

export class BackBlazeCDN implements CDN {
  // Implements Singleton
  static instance: BackBlazeCDN | null = null
  s3: S3

  private constructor(s3options: S3ClientConfig) {
    this.s3 = new S3(s3options)
  }

  static getInstance() {
    if (this.instance == null) {
      if (!env.B2_KEY_ID || !env.B2_APP_KEY) {
        throw new Error("Missing B2 keys!")
      }
      this.instance = new BackBlazeCDN({
        endpoint: "https://s3.us-west-004.backblazeb2.com",
        region: "us-west-004",
        credentials: {
          accessKeyId: env.B2_KEY_ID,
          secretAccessKey: env.B2_APP_KEY,
        },
      })
    }

    return this.instance
  }

  /**
   * Helper method to validate MIME type and check if it's an allowed image format
   * @param mimeType - MIME type from the request
   * @returns Object with isValid boolean and contentType string
   */
  private validateMimeType(mimeType: string): {
    isValid: boolean
    contentType: string
  } {
    const allowedMimeTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ]

    const isValid = allowedMimeTypes.includes(mimeType)

    return { isValid, contentType: mimeType }
  }

  async uploadFile(
    filename: string,
    fileDirectoryPath: string,
    mimeType: string,
  ): Promise<DBImageResource> {
    const data = await fs.promises.readFile(fileDirectoryPath.toString())

    // Validate MIME type and check if it's an allowed image format
    const { isValid, contentType } = this.validateMimeType(mimeType)

    if (!isValid) {
      throw new Error(
        `Unsupported MIME type: ${mimeType}. Only PNG, JPG, and WEBP images are allowed.`,
      )
    }

    try {
      // Use the image lambda for processing and moderation
      const result = await ImageLambdaClient.uploadImage(
        data,
        filename,
        contentType,
      )

      // Store the image resource in the database using the filename returned from Lambda
      // The Lambda already provides the complete filename with the correct extension
      const imageResource = await database.insertImageResource({
        filename: result.data!.filename,
        external_url: result.data!.backblazeUrl,
      })

      return imageResource
    } catch (error) {
      // Only log system errors here - user-fault errors will be handled at the API route level
      // where we have better context about the user's request
      if (
        error instanceof Error &&
        !error.message.includes("Image failed moderation checks")
      ) {
        logger.error(
          "Failed to upload image via lambda (system error):",
          error,
          { filename },
        )
      }

      throw error
    }
  }

  deleteFile(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.s3.deleteObject(
        {
          Bucket: "" + env.B2_BUCKET_NAME,
          Key: filename,
          // ACL: 'public-read'
        },
        function (err, data) {
          if (err) reject(err)
          resolve("succesfully deleted")
        },
      )
    })
  }

  async getFileLinkResource(resource_id?: string): Promise<string | null> {
    if (!resource_id) {
      return null
    }
    const resource = await database.getImageResource({
      resource_id: resource_id,
    })
    if (resource.external_url) {
      return resource.external_url
    }
    return `${env.CDN_URL}/${resource.filename}`
  }

  verifyExternalResource(external_url: string) {
    const url = new URL(external_url)

    if (!valid_domains.includes(url.hostname)) {
      // if (!external_url.match(external_resource_regex))
      return false
    }

    return true
  }

  async createExternalResource(
    external_url: string,
    filename: string,
  ): Promise<DBImageResource> {
    if (!this.verifyExternalResource(external_url)) {
      throw new CDNError("Invalid external URL")
    }

    return await database.insertImageResource({
      filename,
      external_url,
    })
  }

  async removeResource(resource_id: string) {
    const resource = await database.getImageResource({ resource_id })
    if (!resource.external_url) {
      await this.deleteFile(resource.filename)
    }

    await database.removeImageResource({ resource_id })
  }
}
