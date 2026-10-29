import { gunzipSync } from "node:zlib"
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
  then: (
    resolve: (value: SitemapRow[]) => unknown,
    reject?: (reason: Error) => unknown,
  ) => unknown
  [Symbol.iterator]: () => Generator<SitemapRow>
}

function createChainMock(resolveValue: SitemapRow[] = []): ChainMock {
  const chain = {} as ChainMock
  const methods = ["select", "where", "whereNot", "whereNotNull", "groupBy", "limit", "orderBy"] as const
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

const bugsnagNotify = vi.fn()
vi.mock("@bugsnag/js", () => ({ default: { notify: bugsnagNotify } }))

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

import {
  generateSitemapCache,
  getSitemapCache,
  clearSitemapCache,
  SITEMAP_DEGRADED_TTL_MS,
  SITEMAP_TTL_MS,
} from "./sitemap.service.js"

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
