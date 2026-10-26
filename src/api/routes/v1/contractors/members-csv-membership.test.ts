import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

/**
 * GET /contractors/:spectrum_id/members/csv had no membership check: any
 * logged-in user could download any org's member list. Only members (and
 * site admins) may export it now.
 */

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: { knex: vi.fn() },
  getKnex: vi.fn(),
}))
vi.mock("../util/permissions.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../util/permissions.js")>()
  return { ...original, is_member: vi.fn() }
})
vi.mock("./database.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./database.js")>()
  return { ...original, getContractorMembersUsernamesAndID: vi.fn() }
})

const contractorDb = await import("./database.js")
const { is_member } = await import("../util/permissions.js")
const { get_spectrum_id_members_csv } = await import("./controller.js")

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}

function csv(user: { user_id: string; role?: string }) {
  const req = {
    contractor: { contractor_id: "org-1", spectrum_id: "TESTORG" },
    user: { username: user.user_id, role: "user", ...user },
  } as unknown as Request
  const res = mockRes()
  return get_spectrum_id_members_csv(req, res, vi.fn()).then(() => res)
}

describe("members CSV export", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(contractorDb.getContractorMembersUsernamesAndID as Mock).mockResolvedValue([
      { username: "alice" },
      { username: "bob" },
    ])
  })

  it("refuses a user who isn't a member", async () => {
    ;(is_member as Mock).mockResolvedValue(false)
    const res = await csv({ user_id: "outsider" })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(contractorDb.getContractorMembersUsernamesAndID).not.toHaveBeenCalled()
  })

  it("exports for a member", async () => {
    ;(is_member as Mock).mockResolvedValue(true)
    const res = await csv({ user_id: "member" })
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith("alice\nbob")
  })

  it("exports for a site admin who isn't a member", async () => {
    ;(is_member as Mock).mockResolvedValue(false)
    const res = await csv({ user_id: "admin", role: "admin" })
    expect(res.json).toHaveBeenCalledWith("alice\nbob")
  })
})
