/**
 * Against the FULL schema in a real, throwaway Postgres:
 * - the key email defaults backfill (migration 20261101140000) writes only
 *   missing Personal rows for eligible users, never touches a user's own row
 *   (on or off), skips test / banned / deleted / unverified / unsubscribed
 *   users, queues the one-time notice and is idempotent;
 * - applyUnsubscribe turns a category off under the email's scope only
 *   (existing rows off, missing rows inserted off), and is idempotent.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../test-utils/pg-test-db.js"
import { buildSchema } from "../../test-utils/full-schema.js"

const DB = "pgtest_email_unsubscribe"
const state: { db: Knex | null } = { db: null }

vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => state.db),
)
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const backfill = await import("../../../migrations/20261101140000_backfill_key_email_defaults.js")
const { applyUnsubscribe } = await import("./unsubscribe.js")
const { KEY_EMAIL_ACTIONS } = await import("../notify/email-defaults.js")

const id = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const U = {
  fresh: id(1),
  optedOut: id(2),
  partial: id(3),
  unverified: id(4),
  banned: id(5),
  deleted: id(6),
  test: id(7),
  unsubscribed: id(8),
  noEmail: id(9),
  orgOnly: id(10),
}

describe.skipIf(!PG_TEST_URL)("key email defaults backfill and unsubscribe (Postgres)", () => {
  let db: Knex
  let actionId: Map<string, number>
  let orgId: string

  async function personalRows(userId: string) {
    const rows: { action: string; enabled: boolean }[] = await db("email_notification_preferences as p")
      .join("notification_actions as na", "na.action_type_id", "p.action_type_id")
      .where("p.user_id", userId)
      .whereNull("p.contractor_id")
      .select("na.action", "p.enabled")
      .orderBy("na.action")
    return rows
  }

  async function runBackfill() {
    await db.transaction(async (trx) => backfill.up(trx))
  }

  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 4 } })
    db = state.db

    const actions: { action: string; action_type_id: number }[] = await db("notification_actions").select(
      "action",
      "action_type_id",
    )
    actionId = new Map(actions.map((a) => [a.action, Number(a.action_type_id)]))

    await db("accounts").insert([
      { user_id: U.fresh, username: "bf_fresh", display_name: "bf_fresh" },
      { user_id: U.optedOut, username: "bf_optedout", display_name: "bf_optedout" },
      { user_id: U.partial, username: "bf_partial", display_name: "bf_partial" },
      { user_id: U.unverified, username: "bf_unverified", display_name: "bf_unverified" },
      { user_id: U.banned, username: "bf_banned", display_name: "bf_banned", banned: true },
      { user_id: U.deleted, username: "bf_deleted", display_name: "bf_deleted", deleted_at: new Date("2026-09-01") },
      { user_id: U.test, username: "~testbackfill", display_name: "~testbackfill", is_test: true },
      { user_id: U.unsubscribed, username: "bf_unsub", display_name: "bf_unsub" },
      { user_id: U.noEmail, username: "bf_noemail", display_name: "bf_noemail" },
      { user_id: U.orgOnly, username: "bf_orgonly", display_name: "bf_orgonly" },
    ])
    const verified = [U.fresh, U.optedOut, U.partial, U.banned, U.deleted, U.test, U.unsubscribed, U.orgOnly]
    await db("user_emails").insert([
      ...verified.map((u, i) => ({ user_id: u, email: `bf${i}@example.test`, email_verified: true, is_primary: true })),
      { user_id: U.unverified, email: "bfu@example.test", email_verified: false, is_primary: true },
    ])
    const [unsubEmail] = await db("user_emails").where({ user_id: U.unsubscribed }).select("email_id", "email")
    await db("email_unsubscribe_tokens").insert({
      user_id: U.unsubscribed,
      email_id: unsubEmail.email_id,
      email: unsubEmail.email,
      token: "f".repeat(64),
      used_at: new Date("2026-06-01"),
    })

    orgId = id(100)
    await db("contractors").insert({
      contractor_id: orgId,
      spectrum_id: "BFORG",
      kind: "Independent",
      size: 1,
      name: "Backfill Org",
      // Seeded image_resources rows (the column defaults point at others).
      avatar: "5226c767-0599-419b-ae71-a7303c441db0",
      banner: "0008300c-fc6a-4e4e-9488-7d696f00e8b2",
    })

    const pref = (user_id: string, action: string, enabled: boolean, contractor_id: string | null = null) => ({
      user_id,
      action_type_id: actionId.get(action),
      contractor_id,
      enabled,
      frequency: "immediate",
    })
    await db("email_notification_preferences").insert([
      // Turned every key email off.
      ...KEY_EMAIL_ACTIONS.map((a) => pref(U.optedOut, a, false)),
      // Chose two key actions (one off, one on); the rest are missing.
      pref(U.partial, "offer_create", false),
      pref(U.partial, "order_status_fulfilled", true),
      // Only an org row: it is not a Personal choice.
      pref(U.orgOnly, "offer_create", false, orgId),
    ])
  }, 300_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("backfills only missing Personal rows of eligible users, and is idempotent", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    await runBackfill()
    const first = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("backfill_key_email_defaults"))
    await runBackfill()
    const second = log.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes("backfill_key_email_defaults"))
      .pop()
    log.mockRestore()

    const allOn = [...KEY_EMAIL_ACTIONS].sort().map((action) => ({ action, enabled: true }))
    expect(await personalRows(U.fresh)).toEqual(allOn)
    expect(await personalRows(U.orgOnly)).toEqual(allOn)
    // Own choices kept; only the missing actions written.
    expect((await personalRows(U.optedOut)).every((r) => !r.enabled)).toBe(true)
    expect(await personalRows(U.partial)).toEqual(
      [...KEY_EMAIL_ACTIONS]
        .sort()
        .map((action) => ({ action, enabled: action !== "offer_create" })),
    )
    for (const u of [U.unverified, U.banned, U.deleted, U.test, U.unsubscribed, U.noEmail]) {
      expect(await personalRows(u)).toEqual([])
    }
    // The org row is untouched.
    expect(
      await db("email_notification_preferences").where({ user_id: U.orgOnly, contractor_id: orgId }).select("enabled"),
    ).toEqual([{ enabled: false }])

    const notices = await db("email_defaults_notices").orderBy("user_id").pluck("user_id")
    expect(notices).toEqual([U.fresh, U.partial, U.orgOnly].sort())

    expect(first).toContain('"users_affected":3')
    expect(first).toContain(`"rows_inserted":${7 + 7 + 5}`)
    expect(second).toContain('"users_affected":0')
    expect(second).toContain('"rows_inserted":0')
  })

  it("unsubscribe turns the category off under the email's scope only, idempotently", async () => {
    const first = await applyUnsubscribe(U.fresh, { kind: "category", category: "orders" }, null)
    expect(first.label).toBe("order updates")
    const rows = await personalRows(U.fresh)
    const orderActions = rows.filter((r) => r.action.startsWith("order_"))
    // order_create and order_assigned inserted off; the four statuses set off.
    expect(orderActions.map((r) => r.action)).toEqual(
      expect.arrayContaining(["order_create", "order_assigned", "order_status_fulfilled"]),
    )
    expect(orderActions.every((r) => !r.enabled)).toBe(true)
    // Other categories untouched.
    expect(rows.find((r) => r.action === "offer_create")?.enabled).toBe(true)
    expect(rows.find((r) => r.action === "dm_reminder")?.enabled).toBe(true)

    const again = await applyUnsubscribe(U.fresh, { kind: "category", category: "orders" }, null)
    expect(again.turnedOff).toBe(0)
    expect(await personalRows(U.fresh)).toEqual(rows)

    // An org-scoped email's link writes that org's rows, not Personal ones.
    await applyUnsubscribe(U.fresh, { kind: "category", category: "offers" }, orgId)
    expect((await personalRows(U.fresh)).find((r) => r.action === "offer_create")?.enabled).toBe(true)
    const orgRows = await db("email_notification_preferences")
      .where({ user_id: U.fresh, contractor_id: orgId })
      .pluck("enabled")
    expect(orgRows.length).toBeGreaterThan(0)
    expect(orgRows.every((e: boolean) => !e)).toBe(true)

    // The notice's link turns exactly the key defaults off.
    await applyUnsubscribe(U.partial, { kind: "key_defaults" }, null)
    expect((await personalRows(U.partial)).every((r) => !r.enabled)).toBe(true)
  })
})
