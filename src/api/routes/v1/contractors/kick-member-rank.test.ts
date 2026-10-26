import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

/**
 * Members of equal rank could kick each other: the check only blocked kicking
 * someone ranked higher. Now the actor must rank strictly above the target.
 * The owner can kick anyone except themselves.
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
  return {
    ...original,
    getMemberRoles: vi.fn(),
    isContractorOwner: vi.fn(),
    removeContractorMember: vi.fn(),
    removeUserContractorRoles: vi.fn(),
  }
})

vi.mock("../profiles/database.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../profiles/database.js")>()
  return { ...original, getUser: vi.fn() }
})

vi.mock("../../../../services/audit-log/audit-log.service.js", () => ({
  auditLogService: { record: vi.fn() },
}))

const contractorDb = await import("./database.js")
const profileDb = await import("../profiles/database.js")
const { is_member } = await import("../util/permissions.js")
const { delete_spectrum_id_members_username } = await import("./controller.js")
const { canKickMember } = await import("./member-rules.js")

const POSITIONS: Record<string, number[]> = {
  owner: [0],
  admin: [1],
  admin2: [1],
  officer: [5],
  member: [10],
  member2: [10],
}

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
}

async function kick(actor: string, target: string) {
  const req = {
    contractor: { contractor_id: "org-1", spectrum_id: "TESTORG" },
    user: { user_id: actor, username: actor },
    params: { username: target },
  } as unknown as Request
  const res = mockRes()
  await delete_spectrum_id_members_username(req, res, vi.fn())
  return res
}

describe("kick a member", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(profileDb.getUser as Mock).mockImplementation(
      async ({ username }: { username: string }) => ({ user_id: username, username }),
    )
    ;(is_member as Mock).mockResolvedValue(true)
    ;(contractorDb.getMemberRoles as Mock).mockImplementation(
      async (_org: string, user_id: string) =>
        (POSITIONS[user_id] ?? []).map((position) => ({ position })),
    )
    ;(contractorDb.isContractorOwner as Mock).mockImplementation(
      async (user_id: string) => user_id === "owner",
    )
  })

  it("refuses a member of equal rank", async () => {
    const res = await kick("admin", "admin2")
    expect(res.status).toHaveBeenCalledWith(403)
    expect(contractorDb.removeContractorMember).not.toHaveBeenCalled()
  })

  it("refuses kicking someone ranked higher", async () => {
    const res = await kick("officer", "admin")
    expect(res.status).toHaveBeenCalledWith(403)
    expect(contractorDb.removeContractorMember).not.toHaveBeenCalled()
  })

  it("allows kicking someone ranked lower", async () => {
    const res = await kick("officer", "member")
    expect(res.status).not.toHaveBeenCalled()
    expect(contractorDb.removeContractorMember).toHaveBeenCalledWith({
      user_id: "member",
      contractor_id: "org-1",
    })
  })

  it("lets the owner kick anyone else, even an equal-position role", async () => {
    ;(contractorDb.getMemberRoles as Mock).mockImplementation(
      async () => [{ position: 0 }],
    )
    const res = await kick("owner", "admin")
    expect(res.status).not.toHaveBeenCalled()
    expect(contractorDb.removeContractorMember).toHaveBeenCalled()
  })

  it("doesn't let the owner kick themselves", async () => {
    const res = await kick("owner", "owner")
    expect(res.status).toHaveBeenCalledWith(403)
    expect(contractorDb.removeContractorMember).not.toHaveBeenCalled()
  })
})

describe("canKickMember", () => {
  const p = (...positions: number[]) => positions.map((position) => ({ position }))
  it("uses each member's best role", () => {
    expect(
      canKickMember({ actorId: "a", targetId: "b", actorIsOwner: false, actorRoles: p(10, 2), targetRoles: p(3) }),
    ).toBe(true)
    expect(
      canKickMember({ actorId: "a", targetId: "b", actorIsOwner: false, actorRoles: p(3), targetRoles: p(10, 3) }),
    ).toBe(false)
  })
  it("treats an actor with no roles as ranked last", () => {
    expect(
      canKickMember({ actorId: "a", targetId: "b", actorIsOwner: false, actorRoles: [], targetRoles: p(10) }),
    ).toBe(false)
  })
})
