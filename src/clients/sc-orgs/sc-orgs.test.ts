import { describe, expect, it, vi } from "vitest"

vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { ScOrgsClient, communityUrlFrom } = await import("./sc-orgs.js")

const org = (sid: string) => ({ data: { sid, name: "Bird INC" } })

describe("SC Orgs community lookup", () => {
  it("links an org SC Orgs has, by its own SID", async () => {
    const fetchOrg = vi.fn(async () => ({ status: 200, body: org("BIRDINC") }))
    const client = new ScOrgsClient(fetchOrg)
    expect(await client.communityUrl("BIRDINC")).toBe(
      "https://sc-orgs.space/communities/BIRDINC",
    )
    expect(fetchOrg).toHaveBeenCalledWith(
      "https://api.sc-orgs.space/api/v1/orgs/BIRDINC",
    )
  })

  it("caches answers, including not found", async () => {
    const fetchOrg = vi.fn(async () => ({ status: 404, body: null }))
    const client = new ScOrgsClient(fetchOrg)
    expect(await client.communityUrl("NOPE")).toBeNull()
    expect(await client.communityUrl("nope")).toBeNull()
    expect(fetchOrg).toHaveBeenCalledTimes(1)
  })

  it("fails open: a timeout, 5xx or 429 is no link, never an error", async () => {
    for (const fetchOrg of [
      vi.fn(async () => {
        throw new Error("timeout")
      }),
      vi.fn(async () => ({ status: 503, body: null })),
      vi.fn(async () => ({ status: 429, body: null })),
    ]) {
      expect(await new ScOrgsClient(fetchOrg).communityUrl("BIRDINC")).toBeNull()
    }
  })

  it("never asks about ids that aren't spectrum IDs", async () => {
    const fetchOrg = vi.fn()
    const client = new ScOrgsClient(fetchOrg)
    expect(await client.communityUrl("../admin")).toBeNull()
    expect(await client.communityUrl("")).toBeNull()
    expect(fetchOrg).not.toHaveBeenCalled()
  })

  it("ignores an answer for another org or a malformed body", () => {
    expect(communityUrlFrom("BIRDINC", org("OTHER"))).toBeNull()
    expect(communityUrlFrom("BIRDINC", { data: null })).toBeNull()
    expect(communityUrlFrom("BIRDINC", "<html>")).toBeNull()
    expect(communityUrlFrom("birdinc", org("BIRDINC"))).toBe(
      "https://sc-orgs.space/communities/BIRDINC",
    )
  })
})
