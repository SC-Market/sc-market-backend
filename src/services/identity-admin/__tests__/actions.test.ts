/**
 * The identity actions' effects on an in-memory database
 * (test-utils/fake-knex-tables): what each one changes, the audit row it
 * writes, and what it refuses. A failing audit insert fails the action, so
 * the real transaction rolls the change back. Real SQL (search, detail,
 * login_sessions, notifications) is covered by identity-admin.pg.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Knex } from "knex"
import { createFakeKnex, type FakeKnex } from "../../../test-utils/fake-knex-tables.js"
import {
  fixSpectrum,
  placeholderUsername,
  releaseUsername,
  setAccountActive,
  unlinkDiscord,
} from "../identity-admin.service.js"

const ADMIN = { user_id: "admin-1" }
const T = "11111111-2222-4333-8444-555555555555"
const REASON = "stale holder, ticket 42"

let db: FakeKnex & { raw: ReturnType<typeof vi.fn> }
/** Runs the action "in a transaction" on the fake. */
const run = <R>(fn: (trx: Knex) => Promise<R>) => fn(db as unknown as Knex)

function account(over: Record<string, unknown> = {}) {
  return {
    user_id: T,
    username: "Holder",
    display_name: "holder",
    role: "user",
    rsi_confirmed: true,
    spectrum_user_id: "1001",
    discord_id: "555000111",
    discord_access_token: "old",
    discord_refresh_token: "old",
    banned: false,
    is_test: false,
    is_tombstone: false,
    ...over,
  }
}

function provider(type: string, id: string, over: Record<string, unknown> = {}) {
  return { user_id: T, provider_type: type, provider_id: id, is_primary: false, metadata: null, ...over }
}

function seed(acc = account(), providers: Record<string, unknown>[] = []) {
  db = Object.assign(
    createFakeKnex({
      accounts: [acc],
      account_providers: providers,
      audit_logs: [],
      refresh_tokens: [
        { user_id: T, token_hash: "a" },
        { user_id: "someone-else", token_hash: "b" },
      ],
    }),
    { raw: vi.fn(async () => ({ rows: [] })) },
  )
}

const acc = () => db.tables.accounts.find((a) => a.user_id === T)!
const audits = () => db.tables.audit_logs

async function errorCode(p: Promise<unknown>) {
  try {
    await p
    return "ok"
  } catch (e) {
    return (e as { code?: string }).code
  }
}

beforeEach(() => seed())

describe("refusals shared by every action", () => {
  const all = [
    () => releaseUsername(ADMIN, T, REASON, run),
    () => unlinkDiscord(ADMIN, T, REASON, true, run),
    () => fixSpectrum(ADMIN, T, REASON, { mode: "set", spectrum_user_id: "2002" }, run),
    () => setAccountActive(ADMIN, T, REASON, false, run),
  ]

  it("every action needs a 5-500 character reason", async () => {
    const calls = [
      () => releaseUsername(ADMIN, T, "  no ", run),
      () => unlinkDiscord(ADMIN, T, "", true, run),
      () => fixSpectrum(ADMIN, T, "x".repeat(501), { mode: "clear" }, run),
      () => setAccountActive(ADMIN, T, "    ", true, run),
    ]
    for (const c of calls) expect(await errorCode(c())).toBe("VALIDATION_ERROR")
    expect(audits()).toEqual([])
  })

  it.each(all.map((f, i) => [i, f]))("action %i: unknown account is NOT_FOUND", async (_i, f) => {
    db.tables.accounts.length = 0
    expect(await errorCode(f())).toBe("NOT_FOUND")
  })

  it.each(all.map((f, i) => [i, f]))("action %i: site admins are refused (FORBIDDEN)", async (_i, f) => {
    seed(account({ role: "admin" }))
    expect(await errorCode(f())).toBe("FORBIDDEN")
    expect(acc().username).toBe("Holder")
    expect(audits()).toEqual([])
  })

  it.each(all.map((f, i) => [i, f]))("action %i: test accounts and tombstones are refused (CONFLICT)", async (_i, f) => {
    seed(account({ is_test: true }))
    expect(await errorCode(f())).toBe("CONFLICT")
    seed(account({ is_tombstone: true }))
    expect(await errorCode(f())).toBe("CONFLICT")
    expect(audits()).toEqual([])
  })

  it.each(all.map((f, i) => [i, f]))("action %i: an audit write failure fails the action", async (_i, f) => {
    seed()
    const real = db
    const failing = Object.assign(
      (table: string) => {
        if (table === "audit_logs") {
          return { insert: () => ({ returning: async () => Promise.reject(new Error("audit down")) }) }
        }
        return real(table)
      },
      { tables: real.tables, raw: real.raw },
    )
    db = failing as unknown as typeof db
    await expect(f()).rejects.toThrow("audit down")
  })
})

