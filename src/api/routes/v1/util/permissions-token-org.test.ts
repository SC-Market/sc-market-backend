/**
 * has_permission / is_member back up the explicit token org checks: for the
 * requester of an API-token request they answer false outside the token's
 * contractor_ids, so an org check deep in a handler can't be passed by a token
 * that wasn't granted the org. Sessions, full tokens, other users and code
 * outside a request see real memberships.
 */

import { describe, it, expect, vi } from "vitest"
import type { Request } from "express"

vi.mock("../contractors/database.js", () => ({
  getMemberRoles: vi.fn(async () => [{ manage_orders: true }]),
  getContractorMembers: vi.fn(async () => [{ user_id: "me" }]),
}))

const { has_permission, is_member, isOrgMemberIgnoringToken } = await import("./permissions.js")
const { withRequestContext } = await import("../../../util/request-context.js")

function tokenReq(contractor_ids: string[], scopes = ["orders:write"]) {
  return {
    user: { user_id: "me", role: "user" },
    __tokenInfo: { id: "t", name: "t", scopes, contractor_ids },
  } as unknown as Request
}
const sessionReq = { user: { user_id: "me", role: "user" } } as unknown as Request

describe("has_permission / is_member with an API token", () => {
  it("answer false for an org the token wasn't granted", async () => {
    await withRequestContext(tokenReq([]), async () => {
      expect(await has_permission("org-1", "me", "manage_orders")).toBe(false)
      expect(await is_member("org-1", "me")).toBe(false)
      // A fact about membership, not the requester acting: unchanged.
      expect(await isOrgMemberIgnoringToken("org-1", "me")).toBe(true)
    })
  })

  it("answer as usual for a granted org and for full tokens", async () => {
    for (const req of [tokenReq(["org-1"]), tokenReq([], ["full"])]) {
      await withRequestContext(req, async () => {
        expect(await has_permission("org-1", "me", "manage_orders")).toBe(true)
        expect(await is_member("org-1", "me")).toBe(true)
      })
    }
  })

  it("leave sessions, other users and background work alone", async () => {
    await withRequestContext(sessionReq, async () => {
      expect(await has_permission("org-1", "me", "manage_orders")).toBe(true)
    })
    await withRequestContext(tokenReq([]), async () => {
      expect(await is_member("org-1", "someone-else")).toBe(true)
    })
    expect(await has_permission("org-1", "me", "manage_orders")).toBe(true)
  })
})
