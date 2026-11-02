/**
 * "Add SC Market to Discord" click counts (services/discord/install-clicks.ts)
 * and their endpoint. knex-mock-client database (test-utils/mock-knex-db.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

const clicks = await import("./install-clicks.js")
const { DiscordInstallV2Controller } = await import("../../api/routes/v2/discord/DiscordInstallV2Controller.js")

let tracker: Tracker
beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
})

describe("recordInstallClick", () => {
  it("increments today's counter for the type and surface", async () => {
    tracker.on.insert("discord_install_clicks").response([])
    expect(await clicks.recordInstallClick("user", "shop_hint")).toBe(true)
    const [q] = tracker.history.insert
    expect(q.bindings).toEqual(expect.arrayContaining(["user", "shop_hint", 1]))
    expect(q.sql).toMatch(/on conflict \("day", "install_type", "src"\) do update set "clicks" = discord_install_clicks.clicks \+ 1/i)
    // No user, IP or time beyond the day.
    expect(q.sql).not.toMatch(/user_id|ip|created_at/)
  })

  it("an unknown surface counts as other; an unknown type is ignored", async () => {
    tracker.on.insert("discord_install_clicks").response([])
    await clicks.recordInstallClick("server", "<script>")
    expect(tracker.history.insert[0].bindings).toContain("other")
    expect(await clicks.recordInstallClick("admin", "footer")).toBe(false)
    expect(tracker.history.insert).toHaveLength(1)
  })

  it("never throws", async () => {
    tracker.on.insert("discord_install_clicks").simulateError("db down")
    expect(await clicks.recordInstallClick("user", "footer")).toBe(false)
  })
})

describe("installClickCounts", () => {
  it("7- and 30-day counts per type and surface", async () => {
    tracker.on.select("discord_install_clicks").response([
      { install_type: "user", src: "shop_hint", clicks_7d: "3", clicks_30d: "9" },
    ])
    expect(await clicks.installClickCounts()).toEqual([
      { install_type: "user", src: "shop_hint", clicks_7d: 3, clicks_30d: 9 },
    ])
    const sql = tracker.history.select[0].sql
    expect(sql).toContain("CURRENT_DATE - 30")
    expect(sql).toContain("FILTER (WHERE day > CURRENT_DATE - 7)")
  })
})

describe("POST /discord/install-clicks", () => {
  it("counts and answers 204 with no body", async () => {
    tracker.on.insert("discord_install_clicks").response([])
    const c = new DiscordInstallV2Controller()
    expect(await c.recordDiscordInstallClick({ type: "user", src: "settings_notifications" })).toBeUndefined()
    expect(c.getStatus()).toBe(204)
    expect(tracker.history.insert).toHaveLength(1)
  })
})
