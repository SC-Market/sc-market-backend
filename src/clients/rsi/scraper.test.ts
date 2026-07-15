import { describe, it, expect } from "vitest"
import { fetchRSIOrgDirect } from "./scraper.js"

describe("fetchRSIOrgDirect", () => {
  it("should fetch and parse SHIN org page", async () => {
    const result = await fetchRSIOrgDirect("SHIN")

    expect(result).not.toBeNull()
    expect(result!.sid).toBe("SHIN")
    expect(result!.name).toBeTruthy()
    expect(result!.members).toBeGreaterThan(0)
    expect(result!.manifesto + result!.charter).toContain("[sc-market.space:")
  }, 15000)

  it("should fetch and parse DEICOMPANY org page", async () => {
    const result = await fetchRSIOrgDirect("DEICOMPANY")

    expect(result).not.toBeNull()
    expect(result!.sid).toBe("DEICOMPANY")
    expect(result!.name).toBe("SC Market")
    expect(result!.members).toBeGreaterThan(0)
    expect(result!.headline).toContain("SC Market")
  }, 15000)

  it("should return null for nonexistent org", async () => {
    const result = await fetchRSIOrgDirect("ZZZZZZZZZZNOTREAL999")
    expect(result).toBeNull()
  }, 15000)
})
