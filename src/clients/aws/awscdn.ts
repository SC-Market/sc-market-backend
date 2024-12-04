import { S3 } from "@aws-sdk/client-s3"
import { CloudFront } from "@aws-sdk/client-cloudfront"
import fs from "node:fs"
import { database } from "../database/knex-db.js"
import { DBImageResource } from "../database/db-models.js"
import { getSignedUrl } from "@aws-sdk/cloudfront-signer"
import moment from "moment/moment.js"
import { CDN, CDNError, valid_domains } from "../cdn/cdn.js"
import { env } from "../../config/env.js"

const twoHours = 2 * 60 * 60 * 1000

// AWS.config.update({
//     accessKeyId: env.S3_ACCESS_KEY_ID,
//     secretAccessKey: env.S3_SECRET_ACCESS_KEY,
//     region: 'us-west-2'
// });
//
//
// const signer = new AWS.CloudFront.Signer(
//     env.CLOUDFRONT_ACCESS_KEY_ID!,
//     fs.readFileSync(env.CLOUDFRONT_PRIVATE_KEY_PATH!, 'utf8')
// )

export class AWSCDN implements CDN {
  // Implements Singleton
  static instance: AWSCDN | null = null
  s3: S3
  cloudfront: CloudFront
  savedLinks = new Map<string, { time: Date; value: string }>()
  privateKey: string
  accessKeyId: string

  private constructor(
    s3options: {
      accessKeyId: string
      secretAccessKey: string
      region: string
    },
    cloudfront_options: {
      accessKeyId: string
      privateKey?: string
      privateKeyPath?: string
    },
  ) {
    this.s3 = new S3(s3options)

    let privateKey = cloudfront_options.privateKey
    if (privateKey) {
      if (cloudfront_options.privateKeyPath) {
        throw new TypeError(
          "Must pass either privateKey or privateKeyPath, not both",
        )
      }
    } else if (cloudfront_options.privateKeyPath) {
      privateKey = fs.readFileSync(cloudfront_options.privateKeyPath, "utf8")
    } else {
      throw new TypeError("Must pass either privateKey or privateKeyPath")
    }

    this.privateKey = privateKey
    this.accessKeyId = cloudfront_options.accessKeyId

    this.cloudfront = new CloudFront(s3options)
  }

  static getInstance() {
    if (this.instance == null) {
      this.instance = new AWSCDN(
        {
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
          region: "us-west-2",
        },
        {
          accessKeyId: env.CLOUDFRONT_ACCESS_KEY_ID!,
          privateKey: env.CLOUDFRONT_PRIVATE_KEY!,
        },
      )
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
    const avatar = await database.getImageResource({ resource_id: resource_id })
    if (avatar.external_url) {
      return avatar.external_url
    }
    return await this.getFileLink(avatar.filename)
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

  getFileLink(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cached = this.savedLinks.get(filename)
      if (cached) {
        if (cached.time > new Date()) {
          resolve(cached.value)
          return
        }
      }

      const signedUrl = getSignedUrl({
        url: env.CLOUDFRONT_URL! + filename,
        dateLessThan: moment().add(2, "hours").toISOString(),
        keyPairId: this.accessKeyId,
        privateKey: this.privateKey,
      })

      this.savedLinks.set(filename, {
        time: new Date(Date.now() + twoHours),
        value: signedUrl,
      })

      resolve(signedUrl)
    })
  }

  async invalidateCache(filename: string): Promise<void> {
    this.savedLinks.delete(filename)

    const params = {
      DistributionId: "ENL5WE3TJ0UVD" /* required */,
      InvalidationBatch: {
        /* required */ CallerReference: `${Date.now()}` /* required */,
        Paths: {
          /* required */ Quantity: 1,
          Items: [`/${filename}`],
        },
      },
    }

    await this.cloudfront.createInvalidation(params)
  }
}
