import { describe, expect, it, vi } from "vitest"

vi.mock("../../clients/database/knex-db.js", () => ({ getKnex: vi.fn() }))

const { decideDirectory, orgMembersOnlySql, shopShownSql } = await import("./directory.js")

const org = {
  kind: "org" as const,
  hidden: false,
  members_only: false,
  verified: true,
  public_listings: 3,
  private_listings: 0,
  active_services: 0,
}

describe("storefront directory decision", () => {
  it("lists a verified org with public listings by default", () => {
    const d = decideDirectory(org)
    expect(d).toMatchObject({ listed: true, reason: "listed", show_in_directory: true, can_change: true })
  })

  it("services alone don't list a storefront", () => {
    expect(decideDirectory({ ...org, public_listings: 0, active_services: 4 }).reason).toBe("no_public_content")
  })

  it("members-only listings alone are not public content", () => {
    const d = decideDirectory({ ...org, public_listings: 0, private_listings: 12 })
    expect(d).toMatchObject({ listed: false, reason: "no_public_content", show_in_directory: true })
  })

  it("members-only orgs are forced off and can't be turned on", () => {
    const d = decideDirectory({ ...org, members_only: true })
    expect(d).toMatchObject({
      listed: false,
      reason: "members_only",
      show_in_directory: false,
      can_change: false,
      members_only: true,
    })
  })

  it("the owners can hide a listed org", () => {
    const d = decideDirectory({ ...org, hidden: true })
    expect(d).toMatchObject({ listed: false, reason: "hidden_by_setting", show_in_directory: false, can_change: true })
  })

  it("never lists an unverified org", () => {
    expect(decideDirectory({ ...org, verified: false }).reason).toBe("not_verified")
  })

  it("personal shops aren't in the directory; org shops follow their org", () => {
    const shop = { ...org, kind: "shop" as const }
    expect(decideDirectory({ ...shop, org_owned: false }).reason).toBe("personal_shop")
    expect(decideDirectory({ ...shop, org_owned: true, org_listed: false }).reason).toBe("org_not_listed")
    expect(decideDirectory({ ...shop, org_owned: true, org_listed: true }).listed).toBe(true)
    expect(decideDirectory({ ...shop, org_owned: true, org_listed: true, members_only: true }).reason).toBe(
      "members_only",
    )
  })

  it("SQL helpers only take code literals", () => {
    expect(orgMembersOnlySql("c")).toContain("c.contractor_id")
    expect(orgMembersOnlySql("c")).toContain("require_membership IS TRUE")
    expect(shopShownSql("s")).toContain("h.shop_id = s.shop_id")
    expect(() => shopShownSql("s; DROP TABLE x")).toThrow()
  })
})
