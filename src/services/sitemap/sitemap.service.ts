import { createHash } from "node:crypto"
import { createGzip, gzipSync } from "node:zlib"
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
  loadSitemapFileState,
  saveSitemapFileChanges,
  type SitemapFileChange,
  type StoredSitemapFile,
} from "./sitemap-file-state.js"
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
  /**
   * The section couldn't be fully built this time (its query threw, a section
   * that always has rows came back empty, one of its sources failed, or the
   * content manifest was unavailable). Its last good pages are served instead,
   * else whatever `pages` it did get, else a 503: it never drops out of the
   * index.
   */
  failed?: boolean
}

/** One sitemap file's <lastmod> and the content it was computed from. */
export interface SitemapFileMeta {
  /** Hash of the file's URL entries: unchanged content keeps its lastmod. */
  hash: string
  /** When this file's content last changed (stored in sitemap_file_state). */
  changedAt: string
  /** The index's <lastmod> for this file (W3C datetime). */
  lastmod: string
}

export interface SitemapCache {
  index: Buffer
  sitemaps: Map<string, Buffer>
  /** Per file key (e.g. "wiki-1"): its lastmod, for the index and Last-Modified. */
  files: Map<string, SitemapFileMeta>
  /**
   * Files the index lists that can't be served yet: their section failed with
   * no earlier copy to fall back on (cold start). They answer 503 so a crawler
   * retries, instead of the section silently vanishing from the index.
   */
  unavailable: Set<string>
  /** Each section's pages as last built successfully, reused when it fails. */
  sectionPages: Map<string, SitemapItemLoose[]>
  /** Newest lastmod in the index (its Last-Modified). */
  indexLastmod: string | undefined
  /** How long this cache stays fresh (shorter when a source was missing). */
  ttlMs: number
}

