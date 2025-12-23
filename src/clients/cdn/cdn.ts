import { database } from "../database/knex-db.js"
import { DBImageResource } from "../database/db-models.js"
import { BackBlazeCDN } from "../backblaze/backblaze.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"

export const external_resource_pattern =
  /^https?:\/\/(www\.)?((((media)|(cdn)\.)?robertsspaceindustries\.com)|((media\.)?starcitizen.tools)|(i\.imgur\.com)|(cstone\.space))\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/

export const valid_domains = [
  "media.robertsspaceindustries.com",
  "cdn.robertsspaceindustries.com",
  "robertsspaceindustries.com",
  "starcitizen.tools",
  "media.starcitizen.tools",
  "i.imgur.com",
  "cstone.space",
  // "media.discordapp.net",
  // "cdn.discordapp.com",
]

export const external_resource_regex = new RegExp(external_resource_pattern)

export interface CDN {
  uploadFile(
    filename: string,
    fileDirectoryPath: string,
    mimeType: string,
  ): Promise<DBImageResource>
  getFileLinkResource(resource_id?: string): Promise<string | null>
  removeResource(resource_id: string): Promise<void>
}

export class CDNError extends Error {}

export class ExternalCDN implements CDN {
  async uploadFile(
    filename: string,
    fileDirectoryPath: string,
    mimeType: string,
  ): Promise<DBImageResource> {
    throw new Error("Method not implemented")
  }

  async deleteFile(filename: string): Promise<string> {
    throw new Error("Method not implemented")
  }

  async getFileLink(filename: string): Promise<string> {
    throw new Error("Method not implemented")
  }

  async invalidateCache(filename: string): Promise<void> {
    throw new Error("Method not implemented")
  }

  async getFileLinkResource(resource_id?: string): Promise<string | null> {
    if (!resource_id) {
      return null
    }
    const avatar = await contractorDb.getImageResource({ resource_id: resource_id })
    return avatar.external_url || null
  }

  verifyExternalResource(external_url: string) {
    const url = new URL(external_url)

    return valid_domains.includes(url.hostname)
  }

  async createExternalResource(
    external_url: string,
    filename: string,
  ): Promise<DBImageResource> {
    if (!this.verifyExternalResource(external_url)) {
      throw new CDNError("Invalid external URL")
    }

    return await contractorDb.insertImageResource({
      filename,
      external_url,
    })
  }

  async removeResource(resource_id: string): Promise<void> {
    const resource = await contractorDb.getImageResource({
      resource_id: resource_id,
    })

    if (resource.external_url) {
      await contractorDb.removeImageResource({ resource_id })
    } else {
      try {
        await contractorDb.removeImageResource({ resource_id })
      } catch {
        // Other rows depend on this entry, so we can't delete it yet
        return
      }

      // Delete it only if no other rows depend on it
      // await this.deleteFile(resource.filename)
    }
  }

  static instance: ExternalCDN

  static getInstance() {
    if (this.instance == null) {
      this.instance = new ExternalCDN()
    }

    return this.instance
  }
}

export const cdn = BackBlazeCDN.getInstance()
