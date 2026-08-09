/**
 * Tests for resolveShortSlug.
 *
 * The behaviour that matters: a `/listings/<short-slug>` URL is rewritten to the
 * full UUID before TSOA routes it, a full UUID is left untouched, and a
 * short-slug that resolves to no row is answered 404 rather than left to fall
 * through — the raw prefix is not a UUID, so reaching a UUID column would make
 * Postgres reject the cast and surface as a 500.
 *
 * getKnex is mocked per test via resetModules + doMock + dynamic import, matching
 * the pattern the feature-flag rollout tests use, because the middleware reads
 * getKnex at call time.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

/** Minimal knex stand-in: whereRaw(...).select(...).first() resolves to `row`. */
function fakeKnex(row: Record<string, string> | null) {
  const calls: { table: string; bindings: unknown[] }[] = []
  const getKnex = () => (table: string) => {
    const builder = {
      _bindings: [] as unknown[],
      whereRaw(_sql: string, bindings: unknown[]) {
        this._bindings = bindings
        return this
      },
      select() {
        return this
      },
      first() {
        calls.push({ table, bindings: this._bindings })
        return Promise.resolve(row)
      },
    }
    return builder
  }
  return { getKnex, calls }
}

async function loadMiddleware(row: Record<string, string> | null) {
  vi.resetModules()
  const { getKnex, calls } = fakeKnex(row)
  vi.doMock("../../../../clients/database/knex-db.js", () => ({ getKnex }))
  const { resolveShortSlug } = await import("./resolve-short-slug.js")
  return { resolveShortSlug, calls }
}

/** Builds an express-ish req/res/next triple recording what the middleware did. */
function harness(path: string) {
  const req = {
    path,
    url: path,
    params: {} as Record<string, string>,
    query: {} as Record<string, unknown>,
    body: {} as Record<string, unknown>,
  } as unknown as Request

  const state = { status: 0 as number, json: null as unknown, nextCalled: false }
  const res = {
    status(code: number) {
      state.status = code
      return this
    },
    json(payload: unknown) {
      state.json = payload
      return this
    },
  } as unknown as Response
  const next = () => {
    state.nextCalled = true
  }
  return { req, res, next, state }
}

beforeEach(() => {
  vi.resetModules()
})

describe("resolveShortSlug — path params", () => {
  it("rewrites a short-slug to the resolved full UUID", async () => {
    const uuid = "19fa2e7e-0356-4fc2-9bb0-f234d3b9457b"
    const { resolveShortSlug } = await loadMiddleware({ listing_id: uuid })
    const { req, res, next, state } = harness("/listings/19fa2e7e--war-medal")

    await resolveShortSlug(req, res, next)

    expect(state.nextCalled).toBe(true)
    expect(state.status).toBe(0)
    expect(req.url).toBe(`/listings/${uuid}`)
  })

  it("leaves a full UUID untouched and never queries", async () => {
    const uuid = "19fa2e7e-0356-4fc2-9bb0-f234d3b9457b"
    const { resolveShortSlug, calls } = await loadMiddleware(null)
    const { req, res, next, state } = harness(`/listings/${uuid}`)

    await resolveShortSlug(req, res, next)

    expect(state.nextCalled).toBe(true)
    expect(req.url).toBe(`/listings/${uuid}`)
    // isFullUuid short-circuits before any DB lookup.
    expect(calls).toHaveLength(0)
  })

  it("answers 404 for a short-slug that resolves to no row", async () => {
    // The regression: the prefix is not a UUID, so falling through to a UUID
    // column produced a 500. It must be a clean 404 instead.
    const { resolveShortSlug } = await loadMiddleware(null)
    const { req, res, next, state } = harness("/listings/230b250f--gone")

    await resolveShortSlug(req, res, next)

    expect(state.nextCalled).toBe(false)
    expect(state.status).toBe(404)
    expect((state.json as { error?: { code?: string } }).error?.code).toBe(
      "NOT_FOUND",
    )
  })

  it("answers 404 for a bare 8-hex prefix that resolves to nothing", async () => {
    const { resolveShortSlug } = await loadMiddleware(null)
    const { req, res, next, state } = harness("/listings/230b250f")

    await resolveShortSlug(req, res, next)

    expect(state.nextCalled).toBe(false)
    expect(state.status).toBe(404)
  })

  it("passes literal sub-routes straight through without a lookup", async () => {
    // `search`, `mine`, etc. classify as isFullUuid, so the middleware must not
    // treat them as slugs — otherwise it would 404 a real endpoint.
    const { resolveShortSlug, calls } = await loadMiddleware(null)
    const { req, res, next, state } = harness("/listings/search")

    await resolveShortSlug(req, res, next)

    expect(state.nextCalled).toBe(true)
    expect(state.status).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it("ignores paths not registered for slug resolution", async () => {
    const { resolveShortSlug } = await loadMiddleware(null)
    const { req, res, next, state } = harness("/health")

    await resolveShortSlug(req, res, next)

    expect(state.nextCalled).toBe(true)
    expect(state.status).toBe(0)
  })
})
