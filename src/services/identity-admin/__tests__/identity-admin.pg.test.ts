/**
 * Admin identity tool against the FULL schema in a real, throwaway Postgres:
 * search and detail SQL, each action in a real transaction with its audit
 * row, rollback when the audit write fails, login_sessions cleanup, the
 * unique constraints, the user's in-app notification (without the reason)
 * and the migration's idempotence.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database:
 *   PG_TEST_URL='postgres://postgres@localhost/postgres?host=/tmp/pg' npx vitest run src/services/identity-admin/__tests__/identity-admin.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../test-utils/full-schema.js"

const DB = "pgtest_identity_admin"
const state: { db: Knex | null } = { db: null }

vi.mock("../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: async () => null, createExternalResource: async () => null },
}))
vi.mock("../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const svc = await import("../identity-admin.service.js")
const { notifyIdentityChanged } = await import("../notify.js")
const { setAdaptersForTesting } = await import("../../notify/dispatcher.js")
const { getEntityByType } = await import("../../../api/routes/v1/notifications/database.js")
const migration = await import("../../../../migrations/20261029000000_account_identity_notification.js")

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const ADMIN = { user_id: id(1) }
const HOLDER = id(2)
const OTHER = id(3)
const LONE = id(4)
const REASON = "stale holder, see ticket 42"
const pushes: unknown[] = []

async function code(p: Promise<unknown>) {
  try {
    await p
    return "ok"
  } catch (e) {
    return (e as { code?: string }).code
  }
}

describe.skipIf(!PG_TEST_URL)("admin identity tool (Postgres)", () => {
  let db: Knex

  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 4 } })
    db = state.db
    await db("accounts").insert([
      { user_id: ADMIN.user_id, username: "pgi_admin", display_name: "Admin", role: "admin" },
      {
        user_id: HOLDER,
        username: "StaleHandle",
        display_name: "StaleHandle",
        rsi_confirmed: true,
        spectrum_user_id: "7001",
        discord_id: "900000000000000001",
      },
      { user_id: OTHER, username: "stalehandle", display_name: "Case Twin", spectrum_user_id: "7002" },
      { user_id: LONE, username: "pgi_lone", display_name: "Lone", discord_id: "900000000000000099" },
    ])
    await db("account_providers").insert([
      {
        user_id: HOLDER,
        provider_type: "discord",
        provider_id: "900000000000000001",
        is_primary: true,
        metadata: { username: "stale#1" },
      },
      { user_id: HOLDER, provider_type: "citizenid", provider_id: "cid-holder", is_primary: false },
      { user_id: LONE, provider_type: "discord", provider_id: "900000000000000004", is_primary: true },
    ])
    await db("refresh_tokens").insert([
      { user_id: HOLDER, token_hash: "h".repeat(64), expires_at: new Date(Date.now() + 86400e3), user_agent: "UA-1" },
      { user_id: OTHER, token_hash: "o".repeat(64), expires_at: new Date(Date.now() + 86400e3) },
    ])
    await db("login_sessions").insert([
      { sid: "s-holder", sess: JSON.stringify({ passport: { user: HOLDER } }), expire: new Date(Date.now() + 86400e3) },
      { sid: "s-other", sess: JSON.stringify({ passport: { user: OTHER } }), expire: new Date(Date.now() + 86400e3) },
    ])
    setAdaptersForTesting({
      push: {
        id: "push",
        send: async (msg: unknown) => {
          pushes.push(msg)
          return { status: "sent" }
        },
      } as never,
    })
  }, 300_000)

  afterAll(async () => {
    setAdaptersForTesting(null)
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("migration is idempotent", async () => {
    await db.transaction((trx) => migration.up(trx))
    const rows = await db("notification_actions").where({ action: "account_identity_changed" })
    expect(rows).toHaveLength(1)
    expect(rows[0].entity).toBe("audit_logs")
  })

  it("search: username prefix (any case), display name, Discord id (provider or column), Spectrum id, user id", async () => {
    const ids = async (q: string) => (await svc.searchIdentities(q)).map((r) => r.user_id).sort()
    expect(await ids("stale")).toEqual([HOLDER, OTHER].sort())
    expect(await ids("case tw")).toEqual([OTHER])
    expect(await ids("900000000000000001")).toEqual([HOLDER])
    expect(await ids("900000000000000099")).toEqual([LONE])
    expect(await ids("7002")).toEqual([OTHER])
    expect(await ids(LONE)).toEqual([LONE])
    // LIKE wildcards are literal.
    expect(await ids("%%")).toEqual([])
    const [row] = await svc.searchIdentities("900000000000000001")
    expect(row).toMatchObject({ discord_provider_id: "900000000000000001", discord_id_column: "900000000000000001" })
  })

  it("detail: providers, sessions, case twins, stale legacy Discord column", async () => {
    const d = await svc.getIdentityDetail(HOLDER)
    expect(d.providers.map((p) => [p.provider_type, p.provider_username]).sort()).toEqual([
      ["citizenid", null],
      ["discord", "stale#1"],
    ])
    expect(d.sessions).toEqual([expect.objectContaining({ user_agent: "UA-1" })])
    expect(d.username_twins).toEqual([{ user_id: OTHER, username: "stalehandle" }])
    expect(d.discord_column_stale).toBe(false)
    expect((await svc.getIdentityDetail(LONE)).discord_column_stale).toBe(true)
    expect(await code(svc.getIdentityDetail(id(99)))).toBe("NOT_FOUND")
  })

  it("release username: placeholder, audit row, in-app notice without the reason", async () => {
    const result = await svc.releaseUsername(ADMIN, HOLDER, REASON)
    const acc = await db("accounts").where({ user_id: HOLDER }).first()
    expect(acc.username).toMatch(/^user_[0-9a-f]{8}$/)
    expect(acc.display_name).toBe(acc.username)
    expect(acc.spectrum_user_id).toBe("7001")

    const audit = await db("audit_logs").where({ audit_log_id: result.audit_log_id }).first()
    expect(audit).toMatchObject({ action: "identity.username_released", actor_id: ADMIN.user_id, subject_id: HOLDER })
    expect(audit.metadata).toMatchObject({ reason: REASON, before: { username: "StaleHandle" } })

    await notifyIdentityChanged(HOLDER, ADMIN.user_id, result)
    const notif = await db("notification as n")
      .join("notification_object as o", "o.notification_object_id", "n.notification_object_id")
      .join("notification_actions as a", "a.action_type_id", "o.action_type_id")
      .where({ "n.notifier_id": HOLDER, "a.action": "account_identity_changed" })
      .first("o.entity_id")
    expect(notif.entity_id).toBe(result.audit_log_id)
    const entity = await getEntityByType("audit_logs", result.audit_log_id)
    expect(entity).toEqual({
      audit_log_id: result.audit_log_id,
      kind: "username_released",
      new_username: acc.username,
      created_at: expect.any(String),
    })
    expect(JSON.stringify(entity)).not.toContain(REASON)
    expect(pushes).toHaveLength(1)

    // The detail view lists the change with its reason (admins only).
    const d = await svc.getIdentityDetail(HOLDER)
    expect(d.recent_actions[0]).toMatchObject({ kind: "username_released", reason: REASON, actor_username: "pgi_admin" })
  })

  it("a failed audit write rolls the change back", async () => {
    await db.raw("ALTER TABLE audit_logs RENAME TO audit_logs_off")
    try {
      await expect(svc.releaseUsername(ADMIN, OTHER, REASON)).rejects.toThrow()
    } finally {
      await db.raw("ALTER TABLE audit_logs_off RENAME TO audit_logs")
    }
    expect((await db("accounts").where({ user_id: OTHER }).first()).username).toBe("stalehandle")
  })

  it("spectrum: set refuses an id held elsewhere; clear refuses while Citizen iD is linked", async () => {
    expect(await code(svc.fixSpectrum(ADMIN, OTHER, REASON, { mode: "set", spectrum_user_id: "7001" }))).toBe("CONFLICT")
    expect(await code(svc.fixSpectrum(ADMIN, HOLDER, REASON, { mode: "clear" }))).toBe("CONFLICT")
    await svc.fixSpectrum(ADMIN, OTHER, REASON, { mode: "clear" })
    expect(await db("accounts").where({ user_id: OTHER }).first("spectrum_user_id")).toEqual({ spectrum_user_id: null })
    await svc.fixSpectrum(ADMIN, OTHER, REASON, { mode: "set", spectrum_user_id: "7003" })
    expect(await db("accounts").where({ user_id: OTHER }).first("spectrum_user_id")).toEqual({ spectrum_user_id: "7003" })
  })

  it("unlink Discord: provider gone, column NULL, Citizen iD becomes primary", async () => {
    await svc.unlinkDiscord(ADMIN, HOLDER, REASON, false)
    const providers = await db("account_providers").where({ user_id: HOLDER }).select("provider_type", "is_primary")
    expect(providers).toEqual([{ provider_type: "citizenid", is_primary: true }])
    expect((await db("accounts").where({ user_id: HOLDER }).first()).discord_id).toBeNull()
    // The freed Discord id can now be used by another account.
    await db("accounts").where({ user_id: LONE }).update({ discord_id: "900000000000000001" })
  })

  it("deactivate ends only this account's sessions; reactivate", async () => {
    await svc.setAccountActive(ADMIN, HOLDER, REASON, false)
    expect((await db("accounts").where({ user_id: HOLDER }).first()).banned).toBe(true)
    expect(await db("refresh_tokens").where({ user_id: HOLDER })).toEqual([])
    expect(await db("refresh_tokens").where({ user_id: OTHER })).toHaveLength(1)
    expect((await db("login_sessions").select("sid")).map((r) => r.sid)).toEqual(["s-other"])
    await svc.setAccountActive(ADMIN, HOLDER, REASON, true)
    expect((await db("accounts").where({ user_id: HOLDER }).first()).banned).toBe(false)
  })

  it("site admins are refused", async () => {
    expect(await code(svc.releaseUsername({ user_id: HOLDER }, ADMIN.user_id, REASON))).toBe("FORBIDDEN")
  })
})
