import { gunzipSync } from "node:zlib"
import { createRequire } from "node:module"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../../api/routes/v1/contractors/database.js", () => ({
  getContractorListings: vi.fn(async () => []),
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUsersWhere: vi.fn(async () => []),
}))
vi.mock("../../api/routes/v1/recruiting/database.js", () => ({
  getAllRecruitingPosts: vi.fn(async () => []),
}))

/** A row as the sitemap service reads it off a knex query. */
type SitemapRow = Record<string, unknown>

/**
 * The slice of the knex query-builder surface the sitemap service touches.
 * Every chain method returns the same builder; `then` and the iterator are the
 * terminals.
 */
type ChainMock = {
  select: Mock
  where: Mock
  whereNot: Mock
  whereNotNull: Mock
  groupBy: Mock
  limit: Mock
  orderBy: Mock
  max: Mock
  then: (
    resolve: (value: SitemapRow[]) => unknown,
    reject?: (reason: Error) => unknown,
  ) => unknown
  [Symbol.iterator]: () => Generator<SitemapRow>
}

function createChainMock(resolveValue: SitemapRow[] = []): ChainMock {
  const chain = {} as ChainMock
  const methods = ["select", "where", "whereNot", "whereNotNull", "groupBy", "limit", "orderBy", "max"] as const
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve) => resolve(resolveValue)
  chain[Symbol.iterator] = function* () { yield* resolveValue }
  return chain
}

/** The mocked getKnex() table factory, kept as a Mock so tests can re-stub it. */
const mockKnex: Mock<(table?: string) => ChainMock> = vi.fn(() =>
  createChainMock([]),
)

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => mockKnex,
}))

// The service loads BugSnag with require() (the same CJS instance server.ts
// starts), which vi.mock doesn't intercept: spy on that instance instead.
const bugsnagNotify = vi
  .spyOn(createRequire(import.meta.url)("@bugsnag/js") as { notify: (...args: unknown[]) => void }, "notify")
  .mockImplementation(() => {})

vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

/**
 * The content manifest is fetched from the frontend. Never hit the network in
 * tests (the deploy workflow runs them): default to "not published yet".
 */
const fetchMock: Mock<typeof fetch> = vi.fn(
  async () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }),
)
vi.stubGlobal("fetch", fetchMock)

function manifestResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

import knexFactory, { type Knex } from "knex"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import {
  generateSitemapCache,
  getSitemapCache,
  clearSitemapCache,
  marketSitemapPages,
  missionHubSitemapPages,
  userSitemapPages,
  SITEMAP_DEGRADED_TTL_MS,
  SITEMAP_TTL_MS,
} from "./sitemap.service.js"

/**
 * A real (connectionless) pg knex whose queries resolve to canned rows by
 * table, so a test can both run a section builder and read the SQL it sent.
 */
function sqlRecordingKnex(rowsByTable: Record<string, SitemapRow[][]>) {
  const real = knexFactory({ client: "pg" })
  const queries: { table: string; sql: string }[] = []
  const calls: Record<string, number> = {}
  const db = ((table: string) => {
    const builder = real(table)
    const name = table.split(" ")[0]
    const n = calls[name] ?? 0
    calls[name] = n + 1
    Object.assign(builder, {
      then(resolve: (rows: SitemapRow[]) => unknown) {
        queries.push({ table: name, sql: builder.toString() })
        return Promise.resolve(resolve(rowsByTable[name]?.[n] ?? []))
      },
    })
    return builder
  }) as unknown as Knex
  Object.assign(db, { raw: real.raw.bind(real) })
  return { db, queries }
}

