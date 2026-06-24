import { createGzip } from "node:zlib"
import {
  EnumChangefreq,
  SitemapItemLoose,
  SitemapStream,
} from "sitemap"
import { Writable } from "node:stream"

import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import { formatShortSlug } from "../../api/routes/v2/util/short-slug.js"
import * as recruitingDb from "../../api/routes/v1/recruiting/database.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

export const SITEMAP_URL_LIMIT = 10_000
export const SITEMAP_TTL_MS = 6 * 60 * 60 * 1000

export interface SitemapSection {
  name: string
  pages: SitemapItemLoose[]
}

export interface SitemapCache {
  index: Buffer
  sitemaps: Map<string, Buffer>
}

function getSitemapHostname(): string {
  const base = env.FRONTEND_URL || "https://sc-market.space"
  return new URL(base).origin + "/"
}

function getSitemapIndexHostname(): string {
  const frontend = env.FRONTEND_URL || "https://sc-market.space"
  const url = new URL(frontend)
  url.hostname = `api.${url.hostname}`
  return url.origin + "/"
}

export async function collectSitemapSections(): Promise<SitemapSection[]> {
  const db = getKnex()
  const sections: SitemapSection[] = []

  // ── Static pages ──
  sections.push({
    name: "static",
    pages: [
      { url: "/", changefreq: EnumChangefreq.MONTHLY, priority: 1.0 },
      { url: "/market", changefreq: EnumChangefreq.ALWAYS, priority: 1.0 },
      { url: "/recruiting", changefreq: EnumChangefreq.ALWAYS, priority: 1.0 },
      { url: "/contractors", changefreq: EnumChangefreq.ALWAYS, priority: 1.0 },
      { url: "/contracts", changefreq: EnumChangefreq.ALWAYS, priority: 1.0 },
      { url: "/services", changefreq: EnumChangefreq.ALWAYS, priority: 1.0 },
      { url: "/bulk", changefreq: EnumChangefreq.ALWAYS, priority: 0.8 },
      { url: "/buyorders", changefreq: EnumChangefreq.ALWAYS, priority: 0.8 },
      { url: "/market/services", changefreq: EnumChangefreq.ALWAYS, priority: 0.8 },
      { url: "/missions", changefreq: EnumChangefreq.WEEKLY, priority: 0.8 },
      { url: "/blueprints", changefreq: EnumChangefreq.WEEKLY, priority: 0.8 },
      { url: "/crafting/calculator", changefreq: EnumChangefreq.MONTHLY, priority: 0.7 },
      { url: "/crafting/history", changefreq: EnumChangefreq.MONTHLY, priority: 0.5 },
      { url: "/resources", changefreq: EnumChangefreq.WEEKLY, priority: 0.7 },
      { url: "/shopping-lists", changefreq: EnumChangefreq.MONTHLY, priority: 0.5 },
      { url: "/wiki/items", changefreq: EnumChangefreq.WEEKLY, priority: 0.8 },
      { url: "/wiki/ships", changefreq: EnumChangefreq.WEEKLY, priority: 0.8 },
      { url: "/wiki/commodities", changefreq: EnumChangefreq.WEEKLY, priority: 0.7 },
      { url: "/wiki/locations", changefreq: EnumChangefreq.MONTHLY, priority: 0.7 },
      { url: "/wiki/manufacturers", changefreq: EnumChangefreq.MONTHLY, priority: 0.6 },
      { url: "/wiki/refinery", changefreq: EnumChangefreq.MONTHLY, priority: 0.6 },
      { url: "/mining", changefreq: EnumChangefreq.WEEKLY, priority: 0.7 },
      { url: "/mining/locations", changefreq: EnumChangefreq.MONTHLY, priority: 0.6 },
      { url: "/login", changefreq: EnumChangefreq.YEARLY, priority: 0.3 },
      { url: "/signup", changefreq: EnumChangefreq.YEARLY, priority: 0.4 },
    ],
  })

  // ── Market listings ──
  const market_listings: { listing_id: string; title: string }[] = await db("listing_search")
    .select("listing_id", "title")
    .where("status", "active")
    .where("visibility", "public")

  const aggregateItems: { game_item_id: string; game_item_name: string }[] = await db("listing_search")
    .select("game_item_id", "game_item_name")
    .where("status", "active")
    .where("visibility", "public")
    .whereNotNull("game_item_id")
    .groupBy("game_item_id", "game_item_name")

  const marketPages: SitemapItemLoose[] = []
  for (const listing of market_listings) {
    marketPages.push({
      url: `/market/${formatShortSlug(listing.listing_id, listing.title)}`,
      changefreq: EnumChangefreq.WEEKLY,
      priority: 0.8,
    })
  }
  for (const item of aggregateItems) {
    marketPages.push({
      url: `/market/aggregate/${formatShortSlug(item.game_item_id, item.game_item_name || "")}`,
      changefreq: EnumChangefreq.WEEKLY,
      priority: 0.7,
    })
  }
  sections.push({ name: "market", pages: marketPages })

  // ── Users ──
  const users = await profileDb.getUsersWhere({ rsi_confirmed: true })
  const userPages: SitemapItemLoose[] = []
  for (const user of users) {
    userPages.push(
      { url: `/user/${user.username}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 },
      { url: `/user/${user.username}/services`, changefreq: EnumChangefreq.MONTHLY, priority: 0.4 },
      { url: `/user/${user.username}/market`, changefreq: EnumChangefreq.MONTHLY, priority: 0.4 },
      { url: `/user/${user.username}/reviews`, changefreq: EnumChangefreq.MONTHLY, priority: 0.2 },
    )
  }
  sections.push({ name: "users", pages: userPages })

  // ── Contractors ──
  const contractors = await contractorDb.getContractorListings({})
  const contractorPages: SitemapItemLoose[] = []
  for (const contractor of contractors) {
    contractorPages.push(
      { url: `/contractor/${contractor.spectrum_id}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 },
      { url: `/contractor/${contractor.spectrum_id}/services`, changefreq: EnumChangefreq.MONTHLY, priority: 0.4 },
      { url: `/contractor/${contractor.spectrum_id}/market`, changefreq: EnumChangefreq.MONTHLY, priority: 0.4 },
      { url: `/contractor/${contractor.spectrum_id}/members`, changefreq: EnumChangefreq.MONTHLY, priority: 0.2 },
    )
  }
  sections.push({ name: "contractors", pages: contractorPages })

  // ── Recruiting ──
  const recruit_posts = await recruitingDb.getAllRecruitingPosts()
  const recruitPages: SitemapItemLoose[] = []
  for (const post of recruit_posts) {
    recruitPages.push({
      url: `/recruiting/post/${post.post_id}`,
      changefreq: EnumChangefreq.MONTHLY,
      priority: 0.5,
    })
  }
  sections.push({ name: "recruiting", pages: recruitPages })

  // ── Wiki & Game Data ──
  const wikiPages: SitemapItemLoose[] = []

  const wikiQueries = [
    async () => {
      const missions = await db("missions").select("mission_code", "title").limit(5000)
      for (const m of missions) {
        wikiPages.push({ url: `/missions/${m.mission_code}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6 })
      }
    },
    async () => {
      const blueprints = await db("blueprints").select("blueprint_code", "name").limit(5000)
      for (const b of blueprints) {
        wikiPages.push({ url: `/blueprints/${b.blueprint_code}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6 })
      }
    },
    async () => {
      const resources = await db("resources").select("resource_id", "name").limit(5000)
      for (const r of resources) {
        wikiPages.push({ url: `/resources/${formatShortSlug(r.resource_id, r.name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 })
        wikiPages.push({ url: `/wiki/commodities/${formatShortSlug(r.resource_id, r.name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 })
      }
    },
    async () => {
      const items = await db("game_items").select("id", "name").limit(10000)
      for (const i of items) {
        wikiPages.push({ url: `/wiki/items/${formatShortSlug(i.id, i.name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6 })
      }
    },
    async () => {
      const ships = await db("game_items").where("type", "Ship").select("id", "name").limit(2000)
      for (const s of ships) {
        wikiPages.push({ url: `/wiki/ships/${formatShortSlug(s.id, s.name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6 })
      }
    },
    async () => {
      const manufacturers = await db("wiki_manufacturers").select("code", "name").limit(500)
      for (const m of manufacturers) {
        wikiPages.push({ url: `/wiki/manufacturers/${m.code}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 })
      }
    },
    async () => {
      const ores = await db("resources").select("name").whereNotNull("name").where("is_mineable", true).limit(500)
      for (const o of ores) {
        wikiPages.push({ url: `/mining/ores/${encodeURIComponent(o.name)}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 })
      }
    },
  ]

  for (const query of wikiQueries) {
    try {
      await query()
    } catch (error) {
      logger.warn("Failed to fetch game data section for sitemap", { error })
    }
  }
  sections.push({ name: "wiki", pages: wikiPages })

  return sections
}

async function generateSectionSitemap(
  pages: SitemapItemLoose[],
  hostname: string,
): Promise<Buffer> {
  const sitemapStream = new SitemapStream({ hostname })
  const chunks: Buffer[] = []
  const collector = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })
  sitemapStream.pipe(createGzip()).pipe(collector)
  for (const page of pages) {
    sitemapStream.write(page)
  }
  sitemapStream.end()
  await new Promise<void>((resolve) => collector.on("finish", resolve))
  return Buffer.concat(chunks)
}

export async function generateSitemapCache(): Promise<SitemapCache> {
  const sections = await collectSitemapSections()
  const hostname = getSitemapHostname()
  const indexHostname = getSitemapIndexHostname()
  const sitemaps = new Map<string, Buffer>()
  const indexEntries: string[] = []

  for (const section of sections) {
    const chunks: SitemapItemLoose[][] = []
    for (let i = 0; i < section.pages.length; i += SITEMAP_URL_LIMIT) {
      chunks.push(section.pages.slice(i, i + SITEMAP_URL_LIMIT))
    }
    if (chunks.length === 0) continue

    for (let i = 0; i < chunks.length; i++) {
      const key = `${section.name}-${i}`
      const buffer = await generateSectionSitemap(chunks[i], hostname)
      sitemaps.set(key, buffer)
      indexEntries.push(
        `<sitemap><loc>${indexHostname}sitemap-${key}.xml</loc></sitemap>`,
      )
    }
  }

  const indexXml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexEntries.join("")}</sitemapindex>`
  const { gzipSync } = await import("node:zlib")
  const index = gzipSync(Buffer.from(indexXml, "utf-8"))

  return { index, sitemaps }
}

let cache: SitemapCache | null = null
let cacheGeneratedAt = 0
let generationPromise: Promise<SitemapCache> | null = null

export async function getSitemapCache(): Promise<SitemapCache> {
  if (cache && Date.now() - cacheGeneratedAt < SITEMAP_TTL_MS) {
    return cache
  }

  if (generationPromise) {
    return generationPromise
  }

  generationPromise = (async () => {
    const generated = await generateSitemapCache()
    cache = generated
    cacheGeneratedAt = Date.now()
    return generated
  })()

  try {
    return await generationPromise
  } finally {
    generationPromise = null
  }
}

export function clearSitemapCache(): void {
  cache = null
  cacheGeneratedAt = 0
}
