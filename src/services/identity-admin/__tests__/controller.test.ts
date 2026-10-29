/**
 * AdminIdentityController authorization (the v2 *Controller*.test.ts glob is
 * excluded from vitest, so this lives with the service): admin only, strict
 * two-factor step-up on every change (whatever ADMIN_MFA_ENFORCE says),
 * 403 otherwise, browser sessions only, and the user is notified after a
 * change. The service and MFA state are faked; the actions' own effects are
 * in actions.test.ts and identity-admin.pg.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request } from "express"

const h = vi.hoisted(() => ({
  enrolled: true,
  calls: [] as Array<[string, unknown[]]>,
  notified: [] as unknown[][],
}))

vi.mock("../../mfa/instance.js", () => ({
  getMfaService: () => ({
    isEnrolled: async () => h.enrolled,
    mfaChangedAt: async () => null,
  }),
}))

vi.mock("../identity-admin.service.js", async (orig) => {
  const real = await orig<typeof import("../identity-admin.service.js")>()
  const record =
    (name: string, kind: string) =>
    async (...args: unknown[]) => {
      h.calls.push([name, args])
      return { audit_log_id: "audit-1", kind, notice: {} }
    }
  return {
    ...real,
    searchIdentities: async (q: string) => {
      h.calls.push(["search", [q]])
      return []
    },
    getIdentityDetail: async (id: string) => ({ user_id: id }),
    releaseUsername: record("releaseUsername", "username_released"),
    unlinkDiscord: record("unlinkDiscord", "discord_unlinked"),
    fixSpectrum: record("fixSpectrum", "spectrum_cleared"),
    setAccountActive: record("setAccountActive", "account_deactivated"),
  }
})

vi.mock("../notify.js", () => ({
  notifyIdentityChanged: async (...args: unknown[]) => {
    h.notified.push(args)
  },
}))

import { AdminIdentityController } from "../../../api/routes/v2/admin/AdminIdentityController.js"
import { expressAuthentication } from "../../../api/routes/v2/middleware/tsoa-auth.js"

const TARGET = "11111111-2222-4333-8444-555555555555"
const admin = { user_id: "a1", role: "admin", username: "boss", banned: false }
const user = { user_id: "u1", role: "user", username: "pleb", banned: false }
const now = () => Date.now() / 1000

function req(u: object, auth: object, extra: object = {}) {
  return { user: u, auth, headers: {}, ip: "127.0.0.1", path: "/admin/identity/users", ...extra } as unknown as Request
}
const fresh = (u: object = admin) => req(u, { method: "jwt", sid: "s", mfaAt: now() - 60 })
const stale = (u: object = admin) => req(u, { method: "jwt", sid: "s", mfaAt: now() - 3600 })

async function code(p: Promise<unknown>) {
  try {
    await p
    return "ok"
  } catch (e) {
    return (e as { code?: string }).code ?? (e as { status?: number }).status
  }
}

const body = { reason: "stale holder, see ticket 42" }

/** Every change endpoint, called on a fresh controller. */
const ACTIONS: Array<[string, (r: Request) => Promise<unknown>]> = [
  ["release-username", (r) => new AdminIdentityController().releaseIdentityUsername(r, TARGET, body)],
  ["unlink-discord", (r) => new AdminIdentityController().unlinkIdentityDiscord(r, TARGET, body)],
  ["spectrum", (r) => new AdminIdentityController().fixIdentitySpectrum(r, TARGET, { ...body, mode: "clear" })],
  ["deactivate", (r) => new AdminIdentityController().deactivateIdentityUser(r, TARGET, body)],
  ["reactivate", (r) => new AdminIdentityController().reactivateIdentityUser(r, TARGET, body)],
]

beforeEach(() => {
  h.enrolled = true
  h.calls.length = 0
  h.notified.length = 0
  // Strict step-up holds even with enforcement off.
  process.env.ADMIN_MFA_ENFORCE = "false"
  process.env.MFA_ENC_KEYS = JSON.stringify({ k: Buffer.alloc(32, 1).toString("base64") })
})

describe("AdminIdentityController: reads", () => {
  it("non-admins get 403 on search and detail", async () => {
    expect(await code(new AdminIdentityController().searchIdentityUsers(fresh(user), "bob"))).toBe("FORBIDDEN")
    expect(await code(new AdminIdentityController().getIdentityUser(fresh(user), TARGET))).toBe("FORBIDDEN")
    expect(h.calls).toEqual([])
  })

  it("an admin held back by MFA gets the MFA error, not a bare 403", async () => {
    const masked = req({ ...admin, role: "user" }, { method: "jwt", sid: "s" }, { adminLocked: "mfa_required" })
    expect(await code(new AdminIdentityController().searchIdentityUsers(masked, "bob"))).toBe("MFA_REQUIRED")
  })

  it("admins can search and read without a step-up", async () => {
    await expect(new AdminIdentityController().searchIdentityUsers(stale(), "bob")).resolves.toEqual({ users: [] })
    await expect(new AdminIdentityController().getIdentityUser(stale(), TARGET)).resolves.toEqual({ user_id: TARGET })
  })

  it("a malformed user id is a 404 before any query", async () => {
    expect(await code(new AdminIdentityController().getIdentityUser(fresh(), "not-a-uuid"))).toBe("NOT_FOUND")
  })
})

