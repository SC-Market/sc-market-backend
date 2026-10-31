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
import {
  generateSitemapCache,
  getSitemapCache,
  clearSitemapCache,
  marketSitemapPages,
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

    // Must not throw — the failing section is swallowed.
    const { index, sitemaps } = await generateSitemapCache()

    const indexXml = gunzipSync(index).toString("utf8")
    // Static section (never fails) is still present…
    expect(sitemaps.has("static-0")).toBe(true)
    expect(indexXml).toContain("sitemap-static-0.xml")
    // …and shops is absent rather than 500-ing the whole index.
    expect(sitemaps.has("shops-0")).toBe(false)

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
          // Anything outside the content routes is ignored.
          { path: "https://evil.example/x", updated: "2026-10-25" },
          { path: "/market/x", updated: "2026-10-25" },
        ],
      }),
    )
    const { index, sitemaps, ttlMs } = await generateSitemapCache()

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://sc-market.space/content/manifest.json")
    expect(gunzipSync(index).toString("utf8")).toContain("sitemap-content-0.xml")
    const xml = gunzipSync(sitemaps.get("content-0")!).toString("utf8")
    expect(xml).toContain("<loc>https://sc-market.space/guides</loc>")
    expect(xml).toContain("<loc>https://sc-market.space/guides/buying/buy-an-item</loc>")
    expect(xml).toContain("<lastmod>2026-10-24")
    expect(xml).toContain("<loc>https://sc-market.space/about</loc>")
    expect(xml).not.toContain("evil.example")
    expect(xml).not.toContain("/market/x")
    expect(ttlMs).toBe(SITEMAP_TTL_MS)
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
    expect(blueprintsQuery.select).toHaveBeenCalledWith("blueprint_name")
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

  it("reports an empty market section to BugSnag instead of silently dropping it", async () => {
    mockKnex.mockImplementation(() => createChainMock([]))
    const { index } = await generateSitemapCache()
    expect(gunzipSync(index).toString("utf8")).not.toContain("sitemap-market-")
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
