import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

/**
 * POST /contractors/:spectrum_id/decline answers in the standard
 * `{ data: ... }` wrapper, like the other v1 routes (it sent a bare
 * `{ result }`).
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
  getContractorInvites: vi.fn(),
  removeContractorInvites: vi.fn(),
}))

const contractorDb = await import("./database.js")
const { post_spectrum_id_decline } = await import("./controller.js")

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { json: Mock; status: Mock }
}

beforeEach(() => vi.clearAllMocks())

describe("POST /contractors/:spectrum_id/decline", () => {
  it("answers in the standard data wrapper", async () => {
    ;(contractorDb.getContractorInvites as Mock).mockResolvedValue([
      { invite_id: "i1" },
    ])
    const req = {
      user: { user_id: "u1" },
      params: { spectrum_id: "ORG" },
      contractor: { contractor_id: "c1" },
    } as unknown as Request
    const res = mockRes()
    await post_spectrum_id_decline(req, res, vi.fn())
    expect(contractorDb.removeContractorInvites).toHaveBeenCalledWith(
      "u1",
      "c1",
    )
    expect(res.json).toHaveBeenCalledWith({ data: { result: "Success" } })
  })
})