describe("releaseUsername", () => {
  it("renames to a free placeholder, display name too when it is the handle, and audits it", async () => {
    const out = await releaseUsername(ADMIN, T, REASON, run)
    expect(acc().username).toMatch(/^user_[0-9a-f]{8}$/)
    expect(acc().display_name).toBe(acc().username)
    // Nothing else moves.
    expect(acc().spectrum_user_id).toBe("1001")
    expect(acc().discord_id).toBe("555000111")
    expect(out).toMatchObject({ kind: "username_released", notice: { old_username: "Holder", new_username: acc().username } })
    expect(audits()).toEqual([
      expect.objectContaining({
        audit_log_id: out.audit_log_id,
        action: "identity.username_released",
        actor_id: "admin-1",
        subject_type: "user",
        subject_id: T,
        metadata: {
          reason: REASON,
          before: { username: "Holder", display_name: "holder" },
          after: { username: acc().username, display_name: acc().username },
        },
      }),
    ])
  })

  it("keeps a display name that differs from the handle", async () => {
    seed(account({ display_name: "Captain H" }))
    await releaseUsername(ADMIN, T, REASON, run)
    expect(acc().display_name).toBe("Captain H")
  })

  it("placeholder skips names already taken", async () => {
    db.tables.accounts.push(account({ user_id: "other", username: "user_aaaaaaaa" }))
    const values = ["aaaaaaaa", "bbbbbbbb"]
    expect(await placeholderUsername(db as unknown as Knex, () => values.shift()!)).toBe("user_bbbbbbbb")
  })
})

describe("unlinkDiscord", () => {
  it("deletes the Discord provider, clears the legacy column and tokens, keeps other logins", async () => {
    seed(account(), [
      provider("discord", "555000111", { is_primary: true, metadata: { username: "holder#1" } }),
      provider("citizenid", "cid-1"),
    ])
    const out = await unlinkDiscord(ADMIN, T, REASON, false, run)
    expect(db.tables.account_providers.map((p) => p.provider_type)).toEqual(["citizenid"])
    // The remaining login becomes primary.
    expect(db.tables.account_providers[0].is_primary).toBe(true)
    expect(acc()).toMatchObject({ discord_id: null, discord_access_token: "", discord_refresh_token: "" })
    expect(audits()[0]).toMatchObject({
      audit_log_id: out.audit_log_id,
      action: "identity.discord_unlinked",
      metadata: {
        reason: REASON,
        before: { discord_provider_id: "555000111", discord_username: "holder#1", discord_id_column: "555000111" },
        after: { discord_provider_id: null, discord_id_column: null, left_without_login: false },
      },
    })
  })

  it("refuses to leave the account without a login unless told to", async () => {
    seed(account(), [provider("discord", "555000111", { is_primary: true })])
    expect(await errorCode(unlinkDiscord(ADMIN, T, REASON, false, run))).toBe("CONFLICT")
    expect(db.tables.account_providers).toHaveLength(1)
    expect(audits()).toEqual([])

    await unlinkDiscord(ADMIN, T, REASON, true, run)
    expect(db.tables.account_providers).toEqual([])
    expect(audits()[0].metadata).toMatchObject({ after: { left_without_login: true } })
  })

  it("clears a stale legacy column with no provider", async () => {
    await unlinkDiscord(ADMIN, T, REASON, false, run)
    expect(acc().discord_id).toBeNull()
    expect(audits()[0].metadata).toMatchObject({ before: { discord_provider_id: null, discord_id_column: "555000111" } })
  })

  it("refuses when nothing is linked", async () => {
    seed(account({ discord_id: null }))
    expect(await errorCode(unlinkDiscord(ADMIN, T, REASON, true, run))).toBe("CONFLICT")
  })

  it("never touches another account's Discord", async () => {
    seed(account(), [provider("discord", "555000111"), provider("citizenid", "cid-1")])
    db.tables.account_providers.push({ ...provider("discord", "999"), user_id: "other" })
    await unlinkDiscord(ADMIN, T, REASON, false, run)
    expect(db.tables.account_providers.filter((p) => p.user_id === "other")).toHaveLength(1)
  })
})

