/**
 * A member with only manage_roles could create/edit a role carrying any
 * permission (or assign themselves a lower role that has one) and so take
 * every permission in the org. Grants are now limited to what the actor holds.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: { knex: vi.fn() },
  getKnex: vi.fn(),
}))
vi.mock("./database.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMemberRoles: vi.fn(),
  getContractorRoles: vi.fn(async () => [{ position: 0 }, { position: 1 }]),
  getContractorRole: vi.fn(),
  insertContractorRole: vi.fn(async () => [{ role_id: "new", position: 2 }]),
  updateContractorRole: vi.fn(),
  insertContractorMemberRole: vi.fn(),
}))
vi.mock("../profiles/database.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getUser: vi.fn(async ({ username }: { username: string }) => ({
    user_id: username,
  })),
}))
vi.mock("../util/permissions.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  is_member: vi.fn(async () => true),
  outranks: vi.fn(async () => false),
  can_manage_role: vi.fn(async () => true),
  get_min_position: vi.fn(async () => 1),
}))
vi.mock("../../../../services/audit-log/audit-log.service.js", () => ({
  auditLogService: { record: vi.fn() },
}))

const contractorDb = await import("./database.js")
const {
  post_spectrum_id_roles,
  put_spectrum_id_roles_role_id,
  post_spectrum_id_roles_role_id_members_username,
} = await import("./controller.js")

// The actor's only role: position 1, manage_roles only.
const hrRole = { role_id: "hr", position: 1, manage_roles: true }

function res() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
}
const base = {
  user: { user_id: "hr-user", role: "user" },
  contractor: { contractor_id: "org" },
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(contractorDb.getMemberRoles as Mock).mockResolvedValue([hrRole])
})

describe("manage_roles cannot grant beyond its own permissions", () => {
  it("refuses creating a role with a permission the actor lacks", async () => {
    const r = res()
    await post_spectrum_id_roles(
      {
        ...base,
        body: { name: "x", manage_market: true },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
    expect(contractorDb.insertContractorRole).not.toHaveBeenCalled()
  })

  it("allows creating a role with only the actor's permissions", async () => {
    const r = res()
    await post_spectrum_id_roles(
      {
        ...base,
        body: { name: "x", manage_roles: true },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(contractorDb.insertContractorRole).toHaveBeenCalled()
  })

  it("refuses editing a role to add a permission the actor lacks", async () => {
    ;(contractorDb.getContractorRole as Mock).mockResolvedValue({
      role_id: "r2",
      position: 3,
    })
    const r = res()
    await put_spectrum_id_roles_role_id(
      {
        ...base,
        params: { role_id: "r2" },
        body: { name: "x", position: 3, manage_org_details: true },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
    expect(contractorDb.updateContractorRole).not.toHaveBeenCalled()
  })

  it("answers (403) instead of hanging when moving a role above your own", async () => {
    ;(contractorDb.getContractorRole as Mock).mockResolvedValue({
      role_id: "r2",
      position: 3,
    })
    const r = res()
    await put_spectrum_id_roles_role_id(
      {
        ...base,
        params: { role_id: "r2" },
        body: { name: "x", position: 0 },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
  })

  it("refuses self-assigning a lower role that carries more permissions", async () => {
    ;(contractorDb.getContractorRole as Mock).mockResolvedValue({
      role_id: "market",
      position: 5,
      manage_market: true,
    })
    const r = res()
    await post_spectrum_id_roles_role_id_members_username(
      {
        ...base,
        params: { username: "hr-user", role_id: "market" },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
    expect(contractorDb.insertContractorMemberRole).not.toHaveBeenCalled()
  })
})
