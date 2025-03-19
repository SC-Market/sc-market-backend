import fs from "node:fs"
import { database } from "../database/knex-db.js"
import { DBImageResource } from "../database/db-models.js"
import { CDN, CDNError, valid_domains } from "../cdn/cdn.js"
import { env } from "../../config/env.js"
import { S3, S3ClientConfig } from "@aws-sdk/client-s3"

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

  uploadFile(filename: string, fileDirectoryPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(fileDirectoryPath.toString(), (err, data) => {
        if (err) {
          reject(err)
        }

        this.s3.putObject(
          {
            Bucket: "" + env.S3_BUCKET_NAME,
            Key: filename,
            Body: data,
            // ACL: 'public-read'
          },
          function (err, data) {
            if (err) reject(err)
            resolve("succesfully uploaded")
          },
        )
      })
    })
  }

  uploadFileRaw(filename: string, data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // if (err) {
      //     reject(err);
      // }
      this.s3.putObject(
        {
          Bucket: "" + env.S3_BUCKET_NAME,
          Key: filename,
          Body: data,
          // ACL: 'public-read'
        },
        function (err, data) {
          if (err) reject(err)
          resolve("succesfully uploaded")
        },
      )
    })
  }

  deleteFile(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.s3.deleteObject(
        {
          Bucket: "" + env.S3_BUCKET_NAME,
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