describe("fixSpectrum", () => {
  it("clear: removes the id and RSI verification", async () => {
    const out = await fixSpectrum(ADMIN, T, REASON, { mode: "clear" }, run)
    expect(acc()).toMatchObject({ spectrum_user_id: null, rsi_confirmed: false })
    expect(audits()[0]).toMatchObject({
      audit_log_id: out.audit_log_id,
      action: "identity.spectrum_cleared",
      metadata: { before: { spectrum_user_id: "1001", rsi_confirmed: true }, after: { spectrum_user_id: null, rsi_confirmed: false } },
    })
  })

  it("clear: refused while Citizen iD is linked, or when there is nothing to clear", async () => {
    seed(account(), [provider("citizenid", "cid-1")])
    expect(await errorCode(fixSpectrum(ADMIN, T, REASON, { mode: "clear" }, run))).toBe("CONFLICT")
    seed(account({ spectrum_user_id: null, rsi_confirmed: false }))
    expect(await errorCode(fixSpectrum(ADMIN, T, REASON, { mode: "clear" }, run))).toBe("CONFLICT")
    expect(audits()).toEqual([])
  })

  it("set: writes a free id and leaves rsi_confirmed alone", async () => {
    seed(account({ spectrum_user_id: null, rsi_confirmed: true }))
    await fixSpectrum(ADMIN, T, REASON, { mode: "set", spectrum_user_id: "2002" }, run)
    expect(acc()).toMatchObject({ spectrum_user_id: "2002", rsi_confirmed: true })
    expect(audits()[0]).toMatchObject({ action: "identity.spectrum_set" })
  })

  it("set: never moves an id another account holds", async () => {
    db.tables.accounts.push(account({ user_id: "other", username: "Owner", spectrum_user_id: "2002" }))
    const p = fixSpectrum(ADMIN, T, REASON, { mode: "set", spectrum_user_id: "2002" }, run)
    await expect(p).rejects.toMatchObject({ code: "CONFLICT", details: { holder_user_id: "other", holder_username: "Owner" } })
    expect(acc().spectrum_user_id).toBe("1001")
    expect(db.tables.accounts.find((a) => a.user_id === "other")!.spectrum_user_id).toBe("2002")
  })

  it("set: digits only, and not the current value", async () => {
    expect(await errorCode(fixSpectrum(ADMIN, T, REASON, { mode: "set", spectrum_user_id: "12a" }, run))).toBe(
      "VALIDATION_ERROR",
    )
    expect(await errorCode(fixSpectrum(ADMIN, T, REASON, { mode: "set", spectrum_user_id: "1001" }, run))).toBe(
      "CONFLICT",
    )
  })
})

describe("setAccountActive", () => {
  it("deactivate: bans, ends this account's sessions only, audits", async () => {
    const out = await setAccountActive(ADMIN, T, REASON, false, run)
    expect(acc().banned).toBe(true)
    expect(db.tables.refresh_tokens).toEqual([{ user_id: "someone-else", token_hash: "b" }])
    expect(db.raw).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM login_sessions"), [T])
    expect(audits()[0]).toMatchObject({
      audit_log_id: out.audit_log_id,
      action: "identity.account_deactivated",
      metadata: { before: { banned: false }, after: { banned: true, refresh_tokens_revoked: 1 } },
    })
  })

  it("reactivate: unbans", async () => {
    seed(account({ banned: true }))
    const out = await setAccountActive(ADMIN, T, REASON, true, run)
    expect(acc().banned).toBe(false)
    expect(out.kind).toBe("account_reactivated")
    expect(db.raw).not.toHaveBeenCalled()
  })

  it("refuses no-ops and deactivating yourself", async () => {
    expect(await errorCode(setAccountActive(ADMIN, T, REASON, true, run))).toBe("CONFLICT")
    seed(account({ banned: true }))
    expect(await errorCode(setAccountActive(ADMIN, T, REASON, false, run))).toBe("CONFLICT")
    expect(await errorCode(setAccountActive({ user_id: T }, T, REASON, false, run))).toBe("FORBIDDEN")
    expect(audits()).toEqual([])
  })
})
