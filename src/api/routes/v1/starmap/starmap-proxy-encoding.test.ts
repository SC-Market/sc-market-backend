/** The starmap proxy put the raw id in the RSI URL path ("../x", "?a=b"). */
import { describe, it, expect, vi, afterEach } from "vitest"
import { getObject } from "./controller.js"

afterEach(() => vi.unstubAllGlobals())

describe("starmap getObject", () => {
  it("encodes the identifier as a single path segment", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ data: { resultset: [] } }),
    }))
    vi.stubGlobal("fetch", fetchMock)
    await getObject("../../account/settings?x=1")
    const url = (fetchMock.mock.calls[0] as unknown[])[0] as string
    expect(url).toBe(
      "https://robertsspaceindustries.com/api/starmap/celestial-objects/..%2F..%2Faccount%2Fsettings%3Fx%3D1",
    )
  })
})
