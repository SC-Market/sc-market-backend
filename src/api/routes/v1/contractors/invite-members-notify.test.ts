import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

/**
 * Inviting several usernames at once used to notify only the first invitee.
 * The others got no notification, and without it no Join Organization button
 * on the org page. Every invitee must get their own notification.
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

vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: { knex: vi.fn() },
  getKnex: vi.fn(),
}))

vi.mock("./database.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./database.js")>()
  return {
    ...original,
    getContractorRoleLegacy: vi.fn(),
    insertContractorInvites: vi.fn(),
  }
})

vi.mock("../profiles/database.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../profiles/database.js")>()
  return { ...original, findUser: vi.fn() }
})

vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: { createContractorInviteNotification: vi.fn() },
}))

vi.mock("../../../../services/audit-log/audit-log.service.js", () => ({
  auditLogService: { record: vi.fn() },
}))

const contractorDb = await import("./database.js")
const profileDb = await import("../profiles/database.js")
const { notificationService } = await import(
  "../../../../services/notifications/notification.service.js"
)
const { post_spectrum_id_members } = await import("./controller.js")

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
}

function invite(usernames: string[]) {
  return {
    contractor: { contractor_id: "org-1", spectrum_id: "TESTORG" },
    user: { user_id: "inviter", username: "inviter" },
    body: { usernames, message: "hi" },
  } as unknown as Request
}

describe("POST /contractors/:spectrum_id/members (direct invites)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(profileDb.findUser as Mock).mockImplementation(
      async ({ username }: { username: string }) => ({
        user_id: `id-${username}`,
        username,
      }),
    )
    ;(contractorDb.getContractorRoleLegacy as Mock).mockResolvedValue(undefined)
    ;(contractorDb.insertContractorInvites as Mock).mockImplementation(
      async (rows: { user_id: string }[]) =>
        rows.map((r, i) => ({ ...r, invite_id: `inv-${i}` })),
    )
  })

  it("notifies every invitee, not just the first", async () => {
    const res = mockRes()
    await post_spectrum_id_members(invite(["alice", "bob", "carol"]), res, vi.fn())

    const notify = notificationService.createContractorInviteNotification as Mock
    expect(notify).toHaveBeenCalledTimes(3)
    expect(notify.mock.calls.map((c) => c[0].user_id)).toEqual([
      "id-alice",
      "id-bob",
      "id-carol",
    ])
    expect(res.status).not.toHaveBeenCalled()
  })

  it("invites a username listed twice only once", async () => {
    await post_spectrum_id_members(invite(["alice", "alice"]), mockRes(), vi.fn())

    const rows = (contractorDb.insertContractorInvites as Mock).mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(notificationService.createContractorInviteNotification).toHaveBeenCalledTimes(1)
  })

  it("refuses an empty list", async () => {
    const res = mockRes()
    await post_spectrum_id_members(invite([]), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(contractorDb.insertContractorInvites).not.toHaveBeenCalled()
  })

  it("answers 404 NOT_FOUND for an unknown username and invites nobody", async () => {
    ;(profileDb.findUser as Mock).mockImplementation(
      async ({ username }: { username: string }) =>
        username === "ghost" ? null : { user_id: `id-${username}`, username },
    )
    const res = mockRes()
    await post_spectrum_id_members(invite(["alice", "ghost"]), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(404)
    expect((res.json as Mock).mock.calls[0][0].error).toMatchObject({
      code: "NOT_FOUND",
      details: { resource: "User", identifier: "ghost" },
    })
    expect(contractorDb.insertContractorInvites).not.toHaveBeenCalled()
  })

  it("keeps 400 for a user who is already a member", async () => {
    ;(contractorDb.getContractorRoleLegacy as Mock).mockResolvedValue("member")
    const res = mockRes()
    await post_spectrum_id_members(invite(["alice"]), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect((res.json as Mock).mock.calls[0][0].error.code).toBe(
      "VALIDATION_ERROR",
    )
    expect(contractorDb.insertContractorInvites).not.toHaveBeenCalled()
  })
})
