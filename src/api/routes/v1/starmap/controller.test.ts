import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../../logger/logger.js", () => ({ default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

const { starmap_get_search_query } = await import("./controller.js")

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined }
  res.status = (c: number) => ((res.statusCode = c), res)
  res.json = (b: unknown) => ((res.body = b), res)
  return res
}

describe("starmap handlers when RSI answers with HTML", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("answer 502 instead of throwing a JSON SyntaxError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Cloudflare</html>", { status: 200, headers: { "content-type": "text/html" } })))
    const res = fakeRes()
    await starmap_get_search_query({ params: { query: "stanton" } } as any, res, vi.fn())
    expect(res.statusCode).toBe(502)
    expect(JSON.stringify(res.body)).toContain("SERVICE_UNAVAILABLE")
  })

  it("pass the data through on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { hits: 1 } }), { headers: { "content-type": "application/json" } })))
    const res = fakeRes()
    await starmap_get_search_query({ params: { query: "stanton" } } as any, res, vi.fn())
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ hits: 1 })
  })
})