describe("generateSitemapCache", () => {
  it("produces a valid sitemap index with section-based keys", async () => {
    const { index, sitemaps } = await generateSitemapCache()

    const indexXml = gunzipSync(index).toString("utf8")
    expect(indexXml).toContain("<sitemapindex")
    expect(indexXml).toContain("sitemap-static-0.xml")

    expect(sitemaps.has("static-0")).toBe(true)

    const staticXml = gunzipSync(sitemaps.get("static-0")!).toString("utf8")
    expect(staticXml).toContain("<url>")
    expect(staticXml).toContain("/market</loc>")
    expect(staticXml).toContain("/shops</loc>")
  })

  it("isolates a failing section instead of aborting the whole sitemap", async () => {
    bugsnagNotify.mockClear()
    // Make the shops query throw; every other db(...) call still returns [].
    mockKnex.mockImplementation((table?: string) => {
      if (table === "shops") {
        const chain = createChainMock([])
        chain.then = (_resolve, reject) =>
          reject?.(new Error("shops query blew up"))
        return chain
      }
      return createChainMock([])
    })

    // Must not throw — the failing section is isolated.
    const { index, sitemaps, unavailable } = await generateSitemapCache()

    const indexXml = gunzipSync(index).toString("utf8")
    // Static section (never fails) is still present…
    expect(sitemaps.has("static-0")).toBe(true)
    expect(indexXml).toContain("sitemap-static-0.xml")
    // …and shops stays in the index (no earlier copy: its file is a 503 so a
    // crawler retries), rather than 500-ing the whole index or vanishing.
    expect(indexXml).toContain("<loc>https://api.sc-market.space/sitemap-shops-0.xml</loc></sitemap>")
    expect(sitemaps.has("shops-0")).toBe(false)
    expect(unavailable.has("shops-0")).toBe(true)

    // Reset for any subsequent tests.
    mockKnex.mockImplementation(() => createChainMock([]))
  })
})

describe("content (Help & Guides) section", () => {
  beforeEach(() => {
    mockKnex.mockImplementation(() => createChainMock([]))
    fetchMock.mockReset()
  })

  it("adds the manifest's content pages with lastmod and a full TTL", async () => {
    fetchMock.mockResolvedValue(
      manifestResponse({
        version: 1,
        pages: [
          { path: "/guides", updated: "2026-10-25" },
          { path: "/guides/buying/buy-an-item", updated: "2026-10-24" },
          { path: "/about", updated: "2026-10-25" },
          { path: "/changelog", updated: "2026-11-02" },
          { path: "/changelog/2026-11-02", updated: "2026-11-02" },
          {
            path: "/guides/buying/sell-an-item?lng=fr",
            updated: "2026-11-03",
            lang: "fr",
            alternates: [
              { hreflang: "en", path: "/guides/buying/sell-an-item" },
              { hreflang: "fr", path: "/guides/buying/sell-an-item?lng=fr" },
              { hreflang: "x-default", path: "/guides/buying/sell-an-item" },
            ],
          },
          // Anything outside the content routes is ignored.
          { path: "https://evil.example/x", updated: "2026-10-25" },
          { path: "/market/x", updated: "2026-10-25" },
          { path: "/guides/buying/buy-an-item?lng=pt", updated: "2026-10-25" },
        ],
      }),
    )
    const { index, sitemaps, unavailable } = await generateSitemapCache()

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://sc-market.space/content/manifest.json")
    expect(gunzipSync(index).toString("utf8")).toContain("sitemap-content-0.xml")
    const xml = gunzipSync(sitemaps.get("content-0")!).toString("utf8")
    expect(xml).toContain("<loc>https://sc-market.space/guides</loc>")
    expect(xml).toContain("<loc>https://sc-market.space/guides/buying/buy-an-item</loc>")
    expect(xml).toContain("<lastmod>2026-10-24")
    expect(xml).toContain("<loc>https://sc-market.space/about</loc>")
    expect(xml).toContain("<loc>https://sc-market.space/changelog</loc>")
    expect(xml).toContain("<loc>https://sc-market.space/changelog/2026-11-02</loc>")
    expect(xml).toContain("<loc>https://sc-market.space/guides/buying/sell-an-item?lng=fr</loc>")
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="fr" href="https://sc-market.space/guides/buying/sell-an-item?lng=fr"/>',
    )
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(xml).not.toContain("evil.example")
    expect(xml).not.toContain("/market/x")
    expect(xml).not.toContain("lng=pt")
    expect(unavailable.has("content-0")).toBe(false)
  })

  it.each([
    ["a 404", () => new Response("not found", { status: 404 })],
    [
      "the SPA fallback (HTML 200)",
      () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }),
    ],
    ["a wrong shape", () => manifestResponse({ pages: "nope" })],
  ])("fails safely to no content URLs on %s, and retries sooner", async (_label, response) => {
    fetchMock.mockImplementation(async () => response())
    const { sitemaps, ttlMs } = await generateSitemapCache()
    expect(sitemaps.has("content-0")).toBe(false)
    expect(sitemaps.has("static-0")).toBe(true)
    expect(ttlMs).toBe(SITEMAP_DEGRADED_TTL_MS)
  })

  it("fails safely when the fetch itself throws (timeout, DNS)", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    const { sitemaps, ttlMs } = await generateSitemapCache()
    expect(sitemaps.has("content-0")).toBe(false)
    expect(sitemaps.has("static-0")).toBe(true)
    expect(ttlMs).toBe(SITEMAP_DEGRADED_TTL_MS)
  })
})

