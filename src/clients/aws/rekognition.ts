import { S3 } from "@aws-sdk/client-s3"
import { Rekognition } from "@aws-sdk/client-rekognition"
import { env } from "../../config/env.js"
import { v4 as uuidv4 } from "uuid"
import logger from "../../logger/logger.js"

export interface ContentModerationResult {
  passed: boolean
  moderationLabels: string[]
  confidence: number
  error?: string
}

export class AWSRekognitionClient {
  private static instance: AWSRekognitionClient | null = null
  private s3: S3
  private rekognition: Rekognition

  private constructor() {
    this.s3 = new S3({
      endpoint: "https://s3.us-east-2.amazonaws.com",
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      region: env.AWS_REGION || "us-east-2",
    })

    this.rekognition = new Rekognition({
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      region: env.AWS_REGION || "us-east-2",
    })
  }

  static getInstance(): AWSRekognitionClient {
    if (!this.instance) {
      this.instance = new AWSRekognitionClient()
    }
    return this.instance
  }

  /**
   * Uploads an image to S3, scans it with Amazon Rekognition for content moderation,
   * and then deletes the resource from S3
   * @param imageBuffer - The image buffer to scan
   * @param contentType - The MIME type of the image (e.g., 'image/jpeg', 'image/png')
   * @returns Promise<ContentModerationResult> - Whether the image passed moderation
   */
  async scanImageForModeration(
    imageBuffer: Buffer,
    contentType: string,
  ): Promise<ContentModerationResult> {
    console.log("Content type is: ", contentType)
    const tempKey = `temp-moderation/${uuidv4()}-${Date.now()}.${this.getFileExtension(contentType)}`

    try {
      // 1. Upload image to S3
      await this.s3.putObject({
        Bucket: env.S3_BUCKET_NAME!,
        Key: tempKey,
        Body: imageBuffer,
        ContentType: contentType,
      })

      // 2. Scan with Amazon Rekognition for content moderation
      const moderationResult = await this.rekognition.detectModerationLabels({
        Image: {
          S3Object: {
            Bucket: env.S3_BUCKET_NAME!,
            Name: tempKey,
          },
        },
        MinConfidence: 50, // Minimum confidence threshold for moderation labels
      })

      console.log(moderationResult)

      // 3. Process moderation results
      const moderationLabels = moderationResult.ModerationLabels || []
      const maxConfidence = moderationLabels.reduce(
        (max, label) => Math.max(max, label.Confidence || 0),
        0,
      )

      // Check if any explicit content was detected
      const explicitContentLabels = [
        "Explicit Nudity",
        "Violence",
        "Visually Disturbing",
        "Hate Symbols",
        "Gambling",
        "Drugs",
        "Tobacco",
        "Alcohol",
        "Rude Gestures",
        "Adult Content",
      ]

      const hasExplicitContent = moderationLabels.some(
        (label) =>
          explicitContentLabels.includes(label.Name || "") &&
          (label.Confidence || 0) >= 70,
      )

      // 4. Clean up S3 resource
      await this.s3.deleteObject({
        Bucket: env.S3_BUCKET_NAME!,
        Key: tempKey,
      })

      return {
        passed: !hasExplicitContent,
        moderationLabels: moderationLabels
          .map((label) => label.Name || "")
          .filter(Boolean),
        confidence: maxConfidence,
      }
    } catch (error) {
      // Clean up S3 resource even if there's an error
      try {
        await this.s3.deleteObject({
          Bucket: env.S3_BUCKET_NAME!,
          Key: tempKey,
        })
      } catch (cleanupError) {
        logger.error("Failed to cleanup S3 resource after error:", {
          cleanupError,
        })
      }

      return {
        passed: false,
        moderationLabels: [],
        confidence: 0,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      }
    }
  }

  /**
   * Helper function to extract file extension from MIME type
   * @param contentType - The MIME type of the image
   * @returns string - The file extension
   */
  private getFileExtension(contentType: string): string {
    const extensions: { [key: string]: string } = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/bmp": "bmp",
      "image/tiff": "tiff",
    }

    return extensions[contentType.toLowerCase()] || "jpg"
  }

  /**
   * Alternative method that accepts a file path instead of buffer
   * @param filePath - Path to the image file
   * @param contentType - The MIME type of the image
   * @returns Promise<ContentModerationResult> - Whether the image passed moderation
   */
  async scanImageFileForModeration(
    filePath: string,
    contentType: string,
  ): Promise<ContentModerationResult> {
    const fs = await import("node:fs")
    const imageBuffer = fs.readFileSync(filePath)
    return this.scanImageForModeration(imageBuffer, contentType)
  }
}

// Export singleton instance
export const rekognitionClient = AWSRekognitionClient.getInstance()
