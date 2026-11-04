import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

/**
 * POST /contractors/auth/link answers with the verified org's details
 * (contractorDetails is async; unawaited, the body was `{ data: {} }`).
 */

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("./database.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./database.js")>()),
  getContractor: vi.fn(),
}))
vi.mock("./helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./helpers.js")>()),
  authorizeContractor: vi.fn(),
}))
vi.mock("../util/formatting.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../util/formatting.js")>()),
  contractorDetails: vi.fn(async (c: { spectrum_id: string }) => ({
    spectrum_id: c.spectrum_id,
    name: "Linked Org",
  })),
}))

const contractorDb = await import("./database.js")
const { authorizeContractor } = await import("./helpers.js")
const { post_auth_link } = await import("./controller.js")

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { json: Mock; status: Mock }
}

beforeEach(() => vi.clearAllMocks())

describe("POST /contractors/auth/link", () => {
  it("answers with the verified org's details", async () => {
    const org = { contractor_id: "c1", spectrum_id: "NEWORG" }
    ;(contractorDb.getContractor as Mock)
      .mockRejectedValueOnce(new Error("not registered yet"))
      .mockResolvedValueOnce(org)
    ;(authorizeContractor as Mock).mockResolvedValue(true)
    const req = {
      user: { user_id: "u1" },
      body: { contractor: "NEWORG" },
    } as unknown as Request
    const res = mockRes()
    await post_auth_link(req, res, vi.fn())
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({
      data: { spectrum_id: "NEWORG", name: "Linked Org" },
    })
  })
})
