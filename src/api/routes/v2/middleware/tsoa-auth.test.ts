import { describe, it, expect } from "vitest"
import { Request } from "express"
import { expressAuthentication } from "./tsoa-auth.js"
import type { User } from "../../v1/api-models.js"

/** The __tokenInfo shape the populate-user middleware stashes on the request. */
type RequestTokenInfo = NonNullable<Request["__tokenInfo"]>

function mockReq(opts: {
  user?: Partial<User>
  method?: string
  path?: string
  tokenInfo?: RequestTokenInfo
}): Request {
  const req: Partial<Request> = {
    user: opts.user as User,
    method: opts.method ?? "GET",
    path: opts.path ?? "/listings",
  }
  if (opts.tokenInfo) req.__tokenInfo = opts.tokenInfo
  return req as Request
}

const adminUser: Partial<User> = {
  user_id: "a",
  role: "admin",
  rsi_confirmed: true,
}
const normalUser: Partial<User> = {
  user_id: "u",
  role: "user",
  rsi_confirmed: true,
}

describe("expressAuthentication — admin route role gate", () => {
  it("allows an admin user on an admin route", async () => {
    const user = await expressAuthentication(
      mockReq({ user: adminUser, method: "POST", path: "/admin/imports/x" }),
      "loggedin",
    )
    expect(user).toBe(adminUser)
  })

  it("rejects a non-admin user on an admin route with 403 (session auth)", async () => {
    await expect(
      expressAuthentication(
        mockReq({ user: normalUser, method: "GET", path: "/admin/feature-flags" }),
        "loggedin",
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it("rejects a non-admin user even when the token carries the admin scope", async () => {
    // The exact scenario: user was demoted but the admin-scoped token lives on.
    await expect(
      expressAuthentication(
        mockReq({
          user: normalUser,
          method: "POST",
          path: "/admin/import-game-data",
          tokenInfo: { id: "t", name: "n", scopes: ["admin"] },
        }),
        "loggedin",
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it("does not gate non-admin routes on role", async () => {
    const user = await expressAuthentication(
      mockReq({ user: normalUser, method: "GET", path: "/listings" }),
      "loggedin",
    )
    expect(user).toBe(normalUser)
  })
})
