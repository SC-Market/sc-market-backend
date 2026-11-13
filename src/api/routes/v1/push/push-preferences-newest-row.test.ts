/**
 * GET /api/push/preferences must report the user's CURRENT choice.
 *
 * push_notification_preferences is UNIQUE (user_id, action_type_id,
 * contractor_id) and Postgres treats NULL contractor ids as distinct, so a
 * personal row could be duplicated by the old upsert here: a user who turned
 * push off had an older `enabled = true` row and a newer `enabled = false` one.
 * getPushPreferences orders updated_at DESC, but this handler built its map by
 * overwriting as it went, so the LAST row iterated (the oldest) won and the
 * settings reported push as still on.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../../../../services/push-notifications/push-notification.service.js", () => ({
  pushNotificationService: {},
  PushSubscriptionRejectedError: class extends Error {},
}))

const USER = "aaaaaaaa-0000-4000-8000-000000000001"
const ORG = "cccccccc-0000-4000-8000-000000000001"

/** Newest first, as getPushPreferences returns them (updated_at DESC). */
const rowsNewestFirst = (contractorId: string | null) => [
  {
    user_id: USER,
    action_type_id: "7",
    contractor_id: contractorId,
    enabled: false,
    updated_at: new Date("2026-11-10T00:00:00Z"),
  },
  {
    user_id: USER,
    action_type_id: "7",
    contractor_id: contractorId,
    enabled: true,
    updated_at: new Date("2026-10-01T00:00:00Z"),
  },
]

vi.mock("../../../../services/push-notifications/push-notification.database.js", () => ({
  getPushPreferencesGrouped: vi.fn(async () => ({
    individual: rowsNewestFirst(null),
    organizations: [{ contractor_id: ORG, preferences: rowsNewestFirst(ORG) }],
  })),
}))
vi.mock("../notifications/database.js", () => ({
  getAllNotificationActions: vi.fn(async () => [
    { action_type_id: "7", action: "offer_create", entity: "offer_sessions" },
    { action_type_id: "9", action: "offer_pending_reminder", entity: "offer_reminders" },
  ]),
}))

const { push_get_preferences } = await import("./controller.js")

function run() {
  const body: { data?: Record<string, any> } = {}
  const res = {
    status: () => res,
    json: (payload: { data?: Record<string, any> }) => {
      Object.assign(body, payload)
      return res
    },
  } as any
  return push_get_preferences(
    { user: { user_id: USER } } as any,
    res,
    (() => {}) as any,
  ).then(() => body.data!)
}

describe("GET /api/push/preferences", () => {
  it("reports the newest row for a duplicated personal preference, not the oldest", async () => {
    const data = await run()
    const pref = data.preferences.individual.find(
      (p: { action: string }) => p.action === "offer_create",
    )
    expect(pref.enabled).toBe(false)
  })

  it("does the same for an org scope", async () => {
    const data = await run()
    const org = data.preferences.organizations.find(
      (o: { contractor_id: string }) => o.contractor_id === ORG,
    )
    const pref = org.preferences.find(
      (p: { action: string }) => p.action === "offer_create",
    )
    expect(pref.enabled).toBe(false)
  })

  it("still defaults an action with no row to on (push is opt-out)", async () => {
    const data = await run()
    const pref = data.preferences.individual.find(
      (p: { action: string }) => p.action === "offer_pending_reminder",
    )
    expect(pref.enabled).toBe(true)
  })
})
