import { Writable } from "node:stream"
import { createGzip } from "node:zlib"
import {
  EnumChangefreq,
  SitemapAndIndexStream,
  SitemapItemLoose,
  SitemapStream,
  streamToPromise,
} from "sitemap"
import type { WriteStream } from "node:fs"

import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import { formatListingSlug } from "../../api/routes/v1/market/helpers.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as recruitingDb from "../../api/routes/v1/recruiting/database.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

export const SITEMAP_URL_LIMIT = 10_000
export const SITEMAP_TTL_MS = 6 * 60 * 60 * 1000

export interface SitemapCache {
  index: Buffer
  sitemaps: Map<number, Buffer>
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

export async function collectSitemapPages(): Promise<SitemapItemLoose[]> {
  const db = getKnex()
  const contractors = await contractorDb.getContractorListings({})
  const users = await profileDb.getUsersWhere({ rsi_confirmed: true })
  const recruit_posts = await recruitingDb.getAllRecruitingPosts()
  const market_listings: { listing_id: string; title: string }[] = await db("listing_search")
    .select("listing_id", "title")
    .where("status", "active")
    .where("visibility", "public")

  // Aggregate pages (one per game item that has active listings)
  const aggregateItems: { game_item_id: string; game_item_name: string }[] = await db("listing_search")
    .select("game_item_id", "game_item_name")
    .where("status", "active")
    .where("visibility", "public")
    .whereNotNull("game_item_id")
    .groupBy("game_item_id", "game_item_name")

  const user_routes: SitemapItemLoose[] = []
  for (const user of users) {
    user_routes.push(
      {
        url: `/user/${user.username}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.5,
      },
      {
        url: `/user/${user.username}/services`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.4,
      },
      {
        url: `/user/${user.username}/market`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.4,
      },
      {
        url: `/user/${user.username}/order`,
        changefreq: EnumChangefreq.YEARLY,
        priority: 0.2,
      },
      {
        url: `/user/${user.username}/reviews`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.2,
      },
    )
  }

  const market_routes: SitemapItemLoose[] = []
  for (const listing of market_listings) {
    market_routes.push({
      url: `/market/${listing.listing_id}#/${formatListingSlug(listing.title)}`,
      changefreq: EnumChangefreq.WEEKLY,
      priority: 0.8,
    })
  }
  for (const item of aggregateItems) {
    market_routes.push({
      url: `/market/aggregate/${item.game_item_id}#/${formatListingSlug(item.game_item_name || "")}`,
      changefreq: EnumChangefreq.WEEKLY,
      priority: 0.7,
    })
  }

  const contractor_routes: SitemapItemLoose[] = []
  for (const contractor of contractors) {
    contractor_routes.push(
      {
        url: `/contractor/${contractor.spectrum_id}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.5,
      },
      {
        url: `/contractor/${contractor.spectrum_id}/services`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.4,
      },
      {
        url: `/contractor/${contractor.spectrum_id}/market`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.4,
      },
      {
        url: `/contractor/${contractor.spectrum_id}/order`,
        changefreq: EnumChangefreq.YEARLY,
        priority: 0.2,
      },
      {
        url: `/contractor/${contractor.spectrum_id}/members`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.2,
      },
    )
  }

  const recruit_routes: SitemapItemLoose[] = []
  for (const post of recruit_posts) {
    recruit_routes.push({
      url: `/recruiting/post/${post.post_id}`,
      changefreq: EnumChangefreq.MONTHLY,
      priority: 0.5,
    })
  }

  const game_data_routes: SitemapItemLoose[] = []
  try {
    const missions = await db("missions").select("mission_code", "title").limit(5000)
    for (const m of missions) {
      game_data_routes.push({
        url: `/missions/${m.mission_code}#/${formatListingSlug(m.title || "")}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.6,
      })
    }
    const blueprints = await db("blueprints").select("blueprint_code", "name").limit(5000)
    for (const b of blueprints) {
      game_data_routes.push({
        url: `/blueprints/${b.blueprint_code}#/${formatListingSlug(b.name || "")}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.6,
      })
    }
    const resources = await db("resources").select("resource_id", "name").limit(5000)
    for (const r of resources) {
      game_data_routes.push({
        url: `/resources/${r.resource_id}#/${formatListingSlug(r.name || "")}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.5,
      })
    }
    const wikiItems = await db("game_items").select("id", "name").limit(10000)
    for (const i of wikiItems) {
      game_data_routes.push({
        url: `/wiki/items/${i.id}#/${formatListingSlug(i.name || "")}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.6,
      })
    }
    const ships = await db("game_items").where("type", "Ship").select("id", "name").limit(2000)
    for (const s of ships) {
      game_data_routes.push({
        url: `/wiki/ships/${s.id}#/${formatListingSlug(s.name || "")}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.6,
      })
    }
    const manufacturers = await db("wiki_manufacturers").select("code", "name").limit(500)
    for (const m of manufacturers) {
      game_data_routes.push({
        url: `/wiki/manufacturers/${m.code}#/${formatListingSlug(m.name || "")}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.5,
      })
    }
    // Mining ores (resources that are mineable)
    const ores = await db("resources").select("name").whereNotNull("name").where("is_mineable", true).limit(500)
    for (const o of ores) {
      game_data_routes.push({
        url: `/mining/ores/${encodeURIComponent(o.name)}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.5,
      })
    }
    // Wiki commodities (same as resources but different route)
    for (const r of resources) {
      game_data_routes.push({
        url: `/wiki/commodities/${r.resource_id}#/${formatListingSlug(r.name || "")}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.5,
      })
    }
  } catch (error) {
    logger.warn("Failed to fetch game data for sitemap", { error })
  }

  return [
    {
      url: "/",
      changefreq: EnumChangefreq.MONTHLY,
      priority: 1.0,
    },
    {
      url: "/market",
      changefreq: EnumChangefreq.ALWAYS,
      priority: 1.0,
    },
    {
      url: "/recruiting",
      changefreq: EnumChangefreq.ALWAYS,
      priority: 1.0,
    },
    {
      url: "/contractors",
      changefreq: EnumChangefreq.ALWAYS,
      priority: 1.0,
    },
    {
      url: "/contracts",
      changefreq: EnumChangefreq.ALWAYS,
      priority: 1.0,
    },
    {
      url: "/services",
      changefreq: EnumChangefreq.ALWAYS,
      priority: 1.0,
    },
    { url: "/bulk", changefreq: EnumChangefreq.ALWAYS, priority: 0.8 },
    { url: "/buyorders", changefreq: EnumChangefreq.ALWAYS, priority: 0.8 },
    { url: "/market/services", changefreq: EnumChangefreq.ALWAYS, priority: 0.8 },
    { url: "/missions", changefreq: EnumChangefreq.WEEKLY, priority: 0.8 },
    { url: "/blueprints", changefreq: EnumChangefreq.WEEKLY, priority: 0.8 },
    { url: "/crafting/calculator", changefreq: EnumChangefreq.MONTHLY, priority: 0.7 },
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
    { url: "/crafting/history", changefreq: EnumChangefreq.MONTHLY, priority: 0.5 },
    { url: "/login", changefreq: EnumChangefreq.YEARLY, priority: 0.3 },
    { url: "/signup", changefreq: EnumChangefreq.YEARLY, priority: 0.4 },
    ...contractor_routes,
    ...user_routes,
    ...recruit_routes,
    ...market_routes,
    ...game_data_routes,
  ]
}

export async function generateSitemapsFromPages(
  pages: SitemapItemLoose[],
  hostname: string = getSitemapHostname(),
  limit: number = SITEMAP_URL_LIMIT,
  indexHostname: string = getSitemapIndexHostname(),
): Promise<SitemapCache> {
  const sitemaps = new Map<number, Buffer>()

  const getSitemapStream = (i: number): [string, SitemapStream, WriteStream] => {
    const sitemapStream = new SitemapStream({ hostname })
    const chunks: Buffer[] = []
    const collector = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        callback()
      },
      final(callback) {
        sitemaps.set(i, Buffer.concat(chunks))
        callback()
      },
    }) as WriteStream

    sitemapStream.pipe(createGzip()).pipe(collector)

    const publicUrl = new URL(`sitemap-${i}.xml`, indexHostname).toString()
    return [publicUrl, sitemapStream, collector]
  }

  const sms = new SitemapAndIndexStream({
    limit,
    getSitemapStream,
  })
  const indexPromise = streamToPromise(sms.pipe(createGzip()))

  for (const page of pages) {
    sms.write(page)
  }
  sms.end()

  const index = await indexPromise
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
    const pages = await collectSitemapPages()
    const generated = await generateSitemapsFromPages(pages)
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
  generationPromise = null
}
