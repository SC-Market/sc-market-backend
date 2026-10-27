import { describe, expect, it, vi } from "vitest"
import {
  SCMDB_INGEST_LIMITS,
  createScmdbIngestRateLimit,
} from "./ingest-rate-limit.js"

function call(
  limit: ReturnType<typeof createScmdbIngestRateLimit>,
  token: string,
  ip: string,
) {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      this.headers[k] = v
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(b: unknown) {
      this.body = b
      return this
    },
  }
  const next = vi.fn()
  return limit({ params: { token }, ip } as never, res as never, next).then(
    () => ({ res, next }),
  )
}

describe("SCMDB ingest rate limit", () => {
  it("limits each token", async () => {
    const limit = createScmdbIngestRateLimit()
    const { points } = SCMDB_INGEST_LIMITS.perToken
    for (let i = 0; i < points; i++) {
      // Spread over IPs so only the token bucket fills.
      expect(
        (await call(limit, "tok-a", `10.0.${i}.1`)).next,
      ).toHaveBeenCalled()
    }
    const { res, next } = await call(limit, "tok-a", "10.9.9.9")
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(429)
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(0)
    expect(res.body).toMatchObject({ error: { code: "RATE_LIMIT_EXCEEDED" } })
    // Another token is unaffected.
    expect((await call(limit, "tok-b", "10.9.9.9")).next).toHaveBeenCalled()
  })

  it("limits each IP across tokens (token guessing)", async () => {
    const limit = createScmdbIngestRateLimit()
    const { points } = SCMDB_INGEST_LIMITS.perIp
    for (let i = 0; i < points; i++) {
      expect(
        (await call(limit, `guess-${i}`, "203.0.113.7")).next,
      ).toHaveBeenCalled()
    }
    const { res } = await call(limit, "guess-x", "203.0.113.7")
    expect(res.statusCode).toBe(429)
  })
})
