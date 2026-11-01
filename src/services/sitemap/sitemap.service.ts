import { createGzip } from "node:zlib"
import { createRequire } from "node:module"
import {
  EnumChangefreq,
  SitemapItemLoose,
  SitemapStream,
} from "sitemap"
import { Writable } from "node:stream"
import type { Knex } from "knex"

import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import { formatShortSlug } from "../../api/routes/v2/util/short-slug.js"
import { listingPubliclyListed } from "../../api/routes/v2/util/listing-visibility.js"
import * as recruitingDb from "../../api/routes/v1/recruiting/database.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { fetchContentSitemapPages } from "./content-manifest.js"
import {
  activeLiveVersion,
  buildHubIndex,
  loadHubRows,
  MISSION_HUB_KINDS,
  missionHubPath,
} from "../../api/routes/v2/game-data/missions/mission-hubs.js"

const require = createRequire(import.meta.url)
const Bugsnag = require("@bugsnag/js") as {
  notify: (
    error: Error,
    onError?: (event: {
      addMetadata: (section: string, values: Record<string, unknown>) => void
    }) => void,
  ) => void
}

export const SITEMAP_URL_LIMIT = 10_000
export const SITEMAP_TTL_MS = 6 * 60 * 60 * 1000
/**
 * TTL when a best-effort source (the frontend's content manifest) was
 * unavailable, so its URLs come back soon instead of after the full TTL.
 */
export const SITEMAP_DEGRADED_TTL_MS = 15 * 60 * 1000

export interface SitemapSection {
  name: string
  pages: SitemapItemLoose[]
}

export interface SitemapCache {
  index: Buffer
  sitemaps: Map<string, Buffer>
  /** How long this cache stays fresh (shorter when a source was missing). */
  ttlMs: number
}

