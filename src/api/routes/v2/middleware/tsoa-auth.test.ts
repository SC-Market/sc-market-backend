import { describe, it, expect } from "vitest"
import { Request } from "express"
import { expressAuthentication } from "./tsoa-auth.js"

function mockReq(opts: {
  user?: any
  method?: string
  path?: string
  tokenInfo?: any
}): Request {
  const req: any = {
    user: opts.user,
    method: opts.method ?? "GET",
    path: opts.path ?? "/listings",
  }
  if (opts.tokenInfo) req.__tokenInfo = opts.tokenInfo
  return req as Request
}

const adminUser = { user_id: "a", role: "admin", rsi_confirmed: true }
const normalUser = { user_id: "u", role: "user", rsi_confirmed: true }

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