describe("getSitemapCache (stale-while-revalidate)", () => {
  beforeEach(() => {
    clearSitemapCache()
    mockKnex.mockImplementation(() => createChainMock([]))
    fetchMock.mockResolvedValue(manifestResponse({ version: 1, pages: [] }))
  })

  it("serves the stale cache immediately and triggers a background rebuild", async () => {
    // Cold start builds and caches.
    const first = await getSitemapCache()

    // A warm call returns the exact same cache object without re-querying.
    const callsAfterBuild = mockKnex.mock.calls.length
    expect(await getSitemapCache()).toBe(first)
    expect(mockKnex.mock.calls.length).toBe(callsAfterBuild)

    // Make the cache look stale, then call again: it must return the old
    // object immediately (no blocking rebuild) yet kick off a fresh build
    // (observable as additional DB queries).
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + SITEMAP_TTL_MS + 1)
    try {
      const stale = await getSitemapCache()
      expect(stale).toBe(first)
      expect(mockKnex.mock.calls.length).toBeGreaterThan(callsAfterBuild)
    } finally {
      vi.useRealTimers()
    }

    clearSitemapCache()
  })
})

describe("blueprint URLs", () => {
  beforeEach(() => {
    clearSitemapCache()
    fetchMock.mockResolvedValue(manifestResponse({ version: 1, pages: [] }))
  })

  it("links each blueprint by its URL-encoded name (what /blueprints/:slug resolves), once per name", async () => {
    const blueprintsQuery = createChainMock([
      { blueprint_name: "BP_CRAFT_AMRS_LaserCannon_S1" },
      // Same name in another game version: the same page, listed once.
      { blueprint_name: "BP_CRAFT_AMRS_LaserCannon_S1" },
      { blueprint_name: "BP Odd/Name #2" },
    ])
    mockKnex.mockImplementation((table?: string) =>
      table === "blueprints" ? blueprintsQuery : createChainMock([]),
    )

    const { sitemaps } = await generateSitemapCache()
    const xml = gunzipSync(sitemaps.get("wiki-0")!).toString("utf8")
    const blueprintLocs = [...xml.matchAll(/<loc>([^<]*\/blueprints\/[^<]*)<\/loc>/g)].map((m) => m[1])

    expect(blueprintLocs).toEqual([
      "https://sc-market.space/blueprints/BP_CRAFT_AMRS_LaserCannon_S1",
      "https://sc-market.space/blueprints/BP%20Odd%2FName%20%232",
    ])
    // Never blueprint_code: the detail API answers it with 404.
    expect(blueprintsQuery.select).toHaveBeenCalledWith("blueprint_name", "updated_at")
    expect(blueprintsQuery.where).toHaveBeenCalledWith("is_active", true)

    mockKnex.mockImplementation(() => createChainMock([]))
  })
})

