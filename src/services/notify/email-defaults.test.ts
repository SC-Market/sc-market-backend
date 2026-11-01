/**
 * Key email defaults for a newly set email (email-defaults.ts): missing
 * Personal rows are written on; any existing Personal row (on or off) is the
 * user's choice and is kept; org rows don't count and are never written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
}))

/** Just enough of knex for email-defaults.ts: where / whereNull / whereIn / select / insert. */
vi.mock("../../clients/database/knex-db.js", () => {
  const builder = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    const b = {
      where(col: string, value: unknown) {
        filters.push((r) => r[col] === value)
        return b
      },
      whereNull(col: string) {
        filters.push((r) => r[col] === null || r[col] === undefined)
        return b
      },
      whereIn(col: string, values: unknown[]) {
        filters.push((r) => values.includes(r[col]))
        return b
      },
      async select(...cols: string[]) {
        return (h.tables[table] ?? [])
          .filter((r) => filters.every((f) => f(r)))
          .map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
      },
      async insert(rows: Row[]) {
        h.tables[table] = [...(h.tables[table] ?? []), ...rows]
        return rows
      },
    }
    return b
  }
  return { getKnex: () => builder, database: { setStrategy: () => {} } }
})

import { applyKeyEmailDefaults, KEY_EMAIL_ACTIONS } from "./email-defaults.js"

const ACTIONS: Row[] = [
  { action_type_id: 1, action: "order_create" },
  { action_type_id: 6, action: "order_status_not_started" },
  { action_type_id: 7, action: "order_status_in_progress" },
  { action_type_id: 8, action: "order_status_fulfilled" },
  { action_type_id: 9, action: "order_status_cancelled" },
  { action_type_id: 13, action: "order_message" },
  { action_type_id: 19, action: "offer_create" },
  { action_type_id: 20, action: "counter_offer_create" },
  { action_type_id: 82, action: "dm_reminder" },
]

function prefs(userId: string) {
  return (h.tables.email_notification_preferences ?? [])
    .filter((r) => r.user_id === userId)
    .map(
      (r) =>
        `${r.action_type_id}:${r.contractor_id ?? "personal"}:${r.enabled ? "on" : "off"}`,
    )
    .sort()
}

beforeEach(() => {
  h.tables = {
    notification_actions: ACTIONS,
    email_notification_preferences: [],
  }
})

describe("applyKeyEmailDefaults", () => {
  it("covers order status changes, new/counter offers and the unread-message reminder", () => {
    expect([...KEY_EMAIL_ACTIONS].sort()).toEqual([
      "counter_offer_create",
      "dm_reminder",
      "offer_create",
      "order_status_cancelled",
      "order_status_fulfilled",
      "order_status_in_progress",
      "order_status_not_started",
    ])
  })

  it("a user with no rows gets every key event on, Personal scope, immediate", async () => {
    const applied = await applyKeyEmailDefaults("u1")
    expect(applied.sort()).toEqual([...KEY_EMAIL_ACTIONS].sort())
    expect(prefs("u1")).toEqual([
      "19:personal:on",
      "20:personal:on",
      "6:personal:on",
      "7:personal:on",
      "82:personal:on",
      "8:personal:on",
      "9:personal:on",
    ])
    const row = h.tables.email_notification_preferences[0]
    expect(row).toMatchObject({
      frequency: "immediate",
      digest_time: null,
      contractor_id: null,
    })
  })

  it("keeps the user's own Personal choices, on or off, and fills only the rest", async () => {
    h.tables.email_notification_preferences = [
      { user_id: "u1", action_type_id: 9, contractor_id: null, enabled: false },
      { user_id: "u1", action_type_id: 82, contractor_id: null, enabled: true },
    ]
    const applied = await applyKeyEmailDefaults("u1")
    expect(applied).not.toContain("order_status_cancelled")
    expect(applied).not.toContain("dm_reminder")
    expect(prefs("u1")).toContain("9:personal:off")
    expect(prefs("u1").filter((p) => p.startsWith("9:"))).toEqual([
      "9:personal:off",
    ])
    expect(prefs("u1").filter((p) => p.startsWith("82:"))).toEqual([
      "82:personal:on",
    ])
  })

  it("an org row is not a Personal choice: the Personal default is still written, the org row untouched", async () => {
    h.tables.email_notification_preferences = [
      {
        user_id: "u1",
        action_type_id: 19,
        contractor_id: "org-1",
        enabled: false,
      },
    ]
    await applyKeyEmailDefaults("u1")
    expect(prefs("u1").filter((p) => p.startsWith("19:"))).toEqual([
      "19:org-1:off",
      "19:personal:on",
    ])
    expect(prefs("u1").some((p) => p.includes("org-1:on"))).toBe(false)
  })

  it("other users' rows don't count", async () => {
    h.tables.email_notification_preferences = [
      { user_id: "u2", action_type_id: 6, contractor_id: null, enabled: false },
    ]
    await applyKeyEmailDefaults("u1")
    expect(prefs("u1")).toContain("6:personal:on")
    expect(prefs("u2")).toEqual(["6:personal:off"])
  })

  it("is idempotent: a second call writes nothing", async () => {
    await applyKeyEmailDefaults("u1")
    expect(await applyKeyEmailDefaults("u1")).toEqual([])
    expect(prefs("u1")).toHaveLength(KEY_EMAIL_ACTIONS.length)
  })

  it("never turns on non-key events (per-message emails, new orders)", async () => {
    await applyKeyEmailDefaults("u1")
    expect(
      prefs("u1").some((p) => p.startsWith("1:") || p.startsWith("13:")),
    ).toBe(false)
  })
})