describe("AdminIdentityController: changes", () => {
  it.each(ACTIONS)("%s: non-admins get 403 and nothing runs", async (_name, call) => {
    expect(await code(call(fresh(user)))).toBe("FORBIDDEN")
    expect(h.calls).toEqual([])
    expect(h.notified).toEqual([])
  })

  it.each(ACTIONS)("%s: an admin without a fresh step-up gets MFA_STEP_UP_REQUIRED", async (_name, call) => {
    expect(await code(call(stale()))).toBe("MFA_STEP_UP_REQUIRED")
    expect(await code(call(req(admin, { method: "jwt", sid: "s" })))).toBe("MFA_STEP_UP_REQUIRED")
    expect(h.calls).toEqual([])
  })

  it.each(ACTIONS)("%s: an admin with no authenticator must enrol first", async (_name, call) => {
    h.enrolled = false
    expect(await code(call(fresh()))).toBe("MFA_ENROLLMENT_REQUIRED")
    expect(h.calls).toEqual([])
  })

  it.each(ACTIONS)("%s: refused when the server has no MFA key", async (_name, call) => {
    delete process.env.MFA_ENC_KEYS
    expect(await code(call(fresh()))).toBe("MFA_NOT_CONFIGURED")
    expect(h.calls).toEqual([])
  })

  it.each(ACTIONS)("%s: an API token can never step up", async (_name, call) => {
    expect(await code(call(req(admin, { method: "token", tokenMfaAt: new Date(), tokenScopes: ["admin"] })))).toBe(
      "MFA_STEP_UP_REQUIRED",
    )
  })

  it.each(ACTIONS)("%s: a stepped-up admin runs it, gets the audit id and the user is notified", async (_name, call) => {
    const out = (await call(fresh())) as { audit_log_id: string; user: { user_id: string } }
    expect(out.audit_log_id).toBe("audit-1")
    expect(out.user.user_id).toBe(TARGET)
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0][1].slice(0, 3)).toEqual([{ user_id: "a1" }, TARGET, body.reason])
    expect(h.notified).toEqual([[TARGET, "a1", expect.objectContaining({ audit_log_id: "audit-1" })]])
  })

  it("passes each action's own arguments through", async () => {
    await new AdminIdentityController().unlinkIdentityDiscord(fresh(), TARGET, { ...body, allow_no_login: true })
    await new AdminIdentityController().fixIdentitySpectrum(fresh(), TARGET, { ...body, mode: "set", spectrum_user_id: "123" })
    await new AdminIdentityController().deactivateIdentityUser(fresh(), TARGET, body)
    await new AdminIdentityController().reactivateIdentityUser(fresh(), TARGET, body)
    expect(h.calls.map(([n, a]) => [n, a[3]])).toEqual([
      ["unlinkDiscord", true],
      ["fixSpectrum", { mode: "set", spectrum_user_id: "123" }],
      ["setAccountActive", false],
      ["setAccountActive", true],
    ])
  })

  it("spectrum set without an id is a validation error", async () => {
    expect(await code(new AdminIdentityController().fixIdentitySpectrum(fresh(), TARGET, { ...body, mode: "set" }))).toBe(
      "VALIDATION_ERROR",
    )
  })
})

describe("tsoa-auth gate for /admin/identity", () => {
  const path = "/admin/identity/users/" + TARGET + "/deactivate"

  it("refuses non-admins with 403", async () => {
    expect(await code(expressAuthentication(req(user, { method: "jwt" }, { path, method: "POST" }), "loggedin"))).toBe(
      403,
    )
  })

  it("refuses API tokens, even an admin's", async () => {
    const tokenReq = req(admin, { method: "token" }, {
      path,
      method: "POST",
      __tokenInfo: { id: "t", name: "t", scopes: ["admin"], expires_at: null, contractor_ids: [] },
    })
    expect(await code(expressAuthentication(tokenReq, "loggedin"))).toBe(403)
  })

  it("lets an admin's browser session through", async () => {
    await expect(expressAuthentication(req(admin, { method: "jwt" }, { path, method: "POST" }), "loggedin")).resolves.toMatchObject({
      user_id: "a1",
    })
  })
})
