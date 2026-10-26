import { describe, it, expect, beforeEach, vi } from "vitest"

/**
 * Price alert channel preferences: each channel (site, push, email, Discord DM)
 * is gated by its own per-user toggle, with the existing system's defaults
 * when the user never chose.
 */

const state = vi.hoisted(() => ({
  push: null as { enabled: boolean } | null,
  email: null as { enabled: boolean } | null,
  generic: [] as Array<{ channel: string; enabled: boolean }>,
  writes: [] as Array<{ table: string; method: string; args: unknown[] }>,
  updatedRows: 0,
}))

vi.mock("../../api/routes/v1/notifications/database.js", () => ({
  getNotificationActionByName: vi.fn(async (name: string) =>
    name === "price_alert" ? { action_type_id: "83", action: name, entity: "listings" } : undefined,
  ),
}))
vi.mock("../push-notifications/push-notification.database.js", () => ({
  getPushPreference: vi.fn(async () => state.push),
}))
vi.mock("../../api/routes/v1/email/database.js", () => ({
  getEmailPreference: vi.fn(async () => state.email),
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock("../../clients/database/knex-db.js", () => {
  const db = (table: string) => {
    const b: Record<string, unknown> = {}
    const chain =
      (method: string, result?: () => unknown) =>
      (...args: unknown[]) => {
        state.writes.push({ table, method, args })
        return result ? result() : b
      }
    b.where = chain("where")
    b.whereNull = chain("whereNull")
    b.select = chain("select", () => Promise.resolve(state.generic))
    b.update = chain("update", () => Promise.resolve(state.updatedRows))
    b.insert = chain("insert")
    b.onConflict = chain("onConflict")
    b.merge = chain("merge", () => Promise.resolve())
    b.then = (resolve: (v: unknown) => void) => resolve(undefined)
    return b
  }
  return { getKnex: () => db }
})

import {
  CHANNEL_DEFAULTS,
  dispatchNotification,
  getChannelPreferences,
  setChannelPreferences,
  type ChannelSenders,
} from "./channel-preferences.js"

function senders(): ChannelSenders & Record<string, ReturnType<typeof vi.fn>> {
  return {
    site: vi.fn(async () => {}),
    push: vi.fn(async () => {}),
    email: vi.fn(async () => {}),
    discord: vi.fn(async () => {}),
  }
}

beforeEach(() => {
  state.push = null
  state.email = null
  state.generic = []
  state.writes = []
  state.updatedRows = 0
})

describe("price alert channel defaults", () => {
  it("site, push and Discord are on and email is off until the user chooses", async () => {
    expect(CHANNEL_DEFAULTS).toEqual({ site: true, push: true, email: false, discord: true })
    expect(await getChannelPreferences("u-1", "price_alert")).toEqual(CHANNEL_DEFAULTS)
  })

  it("rejects an unknown notification action", async () => {
    await expect(getChannelPreferences("u-1", "nope")).rejects.toThrow("Unknown notification action")
  })
})

describe("dispatchNotification gates every channel on its own toggle", () => {
  it("default: sends site, push and Discord, not email", async () => {
    const s = senders()
    const delivered = await dispatchNotification("u-1", "price_alert", s)

    expect(delivered).toEqual(["site", "push", "discord"])
    expect(s.email).not.toHaveBeenCalled()
  })

  it("email opt-in sends email", async () => {
    state.email = { enabled: true }
    const s = senders()
    await dispatchNotification("u-1", "price_alert", s)
    expect(s.email).toHaveBeenCalledTimes(1)
  })

  it("push off skips push only", async () => {
    state.push = { enabled: false }
    const s = senders()
    expect(await dispatchNotification("u-1", "price_alert", s)).toEqual(["site", "discord"])
    expect(s.push).not.toHaveBeenCalled()
  })

  it("site off skips the site notification only", async () => {
    state.generic = [{ channel: "site", enabled: false }]
    const s = senders()
    expect(await dispatchNotification("u-1", "price_alert", s)).toEqual(["push", "discord"])
    expect(s.site).not.toHaveBeenCalled()
  })

  it("Discord off skips the DM only", async () => {
    state.generic = [{ channel: "discord", enabled: false }]
    const s = senders()
    expect(await dispatchNotification("u-1", "price_alert", s)).toEqual(["site", "push"])
    expect(s.discord).not.toHaveBeenCalled()
  })

  it("everything off sends nothing", async () => {
    state.push = { enabled: false }
    state.email = { enabled: false }
    state.generic = [
      { channel: "site", enabled: false },
      { channel: "discord", enabled: false },
    ]
    const s = senders()
    expect(await dispatchNotification("u-1", "price_alert", s)).toEqual([])
    for (const fn of Object.values(s)) expect(fn).not.toHaveBeenCalled()
  })

  it("a failing channel does not stop the others", async () => {
    const s = senders()
    s.site.mockRejectedValueOnce(new Error("db down"))
    expect(await dispatchNotification("u-1", "price_alert", s)).toEqual(["push", "discord"])
    expect(s.discord).toHaveBeenCalledTimes(1)
  })
})

describe("setChannelPreferences", () => {
  it("writes push/email to their tables and site/discord to the channel table", async () => {
    await setChannelPreferences("u-1", "price_alert", { push: false, email: true, discord: false })

    const tables = state.writes.map((w) => `${w.table}.${w.method}`)
    expect(tables).toContain("push_notification_preferences.update")
    expect(tables).toContain("email_notification_preferences.update")
    // No row to update -> inserted as an individual (contractor_id NULL) row.
    const emailInsert = state.writes.find(
      (w) => w.table === "email_notification_preferences" && w.method === "insert",
    )
    expect(emailInsert?.args[0]).toEqual({
      user_id: "u-1",
      action_type_id: 83,
      contractor_id: null,
      enabled: true,
    })
    const discordInsert = state.writes.find(
      (w) => w.table === "notification_channel_preferences" && w.method === "insert",
    )
    expect(discordInsert?.args[0]).toMatchObject({ channel: "discord", enabled: false })
    // Untouched channel is not written.
    expect(
      state.writes.some(
        (w) => w.method === "insert" && (w.args[0] as { channel?: string }).channel === "site",
      ),
    ).toBe(false)
  })

  it("updates an existing individual row instead of adding a duplicate", async () => {
    state.updatedRows = 1
    await setChannelPreferences("u-1", "price_alert", { email: false })

    expect(
      state.writes.some((w) => w.table === "email_notification_preferences" && w.method === "insert"),
    ).toBe(false)
    expect(
      state.writes.find((w) => w.table === "email_notification_preferences" && w.method === "whereNull")
        ?.args,
    ).toEqual(["contractor_id"])
  })
})