export interface SitemapSections {
  sections: SitemapSection[]
  /** False when the content manifest couldn't be fetched this time. */
  complete: boolean
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

/** Report a sitemap problem to BugSnag (outside development), tagged by section. */
function reportSitemapError(error: unknown, section: string, subsection?: string): void {
  if (process.env.NODE_ENV === "development") return
  Bugsnag.notify(
    error instanceof Error ? error : new Error(String(error)),
    (event) => {
      event.addMetadata("sitemap", { section, ...(subsection ? { subsection } : {}) })
    },
  )
}

/** Thrown (and reported) when a section that always has rows comes back empty. */
export class EmptySitemapSectionError extends Error {
  constructor(section: string) {
    super(`Sitemap section "${section}" returned no URLs`)
    this.name = "EmptySitemapSectionError"
  }
}

/**
 * Build one dynamic section, isolating its failure. If the section's queries
 * throw, we log and skip that section instead of aborting the whole sitemap.
 * Previously any single failing query (e.g. a users/contractors scan) rejected
 * generateSitemapCache() entirely, so every sitemap file — including unrelated
 * ones like shops — served a 500 and Google reported "sitemap could not be
 * read". Degrading one section to empty is far better than losing them all.
 *
 * A section that is never legitimately empty (`expectRows`) and comes back
 * with no URLs is reported the same way: an empty section is dropped from the
 * index, so a query that silently matches nothing looks exactly like a
 * missing section. That is how the market section disappeared from the live
 * index (an unqualified column in the test-shop filter matched no rows) with
 * nothing in the logs or BugSnag.
 */
async function collectSection(
  sections: SitemapSection[],
  name: string,
  build: () => Promise<SitemapItemLoose[]>,
  options: { expectRows: boolean },
): Promise<void> {
  let pages: SitemapItemLoose[]
  try {
    pages = await build()
  } catch (error) {
    logger.error("Failed to build sitemap section", { section: name, error })
    reportSitemapError(error, name)
    return
  }
  if (pages.length === 0 && options.expectRows) {
    const error = new EmptySitemapSectionError(name)
    logger.error("Sitemap section is empty", { section: name })
    reportSitemapError(error, name)
  }
  sections.push({ name, pages })
}

/** ISO date for <lastmod>, or undefined when the row has no usable timestamp. */
function lastmod(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Every column is table-qualified: the test-shop filter is a correlated subquery. */
const LISTING_SEARCH_PUBLIC = { status: "ls.status", visibility: "ls.visibility", shopId: "ls.shop_id" }

/** Publicly listed listings and their game items' aggregate pages. */
export async function marketSitemapPages(db: Knex): Promise<SitemapItemLoose[]> {
  const listings: { listing_id: string; title: string; updated_at: unknown }[] =
    await db("listing_search as ls")
      .select("ls.listing_id", "ls.title", "ls.updated_at")
      .where(listingPubliclyListed(db, LISTING_SEARCH_PUBLIC))

  const aggregateItems: { game_item_id: string; game_item_name: string; updated_at: unknown }[] =
    await db("listing_search as ls")
      .select("ls.game_item_id", "ls.game_item_name")
      .max("ls.updated_at as updated_at")
      .where(listingPubliclyListed(db, LISTING_SEARCH_PUBLIC))
      .whereNotNull("ls.game_item_id")
      .groupBy("ls.game_item_id", "ls.game_item_name")

  const pages: SitemapItemLoose[] = []
  const seen = new Set<string>()
  for (const listing of listings) {
    // listing_search has one row per listing item: a bundle appears once per item.
    if (seen.has(listing.listing_id)) continue
    seen.add(listing.listing_id)
    pages.push({
      url: `/market/${formatShortSlug(listing.listing_id, listing.title)}`,
      changefreq: EnumChangefreq.WEEKLY,
      priority: 0.8,
      lastmod: lastmod(listing.updated_at),
    })
  }
  for (const item of aggregateItems) {
    pages.push({
      url: `/market/aggregate/${formatShortSlug(item.game_item_id, item.game_item_name || "")}`,
      changefreq: EnumChangefreq.WEEKLY,
      priority: 0.7,
      lastmod: lastmod(item.updated_at),
    })
  }
  return pages
}

/**
 * Users whose profile has something on it: they own an active shop, sell a
 * publicly listed listing, or have reviews. One URL each (the profile; its
 * tabs are the same page). Every other confirmed account would be a thin page.
 */
export async function userSitemapPages(db: Knex): Promise<SitemapItemLoose[]> {
  const users: { username: string }[] = await db("accounts as a")
    .select("a.username")
    .where("a.rsi_confirmed", true)
    .where("a.is_test", false)
    .whereNotNull("a.username")
    .where(function () {
      this.whereExists(function () {
        this.select(db.raw("1"))
          .from("shops as us")
          .whereRaw("us.owner_user_id = a.user_id")
          .where("us.status", "active")
      })
        .orWhereExists(function () {
          this.select(db.raw("1"))
            .from("listing_search as uls")
            .whereRaw("uls.shop_owner_user_id = a.user_id")
            .where(listingPubliclyListed(db, { status: "uls.status", visibility: "uls.visibility", shopId: "uls.shop_id" }))
        })
        .orWhereExists(function () {
          // The reviews the profile shows (profiles/database.ts getUserReviews).
          this.select(db.raw("1"))
            .from("order_reviews as ur")
            .join("orders as uo", "uo.order_id", "ur.order_id")
            .whereRaw(
              "((ur.role = 'customer' AND uo.contractor_id IS NULL AND uo.assigned_id = a.user_id) OR (ur.role = 'contractor' AND uo.customer_id = a.user_id))",
            )
        })
    })
    .orderBy("a.username")

  return users.map((user) => ({
    url: `/user/${user.username}`,
    changefreq: EnumChangefreq.MONTHLY,
    priority: 0.5,
  }))
}

/**
 * The mission hubs (/missions/givers, /missions/givers/<slug>, … for
 * factions, types and systems) of the active LIVE version, dated by its last
 * game-data import. Same hubs as GET /api/v2/game-data/missions/hubs.
 */
export async function missionHubSitemapPages(db: Knex): Promise<SitemapItemLoose[]> {
  const version = await activeLiveVersion(db)
  if (!version) return []
  const index = buildHubIndex(await loadHubRows(db, version.version_id))
  const updated = lastmod(version.last_data_update)
  return MISSION_HUB_KINDS.flatMap((kind): SitemapItemLoose[] => {
    if (index[kind].length === 0) return []
    return [
      { url: `/missions/${kind}`, changefreq: EnumChangefreq.WEEKLY, priority: 0.7, lastmod: updated },
      ...index[kind].map((hub) => ({
        url: missionHubPath(kind, hub.slug),
        changefreq: EnumChangefreq.WEEKLY,
        priority: 0.7,
        lastmod: updated,
      })),
    ]
  })
}

export async function collectSitemapSections(): Promise<SitemapSections> {
  const db = getKnex()
  const sections: SitemapSection[] = []
  // Help & Guides, About: Markdown built by the frontend (see
  // content-manifest.ts). Fetched in parallel with the DB sections below.
  const contentPagesPromise = fetchContentSitemapPages(getSitemapHostname())

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
      { url: "/shops", changefreq: EnumChangefreq.ALWAYS, priority: 0.9 },
      { url: "/storefronts", changefreq: EnumChangefreq.WEEKLY, priority: 0.8 },
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
      { url: "/developers", changefreq: EnumChangefreq.MONTHLY, priority: 0.5 },
      // Legal pages: static HTML on Cloudflare Pages (frontend public/terms.html, privacy.html)
      { url: "/terms", changefreq: EnumChangefreq.YEARLY, priority: 0.2 },
      { url: "/privacy", changefreq: EnumChangefreq.YEARLY, priority: 0.2 },
    ],
  })

  // ── Market listings ──
  await collectSection(sections, "market", () => marketSitemapPages(db), { expectRows: true })

  // Test accounts, orgs and shops are never listed
  // (services/test-accounts/isolation.ts).

  // ── Contractors ── (the org page only: its tabs canonicalise to it)
  await collectSection(sections, "contractors", async () => {
    const contractors = await contractorDb.getContractorListings({ is_test: false })
    return contractors.map((contractor) => ({
      url: `/contractor/${contractor.spectrum_id}`,
      changefreq: EnumChangefreq.MONTHLY,
      priority: 0.5,
    }))
  }, { expectRows: true })

  // ── Shops ── (the shop page only: /services and /reviews canonicalise to it)
  await collectSection(sections, "shops", async () => {
    const shops: { slug: string; updated_at: unknown }[] = await db("shops")
      .select("slug", "updated_at")
      .where("status", "active")
      .where("is_test", false)
      .whereNot("slug", "")
    return shops.map((shop) => ({
      url: `/shops/${shop.slug}`,
      changefreq: EnumChangefreq.WEEKLY,
      priority: 0.7,
      lastmod: lastmod(shop.updated_at),
    }))
  }, { expectRows: true })

  // ── Recruiting ── (can legitimately be empty)
  await collectSection(sections, "recruiting", async () => {
    const recruit_posts = await recruitingDb.getAllRecruitingPosts()
    const recruitPages: SitemapItemLoose[] = []
    for (const post of recruit_posts) {
      recruitPages.push({
        url: `/recruiting/post/${post.post_id}`,
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.5,
      })
    }
    return recruitPages
  }, { expectRows: false })

  // ── Wiki & Game Data ──
  await collectSection(sections, "wiki", async () => {
  const wikiPages: SitemapItemLoose[] = []

  // Each source fails (or comes back empty) on its own, reported by name.
  const wikiQueries: { name: string; run: () => Promise<number> }[] = [
    { name: "missions", run: async () => {
      const missions = await db("missions").select("mission_code", "mission_name").limit(10000)
      for (const m of missions) {
        wikiPages.push({ url: `/missions/${m.mission_code}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6 })
      }
      return missions.length
    } },
    { name: "blueprints", run: async () => {
      // The frontend route /blueprints/:slug and the detail API
      // (GET /api/v2/game-data/blueprints/{blueprint_id}) resolve the
      // blueprint name or the blueprint id, never blueprint_code (which
      // 404s). Link the name, URL-encoded like the frontend's links, once per
      // name: the API resolves a name to one blueprint, so rows sharing a name
      // (e.g. across game versions) are the same page.
      const blueprints = await db("blueprints")
        .select("blueprint_name")
        .where("is_active", true)
        .whereNotNull("blueprint_name")
        .orderBy("blueprint_name")
        .limit(10000)
      const seen = new Set<string>()
      for (const b of blueprints) {
        if (!b.blueprint_name || seen.has(b.blueprint_name)) continue
        seen.add(b.blueprint_name)
        wikiPages.push({ url: `/blueprints/${encodeURIComponent(b.blueprint_name)}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6 })
      }
      return seen.size
    } },
    { name: "resources", run: async () => {
      const resources = await db("resources").select("resource_id", "resource_name").limit(5000)
      for (const r of resources) {
        wikiPages.push({ url: `/resources/${formatShortSlug(r.resource_id, r.resource_name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 })
        wikiPages.push({ url: `/wiki/commodities/${formatShortSlug(r.resource_id, r.resource_name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 })
      }
      return resources.length
    } },
    { name: "items", run: async () => {
      // More than 10k game items exist (11.5k in Oct 2026): the old 10k cap
      // silently dropped the rest. Sections are chunked per 10k URLs anyway.
      const items = await db("game_items").select("id", "name").limit(50000)
      for (const i of items) {
        wikiPages.push({ url: `/wiki/items/${formatShortSlug(i.id, i.name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6 })
      }
      return items.length
    } },
    { name: "ships", run: async () => {
      const ships = await db("game_items").where("type", "Ship for Sale/Rental").select("id", "name").limit(2000)
      for (const s of ships) {
        wikiPages.push({ url: `/wiki/ships/${formatShortSlug(s.id, s.name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6 })
      }
      return ships.length
    } },
    { name: "manufacturers", run: async () => {
      const manufacturers = await db("wiki_manufacturers").select("code", "name").limit(500)
      for (const m of manufacturers) {
        wikiPages.push({ url: `/wiki/manufacturers/${m.code}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 })
      }
      return manufacturers.length
    } },
    { name: "ores", run: async () => {
      const ores = await db("mineable_elements").select("name").whereNotNull("name").limit(500)
      for (const o of ores) {
        wikiPages.push({ url: `/mining/ores/${encodeURIComponent(o.name)}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5 })
      }
      return ores.length
    } },
  ]

  for (const query of wikiQueries) {
    try {
      const count = await query.run()
      if (count === 0) {
        logger.error("Sitemap game data source is empty", { section: "wiki", subsection: query.name })
        reportSitemapError(new EmptySitemapSectionError(`wiki/${query.name}`), "wiki", query.name)
      }
    } catch (error) {
      logger.error("Failed to fetch game data section for sitemap", { section: "wiki", subsection: query.name, error })
      reportSitemapError(error, "wiki", query.name)
    }
  }
    return wikiPages
  }, { expectRows: true })

  // ── Mission hubs ── (by giver, faction, type and star system)
  await collectSection(sections, "missions-hubs", () => missionHubSitemapPages(db), { expectRows: true })

  // ── Users (last — lowest priority) ──
  await collectSection(sections, "users", () => userSitemapPages(db), { expectRows: true })

  const contentPages = await contentPagesPromise
  if (contentPages && contentPages.length > 0) {
    // Right after "static": the hand-written pages come first in the index.
    sections.splice(1, 0, { name: "content", pages: contentPages })
  }

  return { sections, complete: contentPages !== null }
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
  const { sections, complete } = await collectSitemapSections()
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

  return {
    index,
    sitemaps,
    ttlMs: complete ? SITEMAP_TTL_MS : SITEMAP_DEGRADED_TTL_MS,
  }
}

let cache: SitemapCache | null = null
let cacheGeneratedAt = 0
let generationPromise: Promise<SitemapCache> | null = null

// Kick off a (de-duplicated) regeneration. Resolves to the freshly built cache.
// Errors are swallowed here so background callers can't produce unhandled
// rejections; the failure is logged/reported and the previous cache is kept.
function startRegeneration(): Promise<SitemapCache> {
  if (generationPromise) {
    return generationPromise
  }

  generationPromise = (async () => {
    try {
      const generated = await generateSitemapCache()
      cache = generated
      cacheGeneratedAt = Date.now()
      return generated
    } finally {
      generationPromise = null
    }
  })()

  return generationPromise
}

export async function getSitemapCache(): Promise<SitemapCache> {
  const isStale = !cache || Date.now() - cacheGeneratedAt >= cache.ttlMs

  // Warm cache: serve it directly.
  if (cache && !isStale) {
    return cache
  }

  // Stale-while-revalidate: we have a usable (if old) cache, so serve it
  // immediately and rebuild in the background. This keeps crawler requests
  // fast — no request ever blocks on a full DB-backed regeneration, which
  // could otherwise exceed a crawler's read timeout ("Sitemap could not be
  // read"). Worst case a single request gets a sitemap up to a few hours old.
  if (cache) {
    startRegeneration().catch((error) => {
      logger.error("Background sitemap regeneration failed", { error })
      if (process.env.NODE_ENV !== "development") {
        Bugsnag.notify(
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    })
    return cache
  }

  // Cold start: nothing to serve yet, so we must wait for the first build.
  return startRegeneration()
}

export function clearSitemapCache(): void {
  cache = null
  cacheGeneratedAt = 0
}
