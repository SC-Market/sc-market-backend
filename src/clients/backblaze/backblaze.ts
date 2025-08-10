import fs from "node:fs"
import { database } from "../database/knex-db.js"
import { DBImageResource } from "../database/db-models.js"
import { CDN, CDNError, valid_domains } from "../cdn/cdn.js"
import { env } from "../../config/env.js"
import { S3, S3ClientConfig } from "@aws-sdk/client-s3"
import { rekognitionClient } from "../aws/rekognition.js"
import logger from "../../logger/logger.js"

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
   * Helper method to check if a file is an image and get its content type
   * @param filePath - Path to the file
   * @returns Object with isImage boolean and contentType string
   */
  private getImageInfo(filePath: string): { isImage: boolean; contentType: string } {
    const ext = filePath.toLowerCase().split('.').pop()
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff']
    const isImage = imageExtensions.includes(ext || '')
    
    const contentTypeMap: { [key: string]: string } = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'tiff': 'image/tiff'
    }
    
    const contentType = contentTypeMap[ext || ''] || 'application/octet-stream'
    
    return { isImage, contentType }
  }

  /**
   * Helper method to check image content moderation using AWS Rekognition
   * @param imageBuffer - Buffer containing the image data
   * @param contentType - MIME type of the image
   * @returns Promise<boolean> - True if image passes moderation
   */
  private async checkImageModeration(imageBuffer: Buffer, contentType: string): Promise<boolean> {
    try {
      const result = await rekognitionClient.scanImageForModeration(imageBuffer, contentType)
      
      if (result.error) {
        logger.error("Content moderation check failed:", { error: result.error })
        // If moderation fails, we'll allow the upload but log the error
        return true
      }
      
      if (!result.passed) {
        logger.warn("Image failed content moderation:", {
          labels: result.moderationLabels,
          confidence: result.confidence
        })
        return false
      }
      
      return true
    } catch (error) {
      logger.error("Error during content moderation check:", { error })
      // If moderation check fails, we'll allow the upload but log the error
      return true
    }
  }

  async uploadFile(filename: string, fileDirectoryPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(fileDirectoryPath.toString(), (err, data) => {
        if (err) {
          reject(err)
          return
        }

        // Check if this is an image file and perform content moderation
        const { isImage, contentType } = this.getImageInfo(fileDirectoryPath)
        
        if (isImage) {
          // For images, check content moderation before uploading
          this.checkImageModeration(data, contentType)
            .then(passed => {
              if (!passed) {
                reject(new Error("Image failed content moderation check"))
                return
              }
              
              // Proceed with upload if moderation passes
              this.s3.putObject(
                {
                  Bucket: "" + env.B2_BUCKET_NAME,
                  Key: filename,
                  Body: data,
                  // ACL: 'public-read'
                },
                function (err, data) {
                  if (err) reject(err)
                  else resolve("successfully uploaded")
                },
              )
            })
            .catch(error => {
              reject(error)
            })
        } else {
          // For non-image files, upload directly
          this.s3.putObject(
            {
              Bucket: "" + env.B2_BUCKET_NAME,
              Key: filename,
              Body: data,
              // ACL: 'public-read'
            },
            function (err, data) {
              if (err) reject(err)
              else resolve("successfully uploaded")
            },
          )
        }
      })
    })
  }

  async uploadFileRaw(filename: string, data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check if this is an image file and perform content moderation
      const { isImage, contentType } = this.getImageInfo(filename)
      
      if (isImage) {
        // Convert string data to buffer for moderation check
        const buffer = Buffer.from(data, 'binary')
        
        // For images, check content moderation before uploading
        this.checkImageModeration(buffer, contentType)
          .then(passed => {
            if (!passed) {
              reject(new Error("Image failed content moderation check"))
              return
            }
            
            // Proceed with upload if moderation passes
            this.s3.putObject(
              {
                Bucket: "" + env.B2_BUCKET_NAME,
                Key: filename,
                Body: data,
                // ACL: 'public-read'
              },
              function (err, data) {
                if (err) reject(err)
                else resolve("successfully uploaded")
              },
            )
          })
          .catch(error => {
            reject(error)
          })
      } else {
        // For non-image files, upload directly
        this.s3.putObject(
          {
            Bucket: "" + env.B2_BUCKET_NAME,
            Key: filename,
            Body: data,
            // ACL: 'public-read'
          },
          function (err, data) {
            if (err) reject(err)
            else resolve("successfully uploaded")
          },
        )
      }
    })
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