describe("market section", () => {
  beforeEach(() => {
    clearSitemapCache()
    bugsnagNotify.mockClear()
    fetchMock.mockResolvedValue(manifestResponse({ version: 1, pages: [] }))
  })

  it("lists each public listing once and each game item's aggregate page, with lastmod", async () => {
    const { db } = sqlRecordingKnex({
      listing_search: [
        [
          { listing_id: "5fdef409-3e25-4ea6-a008-4001f3e43515", title: "Irradiated Pearl", updated_at: new Date("2026-10-30T15:15:27Z") },
          // A bundle has one listing_search row per item.
          { listing_id: "5fdef409-3e25-4ea6-a008-4001f3e43515", title: "Irradiated Pearl", updated_at: new Date("2026-10-30T15:15:27Z") },
        ],
        [{ game_item_id: "e75d8c08-99fd-4754-8c65-9845e876ba3e", game_item_name: "Irradiated Pearl", updated_at: "2026-10-29T00:00:00Z" }],
      ],
    })
    const pages = await marketSitemapPages(db)
    expect(pages.map((p) => [p.url, p.lastmod])).toEqual([
      ["/market/5fdef409--irradiated-pearl", "2026-10-30T15:15:27.000Z"],
      ["/market/aggregate/e75d8c08--irradiated-pearl", "2026-10-29T00:00:00.000Z"],
    ])
  })

  it("qualifies every column in the test-shop filter (an unqualified one matched no rows)", async () => {
    const { db, queries } = sqlRecordingKnex({})
    await marketSitemapPages(db)
    expect(queries).toHaveLength(2)
    for (const { sql } of queries) {
      expect(sql).toContain("_ts.shop_id = ls.shop_id")
      expect(sql).toContain(`"ls"."status" = 'active'`)
      expect(sql).toContain(`"ls"."visibility" = 'public'`)
      expect(sql).not.toMatch(/_ts\.shop_id = shop_id/)
    }
  })

  it("puts sitemap-market-0.xml in the index when listings exist", async () => {
    mockKnex.mockImplementation((table?: string) =>
      table === "listing_search as ls"
        ? createChainMock([{ listing_id: "5fdef409-3e25-4ea6-a008-4001f3e43515", title: "Pearl", game_item_id: "e75d8c08-99fd-4754-8c65-9845e876ba3e", game_item_name: "Pearl" }])
        : createChainMock([]),
    )
    const { index, sitemaps } = await generateSitemapCache()
    expect(gunzipSync(index).toString("utf8")).toMatch(/sitemap-market-0\.xml/)
    const xml = gunzipSync(sitemaps.get("market-0")!).toString("utf8")
    expect(xml).toContain("<loc>https://sc-market.space/market/5fdef409--pearl</loc>")
    expect(xml).toContain("<loc>https://sc-market.space/market/aggregate/e75d8c08--pearl</loc>")
    mockKnex.mockImplementation(() => createChainMock([]))
  })

  it("reports an empty market section to BugSnag and keeps it in the index", async () => {
    mockKnex.mockImplementation(() => createChainMock([]))
    const { index, unavailable } = await generateSitemapCache()
    expect(gunzipSync(index).toString("utf8")).toContain("sitemap-market-0.xml")
    expect(unavailable.has("market-0")).toBe(true)
    const sections = bugsnagNotify.mock.calls.map(([error, onErrorArg]) => {
      const meta: Record<string, unknown> = {}
      const onError = onErrorArg as ((event: { addMetadata: (s: string, v: Record<string, unknown>) => void }) => void) | undefined
      onError?.({ addMetadata: (_s: string, values: Record<string, unknown>) => Object.assign(meta, values) })
      return [(error as Error).name, meta.section, meta.subsection]
    })
    expect(sections).toContainEqual(["EmptySitemapSectionError", "market", undefined])
    expect(sections).toContainEqual(["EmptySitemapSectionError", "shops", undefined])
    expect(sections).toContainEqual(["EmptySitemapSectionError", "wiki", "missions"])
    // Recruiting can legitimately be empty.
    expect(sections.some(([, section]) => section === "recruiting")).toBe(false)
  })
})

describe("sitemap hygiene", () => {
  beforeEach(() => {
    clearSitemapCache()
    fetchMock.mockResolvedValue(manifestResponse({ version: 1, pages: [] }))
  })

  it("lists shops once (no /services or /reviews tabs) with lastmod", async () => {
    mockKnex.mockImplementation((table?: string) =>
      table === "shops"
        ? createChainMock([{ slug: "alpha", updated_at: new Date("2026-10-01T00:00:00Z") }])
        : createChainMock([]),
    )
    const { sitemaps } = await generateSitemapCache()
    const xml = gunzipSync(sitemaps.get("shops-0")!).toString("utf8")
    expect(xml).toContain("<loc>https://sc-market.space/shops/alpha</loc>")
    expect(xml).toContain("<lastmod>2026-10-01T00:00:00.000Z</lastmod>")
    expect(xml).not.toContain("/services")
    expect(xml).not.toContain("/reviews")
    mockKnex.mockImplementation(() => createChainMock([]))
  })

  it("lists users once each, only those with a shop, a public listing or reviews", async () => {
    const { db, queries } = sqlRecordingKnex({ accounts: [[{ username: "alice" }]] })
    const pages = await userSitemapPages(db)
    expect(pages.map((p) => p.url)).toEqual(["/user/alice"])
    const [{ sql }] = queries
    expect(sql).toContain(`"a"."is_test" = false`)
    expect(sql).toContain("us.owner_user_id = a.user_id")
    expect(sql).toContain("uls.shop_owner_user_id = a.user_id")
    expect(sql).toContain("_ts.shop_id = uls.shop_id")
    expect(sql).toContain("order_reviews")
  })
})

