import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchRSIOrgDirect } from "./scraper.js"
import { SHIN_ORG_PAGE, DEICOMPANY_ORG_PAGE } from "./__fixtures__/org-page.js"

/**
 * These tests used to hit robertsspaceindustries.com for real. That made them
 * fail whenever RSI answered non-2xx from a CI runner — `!result.ok` returns
 * null, so the assertions blew up on a network condition rather than a bug, and
 * because the deploy workflow runs `npm test` before building, a bad response
 * from RSI blocked every backend deploy.
 *
 * Stub fetch against recorded markup instead (see __fixtures__/org-page.ts).
 * This tests what the scraper actually owns — parsing RSI's markup — and leaves
 * RSI's availability out of the deploy path.
 */
function stubFetch(body: string, init: { ok: boolean; status: number }) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: init.ok,
    status: init.status,
    text: async () => body,
  } as Response)
}

describe("fetchRSIOrgDirect", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("requests the org page for the given spectrum id", async () => {
    const fetchSpy = stubFetch(SHIN_ORG_PAGE, { ok: true, status: 200 })

    await fetchRSIOrgDirect("SHIN")

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://robertsspaceindustries.com/orgs/SHIN",
    )
  })

  it("parses an org whose verification code is in the manifesto and charter", async () => {
    stubFetch(SHIN_ORG_PAGE, { ok: true, status: 200 })

    const result = await fetchRSIOrgDirect("SHIN")

    expect(result).not.toBeNull()
    expect(result!.sid).toBe("SHIN")
    expect(result!.name).toBe("Shin")
    expect(result!.members).toBe(33)
    // Assert each tab separately: a `manifesto + charter` check passes even when
    // one of the two selectors is broken, since the other still supplies the code.
    expect(result!.manifesto).toContain("[sc-market.space:")
    expect(result!.charter).toContain("[sc-market.space:")
    expect(result!.history).toContain("Dune Awakening")
    expect(result!.logo).toBe(
      "https://robertsspaceindustries.com/media/3i0ohk9q1nmmlr/logo/SHIN-Logo.png",
    )
    expect(result!.banner).toBe(
      "https://robertsspaceindustries.com/media/420e9238f1804r/banner/SHIN-Banner.jpg",
    )
  })

  it("parses an org whose display name differs from its spectrum id", async () => {
    stubFetch(DEICOMPANY_ORG_PAGE, { ok: true, status: 200 })

    const result = await fetchRSIOrgDirect("DEICOMPANY")

    expect(result).not.toBeNull()
    expect(result!.sid).toBe("DEICOMPANY")
    expect(result!.name).toBe("SC Market")
    expect(result!.members).toBe(10)
    expect(result!.headline).toContain("SC Market")
    expect(result!.history).toContain("marketplace")
    // Empty tabs must come back as "" — callers concatenate these.
    expect(result!.manifesto).toBe("")
    expect(result!.charter).toBe("")
  })

  it("uppercases the spectrum id it reports", async () => {
    stubFetch(SHIN_ORG_PAGE, { ok: true, status: 200 })

    const result = await fetchRSIOrgDirect("shin")

    expect(result!.sid).toBe("SHIN")
  })

  it("returns null for a nonexistent org", async () => {
    stubFetch("<html><body>Not found</body></html>", {
      ok: false,
      status: 404,
    })

    expect(await fetchRSIOrgDirect("ZZZZZZZZZZNOTREAL999")).toBeNull()
  })

  it("returns null when RSI is unavailable", async () => {
    stubFetch("<html><body>Service Unavailable</body></html>", {
      ok: false,
      status: 503,
    })

    expect(await fetchRSIOrgDirect("SHIN")).toBeNull()
  })
})
