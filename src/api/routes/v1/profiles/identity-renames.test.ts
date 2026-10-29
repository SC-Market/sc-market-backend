/**
 * Collision-safe renames and Discord removal on the profile routes:
 * - unlinkProvider("discord") also clears the legacy accounts.discord_id
 *   column (it used to stay set and block the next Discord sign-up);
 * - handle sync never takes a handle another account has (it used to hit
 *   accounts_username_key and fail as an internal error);
 * - the v1 admin unlink route is gone (Admin -> Identity replaces it).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createFakeKnex, type FakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown, member: null as unknown }))

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: {
    get knex() {
      return h.db
    },
  },
}))
vi.mock("../../../../clients/spectrum/index.js", () => ({
  spectrumAPI: { fetchMemberById: async () => h.member },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { createExternalResource: async () => null, getFileLinkResource: async () => null },
}))
// The admin router's rate limiters keep their state in Postgres.
vi.mock("../../../middleware/enhanced-ratelimiting.js", () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next()
  const names = [
    "criticalRateLimit", "writeRateLimit", "readRateLimit", "bulkRateLimit", "notificationRateLimit",
    "commonWriteRateLimit", "listingUpdateRateLimit", "authRefreshLimit", "authInitLimit",
    "authCallbackLimit", "authLogoutLimit", "authSessionsLimit", "dataExportRateLimit",
  ]
  return {
    ...Object.fromEntries(names.map((n) => [n, pass])),
    createRateLimit: () => pass,
    createHourBasedRateLimit: () => pass,
  }
})
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
// updateUser ends in .returning("*"), which the fake doesn't model.
vi.mock("./database.js", async (orig) => ({
  ...(await orig<typeof import("./database.js")>()),
  updateUser: async (where: Record<string, unknown>, values: Record<string, unknown>) =>
    (h.db as FakeKnex)("accounts").where(where).update(values),
}))

import { unlinkProvider } from "./database.js"
import { syncRSIHandle } from "./helpers.js"

const ME = "11111111-2222-4333-8444-555555555555"
let db: FakeKnex

function account(over: Record<string, unknown> = {}) {
  return {
    user_id: ME,
    username: "OldHandle",
    display_name: "OldHandle",
    rsi_confirmed: true,
    spectrum_user_id: "1001",
    discord_id: "900000000000000001",
    discord_access_token: "t",
    discord_refresh_token: "r",
    ...over,
  }
}

beforeEach(() => {
  db = createFakeKnex({
    accounts: [account()],
    account_providers: [
      { user_id: ME, provider_type: "discord", provider_id: "900000000000000001", is_primary: false },
      { user_id: ME, provider_type: "citizenid", provider_id: "cid", is_primary: true },
    ],
  })
  h.db = db
  h.member = null
})

describe("unlinkProvider", () => {
  it("removing Discord clears the legacy discord_id column and tokens", async () => {
    await unlinkProvider(ME, "discord")
    expect(db.tables.account_providers.map((p) => p.provider_type)).toEqual(["citizenid"])
    expect(db.tables.accounts[0]).toMatchObject({ discord_id: null, discord_access_token: "", discord_refresh_token: "" })
  })

  it("removing another provider leaves discord_id alone", async () => {
    db.tables.account_providers[1].is_primary = false
    db.tables.account_providers[0].is_primary = true
    await unlinkProvider(ME, "citizenid")
    expect(db.tables.accounts[0].discord_id).toBe("900000000000000001")
  })
})

describe("syncRSIHandle", () => {
  const member = (nickname: string) => ({
    success: true,
    data: { member: { nickname, displayname: nickname, signature: "", avatar: null } },
  })

  it("refuses a handle that is another account's username, without changing anything", async () => {
    db.tables.accounts.push(account({ user_id: "other", username: "NewHandle", spectrum_user_id: "2002", discord_id: null }))
    h.member = member("NewHandle")
    const out = await syncRSIHandle(ME)
    expect(out.success).toBe(false)
    expect(out.error).toMatch(/username of another SC Market account/)
    expect(db.tables.accounts[0].username).toBe("OldHandle")
  })

  it("takes a free handle", async () => {
    h.member = member("NewHandle")
    expect(await syncRSIHandle(ME)).toEqual({ success: true, error: null })
    expect(db.tables.accounts[0].username).toBe("NewHandle")
  })
})

describe("v1 admin unlink", () => {
  it("POST /api/admin/users/:username/unlink is no longer routed", async () => {
    process.env.B2_KEY_ID ||= "test-key-id"
    process.env.B2_APP_KEY ||= "test-app-key"
    const { adminRouter } = await import("../admin/routes.js")
    const paths = (adminRouter as unknown as { stack: Array<{ route?: { path: string } }> }).stack
      .map((l) => l.route?.path)
      .filter(Boolean)
    expect(paths).toContain("/users")
    expect(paths).not.toContain("/users/:username/unlink")
  })
})

describe("self RSI unlink", () => {
  it("renames to a free placeholder even when new_user<discord id> is taken", async () => {
    db.tables.account_providers.splice(1, 1) // no Citizen iD: self unlink is allowed
    db.tables.accounts.push(account({ user_id: "other", username: "new_user900000000000000001", spectrum_user_id: null, discord_id: null }))
    const { profile_post_auth_unlink } = await import("./controller.js")
    const res = { statusCode: 200, body: undefined as unknown, status(c: number) { this.statusCode = c; return this }, json(b: unknown) { this.body = b; return this } }
    await profile_post_auth_unlink({ user: { ...account() } } as never, res as never, (() => {}) as never)
    const me = db.tables.accounts.find((a) => a.user_id === ME)!
    expect(me).toMatchObject({ rsi_confirmed: false, spectrum_user_id: null })
    expect(me.username).toMatch(/^user_[0-9a-f]{8}$/)
    expect(me.display_name).toBe(me.username)
  })
})
