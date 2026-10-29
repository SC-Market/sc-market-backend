/**
 * Sign-up and link conflicts (passport-strategies):
 * - Citizen ID sign-up when the RSI handle or Spectrum ID is already taken:
 *   handled USERNAME_TAKEN / ALREADY_LINKED, never the raw Postgres error.
 * - Account creation runs in ONE transaction (account, Citizen ID link, RSI
 *   fields, Discord link): every write gets the transaction.
 * - Skip-and-tell: a Discord another account holds is never moved; the
 *   account is created (or linked) without it, the skip is recorded and the
 *   user is notified.
 * - Discord sign-up: new_user<id> falls back to a free placeholder when an
 *   older account has it; a stale legacy discord_id elsewhere is left alone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { DiscordClaimKeys, Roles, RSIClaimKeys } from "passport-citizenid"

const h = vi.hoisted(() => ({
  byUsername: null as unknown,
  bySpectrum: null as unknown,
  createError: null as unknown,
  discordHolder: null as string | null,
  ownDiscord: null as unknown,
  usernameTaken: false,
  calls: [] as Array<[string, unknown[]]>,
  notified: [] as unknown[][],
  committed: 0,
  trx: null as unknown,
}))

function rec(name: string, value: unknown = undefined) {
  return async (...args: unknown[]) => {
    h.calls.push([name, args])
    return value
  }
}

vi.mock("../../clients/database/knex-db.js", () => {
  const trxFn = (table: string) => ({
    where: () => ({ first: async () => (table === "account_providers" ? h.ownDiscord : null) }),
  })
  h.trx = trxFn
  return {
    database: { setStrategy: () => {} },
    getKnex: () => ({
      transaction: async (fn: (trx: unknown) => Promise<unknown>) => {
        const out = await fn(trxFn)
        h.committed++
        return out
      },
    }),
  }
})

vi.mock("../routes/v1/profiles/database.js", () => ({
  getUserByProvider: async () => null,
  findUser: async (where: Record<string, string>) =>
    where.username ? h.byUsername : where.spectrum_user_id ? h.bySpectrum : null,
  createUserWithProvider: async (...args: unknown[]) => {
    h.calls.push(["createUserWithProvider", args])
    if (h.createError) throw h.createError
    return { user_id: "new-user" }
  },
  updateUser: rec("updateUser", []),
  linkProvider: rec("linkProvider", {}),
  getUser: async ({ user_id }: { user_id: string }) => ({ user_id }),
  getUserProvider: async () => null,
  getUserProviders: async () => [],
  updateProviderTokens: rec("updateProviderTokens"),
  validateCitizenIDLinking: async () => ({ canLink: true }),
}))

vi.mock("../../services/accounts/identity-links.js", () => ({
  discordHolder: async () => h.discordHolder,
  freeUsername: async (_db: unknown, preferred: string) => (h.usernameTaken ? "user_placeholder" : preferred),
  recordDiscordLinkSkipped: async (...args: unknown[]) => {
    h.calls.push(["recordDiscordLinkSkipped", args])
    return "audit-skip"
  },
}))
vi.mock("../../services/identity-admin/notify.js", () => ({
  notifyIdentityChanged: async (...args: unknown[]) => {
    h.notified.push(args)
  },
}))
vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: { createExternalResource: async () => null } }))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createCitizenIDVerifyCallback, createDiscordStrategy } from "./passport-strategies.js"
import { CitizenIDErrorCodes } from "./auth-helpers.js"

const DISCORD_ID = "900000000000000001"
const profile = (withDiscord = true) => ({
  id: "cid-sub",
  roles: [Roles.STATUS_VERIFIED],
  rsi: { [RSIClaimKeys.USERNAME]: "Handle", [RSIClaimKeys.SPECTRUM_ID]: "1001" },
  ...(withDiscord
    ? { discord: { [DiscordClaimKeys.ACCOUNT_ID]: DISCORD_ID, [DiscordClaimKeys.USERNAME]: "handle#1" } }
    : {}),
})

type Done = { error: (Error & { code?: string }) | null; user: unknown }

function run(linking: boolean, withDiscord = true, user?: object): Promise<Done> {
  const verify = createCitizenIDVerifyCallback(linking)
  const req = { session: { citizenid_auth_action: "signup" }, language: "en", user }
  return new Promise((resolve) => {
    void verify(req as never, "at", "rt", profile(withDiscord) as never, ((error: Error | null, u: unknown) =>
      resolve({ error: error as Done["error"], user: u })) as never)
  })
}
const signUp = (withDiscord = true) => run(false, withDiscord)

const names = () => h.calls.map(([n]) => n)
const callsTo = (name: string) => h.calls.filter(([n]) => n === name).map(([, a]) => a)
const providerTypes = () => callsTo("linkProvider").map((a) => (a[1] as { provider_type: string }).provider_type)

beforeEach(() => {
  h.byUsername = null
  h.bySpectrum = null
  h.createError = null
  h.discordHolder = null
  h.ownDiscord = null
  h.usernameTaken = false
  h.calls.length = 0
  h.notified.length = 0
  h.committed = 0
})

describe("Citizen ID sign-up conflicts", () => {
  it("an unverified holder of the handle is USERNAME_TAKEN, not a database error", async () => {
    h.byUsername = { user_id: "holder", rsi_confirmed: false }
    const { error } = await signUp()
    expect(error?.code).toBe(CitizenIDErrorCodes.USERNAME_TAKEN)
    expect(names()).not.toContain("createUserWithProvider")
  })

  it("a verified holder is USERNAME_TAKEN, as before", async () => {
    h.byUsername = { user_id: "holder", rsi_confirmed: true }
    expect((await signUp()).error?.code).toBe(CitizenIDErrorCodes.USERNAME_TAKEN)
  })

  it("a Spectrum ID held elsewhere is ALREADY_LINKED, as before", async () => {
    h.bySpectrum = { user_id: "holder" }
    expect((await signUp()).error?.code).toBe(CitizenIDErrorCodes.ALREADY_LINKED)
  })

  it("a race on accounts_username_key maps to USERNAME_TAKEN", async () => {
    h.createError = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "accounts_username_key" })
    const { error } = await signUp()
    expect(error?.code).toBe(CitizenIDErrorCodes.USERNAME_TAKEN)
    expect(error?.message).not.toContain("duplicate key")
  })

  it("a race on accounts_spectrum_user_id_unique maps to ALREADY_LINKED", async () => {
    h.createError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "accounts_spectrum_user_id_unique",
    })
    expect((await signUp()).error?.code).toBe(CitizenIDErrorCodes.ALREADY_LINKED)
  })

  it("other database errors still fail the login, and nothing commits", async () => {
    h.createError = Object.assign(new Error("boom"), { code: "57014", constraint: "x" })
    const { error } = await signUp()
    expect(error?.message).toBe("boom")
    expect(h.committed).toBe(0)
  })
})

describe("Citizen ID sign-up: one transaction, Discord skip-and-tell", () => {
  it("creates the account, its RSI fields and the Discord link in one transaction", async () => {
    const { error, user } = await signUp()
    expect(error).toBeNull()
    expect(user).toEqual({ user_id: "new-user" })
    expect(h.committed).toBe(1)
    // Every write got the transaction.
    expect(callsTo("createUserWithProvider")[0][2]).toBe(h.trx)
    for (const args of callsTo("updateUser")) expect(args[2]).toBe(h.trx)
    for (const args of callsTo("linkProvider")) expect(args[2]).toBe(h.trx)
    expect(providerTypes()).toEqual(["discord"])
    expect(callsTo("updateUser").map((a) => a[1])).toEqual([
      { rsi_confirmed: true, spectrum_user_id: "1001" },
      { discord_id: DISCORD_ID },
    ])
    expect(h.notified).toEqual([])
  })

  it("a Discord held by another account is not moved: account created without it, user told", async () => {
    h.discordHolder = "someone-else"
    const { error, user } = await signUp()
    expect(error).toBeNull()
    expect(user).toEqual({ user_id: "new-user" })
    expect(callsTo("linkProvider")).toEqual([])
    expect(callsTo("updateUser").map((a) => a[1])).toEqual([{ rsi_confirmed: true, spectrum_user_id: "1001" }])
    expect(callsTo("recordDiscordLinkSkipped")[0].slice(1)).toEqual(["new-user", DISCORD_ID, "citizenid_signup"])
    expect(h.notified).toEqual([
      ["new-user", null, { audit_log_id: "audit-skip", kind: "discord_link_skipped", notice: {} }],
    ])
  })

  it("no Discord from Citizen ID: nothing to link", async () => {
    await signUp(false)
    expect(callsTo("linkProvider")).toEqual([])
    expect(names()).not.toContain("recordDiscordLinkSkipped")
  })
})

describe("Citizen ID link: Discord skip-and-tell", () => {
  const me = { user_id: "me", rsi_confirmed: false }

  it("links Citizen ID and Discord in one transaction", async () => {
    const { error } = await run(true, true, me)
    expect(error).toBeNull()
    expect(h.committed).toBe(1)
    expect(callsTo("linkProvider").map((a) => [(a[1] as { provider_type: string }).provider_type, a[2] === h.trx])).toEqual([
      ["citizenid", true],
      ["discord", true],
    ])
  })

  it("a Discord held elsewhere is skipped and the user told", async () => {
    h.discordHolder = "someone-else"
    const { error } = await run(true, true, me)
    expect(error).toBeNull()
    expect(providerTypes()).toEqual(["citizenid"])
    expect(h.notified[0]).toEqual(["me", null, expect.objectContaining({ kind: "discord_link_skipped" })])
  })

  it("an account that already has a Discord keeps it", async () => {
    h.ownDiscord = { provider_id: "111" }
    await run(true, true, me)
    expect(providerTypes()).toEqual(["citizenid"])
    expect(h.notified).toEqual([])
  })
})

describe("Discord sign-up", () => {
  type Verify = (req: unknown, at: string, rt: string, p: unknown, cb: (e: unknown, u?: unknown) => void) => void
  const verify = () =>
    (createDiscordStrategy(new URL("https://api.test/")) as unknown as { _verify: Verify })._verify

  function discordSignUp(): Promise<{ error: unknown; user: unknown }> {
    return new Promise((resolve) =>
      verify()(
        { session: { discord_auth_action: "signup" }, language: "en" },
        "at",
        "rt",
        { id: DISCORD_ID, username: "d", discriminator: "0" },
        (error, user) => resolve({ error, user }),
      ),
    )
  }

  it("creates the account in one transaction as new_user<id> with the legacy column", async () => {
    const { error } = await discordSignUp()
    expect(error).toBeNull()
    expect(h.committed).toBe(1)
    const [data, , trx] = callsTo("createUserWithProvider")[0] as [{ metadata: { username: string } }, string, unknown]
    expect(data.metadata.username).toBe(`new_user${DISCORD_ID}`)
    expect(trx).toBe(h.trx)
    expect(callsTo("updateUser")).toEqual([[{ user_id: "new-user" }, { discord_id: DISCORD_ID }, h.trx]])
  })

  it("falls back to a free placeholder when new_user<id> is taken", async () => {
    h.usernameTaken = true
    await discordSignUp()
    const [data] = callsTo("createUserWithProvider")[0] as [{ metadata: { username: string } }]
    expect(data.metadata.username).toBe("user_placeholder")
  })

  it("leaves a stale legacy discord_id on another account alone", async () => {
    h.discordHolder = "stale-account"
    const { error } = await discordSignUp()
    expect(error).toBeNull()
    expect(callsTo("updateUser")).toEqual([])
  })
})
