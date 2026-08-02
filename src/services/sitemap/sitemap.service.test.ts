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

import {
  generateSitemapCache,
  getSitemapCache,
  clearSitemapCache,
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

describe("getSitemapCache (stale-while-revalidate)", () => {
  beforeEach(() => {
    clearSitemapCache()
    mockKnex.mockImplementation(() => createChainMock([]))
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