export interface SitemapSections {
  sections: SitemapSection[]
  /** False when any section failed this time (see SitemapSection.failed). */
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

/**
 * Thrown by a section builder when some of its sources failed: the section is
 * marked failed, with the pages it did get as a fallback for a cold start.
 */
export class PartialSitemapSectionError extends Error {
  constructor(
    section: string,
    readonly pages: SitemapItemLoose[],
    readonly failedSources: string[],
  ) {
    super(`Sitemap section "${section}" is missing ${failedSources.join(", ")}`)
    this.name = "PartialSitemapSectionError"
  }
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
 *
 * Either way the section is marked failed rather than dropped: the index keeps
 * listing it (with its last good pages, or a 503 until it builds), so a crawler
 * never reads an index with sections missing.
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
    if (error instanceof PartialSitemapSectionError) {
      // Each failed source was already reported by name.
      sections.push({ name, pages: error.pages, failed: true })
      return
    }
    logger.error("Failed to build sitemap section", { section: name, error })
    reportSitemapError(error, name)
    sections.push({ name, pages: [], failed: true })
    return
  }
  if (pages.length === 0 && options.expectRows) {
    const error = new EmptySitemapSectionError(name)
    logger.error("Sitemap section is empty", { section: name })
    reportSitemapError(error, name)
    sections.push({ name, pages, failed: true })
    return
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
      const missions = await db("missions").select("mission_code", "mission_name", "updated_at").limit(10000)
      for (const m of missions) {
        wikiPages.push({ url: `/missions/${m.mission_code}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6, lastmod: lastmod(m.updated_at) })
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
        .select("blueprint_name", "updated_at")
        .where("is_active", true)
        .whereNotNull("blueprint_name")
        .orderBy("blueprint_name")
        .limit(10000)
      // The page's lastmod is the newest row with that name.
      const byName = new Map<string, SitemapItemLoose>()
      for (const b of blueprints) {
        if (!b.blueprint_name) continue
        const updated = lastmod(b.updated_at)
        const page = byName.get(b.blueprint_name)
        if (page) {
          page.lastmod = newestLastmod([page.lastmod, updated])
          continue
        }
        const added: SitemapItemLoose = { url: `/blueprints/${encodeURIComponent(b.blueprint_name)}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.6, lastmod: updated }
        byName.set(b.blueprint_name, added)
        wikiPages.push(added)
      }
      return byName.size
    } },
    { name: "resources", run: async () => {
      const resources = await db("resources").select("resource_id", "resource_name", "updated_at").limit(5000)
      for (const r of resources) {
        const updated = lastmod(r.updated_at)
        wikiPages.push({ url: `/resources/${formatShortSlug(r.resource_id, r.resource_name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5, lastmod: updated })
        wikiPages.push({ url: `/wiki/commodities/${formatShortSlug(r.resource_id, r.resource_name || "")}`, changefreq: EnumChangefreq.MONTHLY, priority: 0.5, lastmod: updated })
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

  const failedSources: string[] = []
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
      failedSources.push(query.name)
    }
  }
    // A failed source would shrink the section (wiki-1 would vanish): keep
    // the last good copy instead.
    if (failedSources.length > 0) throw new PartialSitemapSectionError("wiki", wikiPages, failedSources)
    return wikiPages
  }, { expectRows: true })

  // ── Mission hubs ── (by giver, faction, type and star system)
  await collectSection(sections, "missions-hubs", () => missionHubSitemapPages(db), { expectRows: true })

  // ── Users (last — lowest priority) ──
  await collectSection(sections, "users", () => userSitemapPages(db), { expectRows: true })

  const contentPages = await contentPagesPromise
  // Right after "static": the hand-written pages come first in the index.
  // Unavailable (null) is a failure, not "no content": it keeps its place.
  if (contentPages === null) sections.splice(1, 0, { name: "content", pages: [], failed: true })
  else if (contentPages.length > 0) sections.splice(1, 0, { name: "content", pages: contentPages })

  return { sections, complete: sections.every((section) => !section.failed) }
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

/** Newest of some ISO lastmods, or undefined when there are none. */
function newestLastmod(values: (string | undefined)[]): string | undefined {
  let newest: string | undefined
  let newestMs = -Infinity
  for (const value of values) {
    if (!value) continue
    const ms = new Date(value).getTime()
    if (!Number.isNaN(ms) && ms > newestMs) {
      newestMs = ms
      newest = new Date(ms).toISOString()
    }
  }
  return newest
}

/** A file's entries, hashed: the same URLs (and lastmods) give the same hash. */
function hashPages(pages: SitemapItemLoose[]): string {
  return createHash("sha256").update(JSON.stringify(pages)).digest("hex")
}

/**
 * Build the index and section files. `previous` is the last cache this process
 * built: a failed section reuses its pages, and a file whose content hasn't
 * changed keeps its lastmod.
 *
 * Index <lastmod>, per file:
 * - every URL in it has a lastmod: the newest of them (market, shops, content,
 *   mission hubs);
 * - otherwise: when the file's content last changed, i.e. the generation that
 *   first produced these exact entries. A rebuild with the same URLs keeps the
 *   old time, so it isn't "now" on every request or every 6-hour rebuild.
 *   The hash and time are stored in sitemap_file_state, so a deploy or
 *   restart keeps them too; `last_changed_at` only moves when the hash does.
 *   If the table can't be read, this process's previous build is used.
 */
export async function generateSitemapCache(
  previous: SitemapCache | null = null,
  now: Date = new Date(),
): Promise<SitemapCache> {
  const db = getKnex()
  let stored: Map<string, StoredSitemapFile> | null = null
  try {
    stored = await loadSitemapFileState(db)
  } catch (error) {
    logger.error("Failed to load sitemap file state", { error })
    reportSitemapError(error, "file-state")
  }
  const { sections, complete } = await collectSitemapSections()
  const changes: SitemapFileChange[] = []
  const hostname = getSitemapHostname()
  const indexHostname = getSitemapIndexHostname()
  const sitemaps = new Map<string, Buffer>()
  const files = new Map<string, SitemapFileMeta>()
  const unavailable = new Set<string>()
  const sectionPages = new Map<string, SitemapItemLoose[]>()
  const indexEntries: string[] = []
  const generatedAt = now.toISOString()

  for (const section of sections) {
    const pages = section.failed
      ? (previous?.sectionPages.get(section.name) ?? (section.pages.length > 0 ? section.pages : undefined))
      : section.pages
    if (!pages) {
      // Failed with nothing to fall back on: still listed, served as a 503.
      const key = `${section.name}-0`
      unavailable.add(key)
      indexEntries.push(`<sitemap><loc>${indexHostname}sitemap-${key}.xml</loc></sitemap>`)
      continue
    }
    // Only a section that may legitimately be empty (recruiting) gets here
    // with no pages: an empty <urlset> isn't valid, so it isn't listed.
    if (pages.length === 0) continue
    sectionPages.set(section.name, pages)

    for (let i = 0; i * SITEMAP_URL_LIMIT < pages.length; i++) {
      const chunk = pages.slice(i * SITEMAP_URL_LIMIT, (i + 1) * SITEMAP_URL_LIMIT)
      const key = `${section.name}-${i}`
      const hash = hashPages(chunk)
      const storedFile = stored?.get(key)
      const before = storedFile ?? previous?.files.get(key)
      const changedAt = before && before.hash === hash ? before.changedAt : generatedAt
      if (stored && (storedFile?.hash !== hash || storedFile.changedAt !== changedAt)) {
        changes.push({ key, hash, changedAt })
      }
      const urlLastmods = chunk.map((page) => (typeof page.lastmod === "string" ? page.lastmod : undefined))
      const lastmod =
        (urlLastmods.every((value) => value !== undefined) && newestLastmod(urlLastmods)) || changedAt
      sitemaps.set(key, await generateSectionSitemap(chunk, hostname))
      files.set(key, { hash, changedAt, lastmod })
      indexEntries.push(
        `<sitemap><loc>${indexHostname}sitemap-${key}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
      )
    }
  }

  // Only written when the stored state could be read: never overwrite real
  // times with this build's guesses.
  if (stored) {
    try {
      await saveSitemapFileChanges(db, changes)
    } catch (error) {
      logger.error("Failed to save sitemap file state", { error })
      reportSitemapError(error, "file-state")
    }
  }

  const indexXml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexEntries.join("")}</sitemapindex>`
  const index = gzipSync(Buffer.from(indexXml, "utf-8"))

  return {
    index,
    sitemaps,
    files,
    unavailable,
    sectionPages,
    indexLastmod: newestLastmod([...files.values()].map((file) => file.lastmod)),
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
      const generated = await generateSitemapCache(cache)
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
