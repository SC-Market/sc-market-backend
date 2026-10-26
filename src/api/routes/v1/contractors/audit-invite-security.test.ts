import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"
import knexFactory from "knex"

/**
 * - Org audit logs include invite codes (invite.* subject ids), so reading them
 *   needs manage_org_details; any logged-in user used to be able to.
 * - Accepting an invite code must not exceed max_uses: the slot is taken by a
 *   single conditional UPDATE, and a used-up code is refused.
 */

// Every party here is a real account (test-utils/isolation-noop.ts).
vi.mock("../../../../services/test-accounts/isolation.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import("../../../../test-utils/isolation-noop.js")).allPartiesReal,
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))

vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(),
  is_member: vi.fn(),
  can_manage_role: vi.fn(),
  get_min_position: vi.fn(),
  outranks: vi.fn(),
  self_member_role_removal_forbidden: vi.fn(),
}))

vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: {
    knex: vi.fn(() => {
      throw new Error("audit_logs must not be queried")
    }),
  },
  getKnex: vi.fn(),
}))

vi.mock("./database.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./database.js")>()
  return {
    ...original,
    getInviteCodes: vi.fn(),
    getContractor: vi.fn(),
    getContractorRoleLegacy: vi.fn(),
    consumeInviteCode: vi.fn(),
    deleteInviteCodes: vi.fn(),
    removeContractorInvites: vi.fn(),
    insertContractorMember: vi.fn(),
    insertContractorMemberRole: vi.fn(),
  }
})

const { has_permission } = await import("../util/permissions.js")
const contractorDb = await import("./database.js")
const { get_spectrum_id_audit_logs, post_invites_invite_id_accept } =
  await import("./controller.js")

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
}

describe("GET /contractors/:spectrum_id/audit-logs", () => {
  beforeEach(() => vi.clearAllMocks())

  it("refuses a user without manage_org_details before querying", async () => {
    ;(has_permission as Mock).mockResolvedValue(false)
    const req = {
      user: { user_id: "outsider" },
      contractor: { contractor_id: "c1" },
      query: { action: "invite.created" },
    } as unknown as Request
    const res = mockRes()
    await get_spectrum_id_audit_logs(req, res, vi.fn())
    expect(has_permission).toHaveBeenCalledWith(
      "c1",
      "outsider",
      "manage_org_details",
    )
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe("invite code max_uses", () => {
  beforeEach(() => vi.clearAllMocks())

  it("refuses an invite code that is used up and does not add the member", async () => {
    ;(contractorDb.getInviteCodes as Mock).mockResolvedValue([
      { invite_id: "i1", contractor_id: "c1", max_uses: 1, times_used: 1 },
    ])
    ;(contractorDb.getContractor as Mock).mockResolvedValue({
      contractor_id: "c1",
      archived: false,
    })
    ;(contractorDb.getContractorRoleLegacy as Mock).mockResolvedValue(null)
    ;(contractorDb.consumeInviteCode as Mock).mockResolvedValue(null)

    const req = {
      user: { user_id: "u1" },
      params: { invite_id: "i1" },
    } as unknown as Request
    const res = mockRes()
    await post_invites_invite_id_accept(req, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(409)
    expect(contractorDb.insertContractorMember).not.toHaveBeenCalled()
  })

  it("takes the slot with one conditional UPDATE (0 = unlimited)", () => {
    const k = knexFactory({ client: "pg" })
    const sql = contractorDb.consumeInviteCodeQuery(k, "i1", "c1").toSQL().sql
    expect(sql).toMatch(
      /^update "contractor_invite_codes" set "times_used" = times_used \+ 1/,
    )
    expect(sql).toContain('"max_uses" = ?')
    expect(sql).toContain("times_used < max_uses")
    expect(sql).toContain("returning *")
  })
})
