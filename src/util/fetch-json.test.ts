import { describe, expect, it } from "vitest"
import { readJsonResponse, UpstreamResponseError } from "./fetch-json.js"

const html = "<!DOCTYPE html><html><body>Just a moment...</body></html>"

describe("readJsonResponse", () => {
  it("parses a JSON body", async () => {
    const res = new Response(JSON.stringify({ data: [1] }), { headers: { "content-type": "application/json" } })
    expect(await readJsonResponse(res, "Test")).toEqual({ data: [1] })
  })

  it("an HTML page with status 200 is an UpstreamResponseError, not a SyntaxError", async () => {
    const res = new Response(html, { status: 200, headers: { "content-type": "text/html" } })
    const err = await readJsonResponse(res, "RSI starmap").catch((e) => e)
    expect(err).toBeInstanceOf(UpstreamResponseError)
    expect(err.message).toBe("RSI starmap: response is not JSON (HTTP 200, text/html)")
    expect(err.bodyPreview).toContain("<!DOCTYPE html>")
  })

  it("an error status is an UpstreamResponseError even with a JSON body", async () => {
    const res = new Response('{"error":"nope"}', { status: 503, headers: { "content-type": "application/json" } })
    const err = await readJsonResponse(res, "Wiki").catch((e) => e)
    expect(err).toBeInstanceOf(UpstreamResponseError)
    expect(err.status).toBe(503)
  })
})
