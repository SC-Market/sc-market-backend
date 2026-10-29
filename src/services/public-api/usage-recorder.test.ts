import { describe, it, expect, vi } from "vitest"
import { TokenUsageRecorder, surfaceForPath } from "./usage-recorder.js"

describe("TokenUsageRecorder", () => {
  it("rolls requests up per token, hour and surface, and writes last_used_at once", async () => {
    const raw = vi.fn(() => Promise.resolve({ rows: [] }))
    const updates: Array<{ table: string; id: unknown; values: unknown }> = []
    const db = Object.assign(
      (table: string) => ({
        where: (_c: string, id: unknown) => ({
          update: (values: unknown) => {
            updates.push({ table, id, values })
            return Promise.resolve(1)
          },
        }),
      }),
      { raw },
    )
    const rec = new TokenUsageRecorder(() => db as never)
    const at = new Date("2026-10-29T17:50:10Z")
    rec.record("public", "t1", "u1", "/api/public/v1/me", at)
    rec.record("public", "t1", "u1", "/api/public/v1/shops", at)
    rec.record("legacy", "l1", "u1", "/api/v1/profile", at)
    rec.stop()
    await rec.flush()
    expect(raw).toHaveBeenCalledTimes(2)
    const calls = raw.mock.calls as unknown as Array<[string, unknown[]]>
    const pub = calls.find(([sql]) => sql.includes("public_token_id"))!
    expect(pub[1]).toEqual([
      new Date("2026-10-29T17:00:00Z"),
      "public_v1",
      "t1",
      "u1",
      2,
    ])
    expect(updates.map((u) => [u.table, u.id])).toEqual([
      ["public_api_tokens", "t1"],
      ["api_tokens", "l1"],
    ])
    expect(surfaceForPath("/api/v2/shops")).toBe("v2")
  })
})