describe("missions-hubs section", () => {
  it("lists each hub index and hub of the active LIVE version, dated by its last import", async () => {
    const { db, queries } = sqlRecordingKnex({
      game_versions: [[{ version_id: "live-1", last_data_update: new Date("2026-10-24T00:00:00Z") }]],
      missions: [[
        { giver: "Headhunters", faction: "Headhunters", type: "Mercenary", system: "Pyro", n: 12 },
        { giver: "~mission(Contractor)", faction: null, type: "Bounty Hunter", system: "Stanton", n: 3 },
        { giver: "Gloria Theolone", faction: null, type: "Delivery", system: "Terra", n: 1 },
      ]],
    })
    const pages = await missionHubSitemapPages(db)
    expect(pages.map((p) => p.url)).toEqual([
      "/missions/givers",
      "/missions/givers/headhunters",
      "/missions/factions",
      "/missions/factions/headhunters",
      "/missions/types",
      "/missions/types/mercenary",
      "/missions/types/bounty-hunter",
      "/missions/systems",
      "/missions/systems/pyro",
      "/missions/systems/stanton",
    ])
    expect(new Set(pages.map((p) => p.lastmod))).toEqual(new Set(["2026-10-24T00:00:00.000Z"]))
    const versionSql = queries.find((q) => q.table === "game_versions")!.sql
    expect(versionSql).toContain(`"version_type" = 'LIVE'`)
    expect(versionSql).toContain(`"is_active" = true`)
    expect(queries.find((q) => q.table === "missions")!.sql).toContain(`"m"."version_id" = 'live-1'`)
  })

  it("is empty without an active LIVE version", async () => {
    const { db } = sqlRecordingKnex({})
    expect(await missionHubSitemapPages(db)).toEqual([])
  })
})

