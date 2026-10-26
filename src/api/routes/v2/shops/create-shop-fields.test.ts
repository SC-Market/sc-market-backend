/**
 * Creating an org shop was broken from the Create Shop form: it sent the
 * org's Spectrum ID where the API expects the org's contractor_id, and the API
 * dropped tags, supported languages and "accept custom orders". createShop now
 * stores those fields and answers a validation / not-found error for a bad org id.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

const ORG_ID = "6f1c2c3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f"

const h = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  contractors: new Map<string, { contractor_id: string; archived: boolean; spectrum_id: string }>(),
}))

vi.mock("../../../../clients/database/knex-db.js", () => {
  function builder(table: string) {
    const where: Record<string, unknown> = {}
    const b: any = {
      where(col: string, val: unknown) {
        where[col] = val
        return b
      },
      whereRaw() {
        return b
      },
      async first() {
        if (table === "contractors") return h.contractors.get(where.contractor_id as string)
        return undefined // no shop with this slug yet
      },
      insert(row: Record<string, unknown>) {
        h.inserts.push({ table, row })
        return {
          returning: async () => [{ shop_id: "new-shop", status: "active", ...row }],
        }
      },
    }
    return b
  }
  const knex: any = (table: string) => builder(table)
  knex.fn = { now: () => "now()" }
  knex.raw = () => ({})
  return { getKnex: () => knex, database: { knex } }
})
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../v1/util/permissions.js", () => ({
  has_permission: vi.fn(),
  is_member: vi.fn(),
}))

const { ShopsV2Controller } = await import("./ShopsV2Controller.js")
const { has_permission } = await import("../../v1/util/permissions.js")

function asUser(user_id: string) {
  return { user: { user_id, role: "user" } } as never
}

describe("createShop", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.inserts.length = 0
    h.contractors.clear()
    h.contractors.set(ORG_ID, { contractor_id: ORG_ID, archived: false, spectrum_id: "TESTORG" })
    ;(has_permission as Mock).mockResolvedValue(true)
  })

  it("stores tags, supported languages and accepts_custom_orders", async () => {
    const shop = await new ShopsV2Controller().createShop(asUser("u1"), {
      name: "Org Shop",
      slug: "org-shop",
      contractor_id: ORG_ID,
      tags: ["Mining", "Cargo"],
      supported_languages: ["en", "fr"],
      accepts_custom_orders: true,
    })

    const row = h.inserts.find((i) => i.table === "shops")!.row
    expect(row).toMatchObject({
      owner_contractor_id: ORG_ID,
      owner_user_id: null,
      tags: ["Mining", "Cargo"],
      supported_languages: ["en", "fr"],
      accepts_custom_orders: true,
    })
    expect(has_permission).toHaveBeenCalledWith(ORG_ID, "u1", "manage_market")
    expect(shop.tags).toEqual(["Mining", "Cargo"])
    expect(shop.accepts_custom_orders).toBe(true)
    expect(shop.is_org_owned).toBe(true)
  })

  it("refuses a Spectrum ID in contractor_id with a 400", async () => {
    await expect(
      new ShopsV2Controller().createShop(asUser("u1"), {
        name: "Org Shop",
        slug: "org-shop",
        contractor_id: "TESTORG",
      }),
    ).rejects.toMatchObject({ name: "ValidationError" })
    expect(h.inserts).toHaveLength(0)
  })

  it("answers 404 for an unknown or archived org", async () => {
    h.contractors.set(ORG_ID, { contractor_id: ORG_ID, archived: true, spectrum_id: "TESTORG" })
    await expect(
      new ShopsV2Controller().createShop(asUser("u1"), {
        name: "Org Shop",
        slug: "org-shop",
        contractor_id: ORG_ID,
      }),
    ).rejects.toMatchObject({ name: "NotFoundError" })
    expect(h.inserts).toHaveLength(0)
  })

  it("still needs manage_market in the org", async () => {
    ;(has_permission as Mock).mockResolvedValue(false)
    await expect(
      new ShopsV2Controller().createShop(asUser("u1"), {
        name: "Org Shop",
        slug: "org-shop",
        contractor_id: ORG_ID,
      }),
    ).rejects.toMatchObject({ name: "BusinessLogicError", code: "FORBIDDEN" })
    expect(h.inserts).toHaveLength(0)
  })
})
