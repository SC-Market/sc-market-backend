import { gunzipSync } from "node:zlib"
import { createRequire } from "node:module"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createFakeKnex,
  type FakeKnex,
} from "../../test-utils/fake-knex-tables.js"

/**
 * sitemap_file_state keeps each file's last-changed time across restarts.
 * The sitemap's section queries get canned rows (a chainable stub); the state
 * table is an in-memory fake that outlives the simulated restarts.
 */
const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../../api/routes/v1/contractors/database.js", () => ({
  getContractorListings: vi.fn(async () => [{ spectrum_id: "SCMARKET" }]),
}))
vi.mock("../../api/routes/v1/recruiting/database.js", () => ({
  getAllRecruitingPosts: vi.fn(async () => []),
}))
vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.spyOn(
  createRequire(import.meta.url)("@bugsnag/js") as {
    notify: (...args: unknown[]) => void
  },
  "notify",
).mockImplementation(() => {})
vi.stubGlobal(
  "fetch",
  vi.fn(
    async () =>
      new Response(JSON.stringify({ version: 1, pages: [] }), {
        headers: { "content-type": "application/json" },
      }),
  ),
)

import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import {
  clearSitemapCache,
  generateSitemapCache,
  getSitemapCache,
} from "./sitemap.service.js"
import { SITEMAP_FILE_STATE_TABLE } from "./sitemap-file-state.js"

type Row = Record<string, unknown>

/** Every section query resolves to no rows. */
function emptyQuery() {
  const chain: Record<string, unknown> = {}
  for (const m of [
    "select",
    "where",
    "whereNot",
    "whereNotNull",
    "whereExists",
    "groupBy",
    "limit",
    "orderBy",
    "max",
    "first",
    "join",
  ]) {
    chain[m] = () => chain
  }
  chain.then = (resolve: (rows: Row[]) => unknown) => resolve([])
  return chain
}

/** The sitemap's db: the state table is `state`, everything else is empty. */
function sitemapDb(state: FakeKnex) {
  const db = ((table: string) =>
    table === SITEMAP_FILE_STATE_TABLE
      ? state(table)
      : emptyQuery()) as unknown as FakeKnex
  db.transaction = (fn) => fn(db)
  Object.assign(db, { raw: () => ({}) })
  return db
}

function indexLastmods(index: Buffer): Map<string, string> {
  const xml = gunzipSync(index).toString("utf8")
  return new Map(
    [
      ...xml.matchAll(
        /sitemap-([a-z-]+-\d+)\.xml<\/loc><lastmod>([^<]*)<\/lastmod>/g,
      ),
    ].map((m) => [m[1], m[2]]),
  )
}

describe("sitemap_file_state", () => {
  let state: FakeKnex

  beforeEach(() => {
    state = createFakeKnex()
    h.db = sitemapDb(state)
    clearSitemapCache()
  })

  it("keeps a file's last-changed time across a restart", async () => {
    const first = await generateSitemapCache(
      null,
      new Date("2026-11-01T00:00:00Z"),
    )
    expect(indexLastmods(first.index).get("static-0")).toBe(
      "2026-11-01T00:00:00.000Z",
    )
    const row = state.tables[SITEMAP_FILE_STATE_TABLE].find(
      (r) => r.file_key === "static-0",
    )
    expect(row?.content_hash).toMatch(/^[0-9a-f]{64}$/)
    expect((row?.last_changed_at as Date).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    )

    // Restart: no in-memory cache, a day later. The stored time wins.
    clearSitemapCache()
    const afterRestart = await generateSitemapCache(
      null,
      new Date("2026-11-02T00:00:00Z"),
    )
    expect(indexLastmods(afterRestart.index).get("static-0")).toBe(
      "2026-11-01T00:00:00.000Z",
    )
    expect(afterRestart.files.get("static-0")?.lastmod).toBe(
      "2026-11-01T00:00:00.000Z",
    )
    expect(afterRestart.indexLastmod).toBe("2026-11-01T00:00:00.000Z")
  })

  it("doesn't move the time on a rebuild with identical content", async () => {
    await generateSitemapCache(null, new Date("2026-11-01T00:00:00Z"))
    const before = state.tables[SITEMAP_FILE_STATE_TABLE].map((r) => ({ ...r }))
    const rebuilt = await generateSitemapCache(
      null,
      new Date("2026-11-01T06:00:00Z"),
    )
    expect(indexLastmods(rebuilt.index).get("contractors-0")).toBe(
      "2026-11-01T00:00:00.000Z",
    )
    expect(state.tables[SITEMAP_FILE_STATE_TABLE]).toEqual(before)
  })

  it("moves only the changed file's time when its content changes", async () => {
    await generateSitemapCache(null, new Date("2026-11-01T00:00:00Z"))
    vi.mocked(contractorDb.getContractorListings).mockResolvedValueOnce([
      { spectrum_id: "SCMARKET" },
      { spectrum_id: "NEWORG" },
    ] as never)
    clearSitemapCache()
    const changed = await generateSitemapCache(
      null,
      new Date("2026-11-01T12:00:00Z"),
    )
    const lastmods = indexLastmods(changed.index)
    expect(lastmods.get("contractors-0")).toBe("2026-11-01T12:00:00.000Z")
    expect(lastmods.get("static-0")).toBe("2026-11-01T00:00:00.000Z")
    const rows = state.tables[SITEMAP_FILE_STATE_TABLE].filter(
      (r) => r.file_key === "contractors-0",
    )
    expect(rows).toHaveLength(1)
    expect((rows[0].last_changed_at as Date).toISOString()).toBe(
      "2026-11-01T12:00:00.000Z",
    )
  })

  it("getSitemapCache after a restart serves the stored times", async () => {
    await generateSitemapCache(null, new Date("2026-10-30T00:00:00Z"))
    clearSitemapCache()
    const { files } = await getSitemapCache()
    expect(files.get("static-0")?.lastmod).toBe("2026-10-30T00:00:00.000Z")
  })

  it("falls back to this process's previous build when the table can't be read", async () => {
    const good = await generateSitemapCache(
      null,
      new Date("2026-11-01T00:00:00Z"),
    )
    const broken = ((table: string) => {
      if (table === SITEMAP_FILE_STATE_TABLE)
        throw new Error('relation "sitemap_file_state" does not exist')
      return emptyQuery()
    }) as unknown as FakeKnex
    h.db = broken
    const rebuilt = await generateSitemapCache(
      good,
      new Date("2026-11-01T06:00:00Z"),
    )
    expect(indexLastmods(rebuilt.index).get("static-0")).toBe(
      "2026-11-01T00:00:00.000Z",
    )
  })
})