describe("index <lastmod>", () => {
  const W3C_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

  /** Index entries as [file key, lastmod or undefined]. */
  function indexEntries(index: Buffer): [string, string | undefined][] {
    const xml = gunzipSync(index).toString("utf8")
    return [...xml.matchAll(/<sitemap><loc>[^<]*\/sitemap-([a-z-]+-\d+)\.xml<\/loc>(?:<lastmod>([^<]*)<\/lastmod>)?<\/sitemap>/g)].map(
      (m) => [m[1], m[2]],
    )
  }

  const listing = (id: string, updated: string) => ({
    listing_id: id,
    title: "Pearl",
    game_item_id: null,
    updated_at: new Date(updated),
  })

  /** Rows per table; an array of arrays gives each successive query its own rows. */
  function stubTables(rows: Record<string, SitemapRow[] | SitemapRow[][]>) {
    const calls: Record<string, number> = {}
    mockKnex.mockImplementation((table?: string) => {
      const name = table ?? ""
      const n = calls[name] ?? 0
      calls[name] = n + 1
      const value = rows[name] ?? []
      const perCall = Array.isArray(value[0]) ? (value as SitemapRow[][])[n] : (value as SitemapRow[])
      return createChainMock(perCall ?? [])
    })
  }

  beforeEach(() => {
    clearSitemapCache()
    fetchMock.mockResolvedValue(manifestResponse({ version: 1, pages: [] }))
  })

  it("gives every built file a W3C lastmod: the newest URL lastmod when every URL has one", async () => {
    stubTables({
      // The listings query, then the (empty) aggregate-items query.
      "listing_search as ls": [
        [
          listing("5fdef409-3e25-4ea6-a008-4001f3e43515", "2026-10-20T10:00:00Z"),
          listing("6fdef409-3e25-4ea6-a008-4001f3e43515", "2026-10-29T12:30:00Z"),
        ],
        [],
      ],
      shops: [{ slug: "alpha", updated_at: new Date("2026-10-01T00:00:00Z") }],
    })
    const now = new Date("2026-11-02T08:00:00Z")
    const { index, files, indexLastmod } = await generateSitemapCache(null, now)
    const entries = new Map(indexEntries(index))

    expect(entries.get("market-0")).toBe("2026-10-29T12:30:00.000Z")
    expect(entries.get("shops-0")).toBe("2026-10-01T00:00:00.000Z")
    // Static URLs carry no lastmod: the file is dated by when it was built.
    expect(entries.get("static-0")).toBe(now.toISOString())
    for (const [key, value] of entries) {
      if (files.has(key)) expect(value).toMatch(W3C_DATETIME)
    }
    expect(indexLastmod).toBe(now.toISOString())
  })

  it("keeps a file's lastmod across rebuilds while its content is unchanged", async () => {
    stubTables({ shops: [{ slug: "alpha", updated_at: new Date("2026-10-01T00:00:00Z") }] })
    const first = await generateSitemapCache(null, new Date("2026-11-01T00:00:00Z"))
    const second = await generateSitemapCache(first, new Date("2026-11-01T06:00:00Z"))
    expect(new Map(indexEntries(second.index)).get("static-0")).toBe("2026-11-01T00:00:00.000Z")

    // Different contractors list: that file's lastmod moves to the rebuild time.
    vi.mocked(contractorDb.getContractorListings).mockResolvedValueOnce([
      { spectrum_id: "SCMARKET" } as never,
    ])
    const third = await generateSitemapCache(second, new Date("2026-11-01T12:00:00Z"))
    const entries = new Map(indexEntries(third.index))
    expect(entries.get("contractors-0")).toBe("2026-11-01T12:00:00.000Z")
    expect(entries.get("static-0")).toBe("2026-11-01T00:00:00.000Z")
  })

  it("serves a failed section's last good copy (with its lastmod) instead of dropping it", async () => {
    stubTables({ shops: [{ slug: "alpha", updated_at: new Date("2026-10-01T00:00:00Z") }] })
    const good = await generateSitemapCache(null, new Date("2026-11-01T00:00:00Z"))

    mockKnex.mockImplementation((table?: string) => {
      if (table === "shops") {
        const chain = createChainMock([])
        chain.then = (_resolve, reject) => reject?.(new Error("statement timeout"))
        return chain
      }
      return createChainMock([])
    })
    const degraded = await generateSitemapCache(good, new Date("2026-11-01T06:00:00Z"))
    expect(new Map(indexEntries(degraded.index)).get("shops-0")).toBe("2026-10-01T00:00:00.000Z")
    expect(gunzipSync(degraded.sitemaps.get("shops-0")!).toString("utf8")).toContain("/shops/alpha</loc>")
    expect(degraded.unavailable.has("shops-0")).toBe(false)
    expect(degraded.ttlMs).toBe(SITEMAP_DEGRADED_TTL_MS)
  })

  it("keeps the last good wiki section when one of its sources fails, so wiki-1 can't vanish", async () => {
    const items = Array.from({ length: 10_001 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `Item ${i}`,
    }))
    stubTables({ game_items: items })
    const good = await generateSitemapCache(null, new Date("2026-11-01T00:00:00Z"))
    expect(good.sitemaps.has("wiki-1")).toBe(true)

    mockKnex.mockImplementation((table?: string) => {
      if (table === "game_items") {
        const chain = createChainMock([])
        chain.then = (_resolve, reject) => reject?.(new Error("statement timeout"))
        return chain
      }
      return createChainMock([])
    })
    const degraded = await generateSitemapCache(good, new Date("2026-11-01T06:00:00Z"))
    expect(indexEntries(degraded.index).map(([key]) => key)).toContain("wiki-1")
    expect(degraded.sitemaps.get("wiki-1")).toEqual(good.sitemaps.get("wiki-1"))
  })

  it("dates game-data wiki URLs by their rows' updated_at", async () => {
    stubTables({
      missions: [{ mission_code: "m1", mission_name: "M", updated_at: new Date("2026-10-30T00:00:00Z") }],
      blueprints: [
        { blueprint_name: "BP_A", updated_at: new Date("2026-10-01T00:00:00Z") },
        { blueprint_name: "BP_A", updated_at: new Date("2026-10-15T00:00:00Z") },
      ],
    })
    const { sitemaps } = await generateSitemapCache()
    const xml = gunzipSync(sitemaps.get("wiki-0")!).toString("utf8")
    expect(xml).toMatch(/\/missions\/m1<\/loc><lastmod>2026-10-30T00:00:00\.000Z<\/lastmod>/)
    expect(xml).toMatch(/\/blueprints\/BP_A<\/loc><lastmod>2026-10-15T00:00:00\.000Z<\/lastmod>/)
  })
})
