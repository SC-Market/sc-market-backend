/**
 * discord_guild_presence refresh: from the bot's guild member lists, which
 * linked users share a server with the bot. Discord REST is a fake (no
 * request leaves the test, no DM is sent); the database is knex-mock-client
 * (test-utils/mock-knex-db.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: { getFileLinkResource: vi.fn() } }))

const presence = await import("./guild-presence.js")

const A = "aaaaaaaa-0000-4000-8000-000000000001"
const B = "bbbbbbbb-0000-4000-8000-000000000002"
const C = "cccccccc-0000-4000-8000-000000000003"
let tracker: Tracker
let db: ReturnType<typeof knexFactory>

/** A fake REST: the bot's guilds, and each guild's member ids. */
function fakeRest(guilds: Record<string, string[]>, fail: string[] = []) {
  const calls: string[] = []
  return {
    calls,
    async get(route: string, opts?: { query?: URLSearchParams }) {
      calls.push(`${route}?${opts?.query?.toString() ?? ""}`)
      if (route === "/users/@me/guilds") return Object.keys(guilds).map((id) => ({ id }))
      const m = route.match(/^\/guilds\/(\d+)\/members$/)
      if (!m) throw new Error(`unexpected route ${route}`)
      if (fail.includes(m[1])) throw new Error("Missing Access")
      const after = opts?.query?.get("after") ?? "0"
      const limit = Number(opts?.query?.get("limit") ?? 1)
      // As Discord: sorted by id, `limit` members with an id above `after`.
      return [...guilds[m[1]]]
        .sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1))
        .filter((id) => BigInt(id) > BigInt(after))
        .slice(0, limit)
        .map((id) => ({ user: { id } }))
    },
  }
}

function upserted(): { user_id: string; shares_server: boolean; guild_count: number }[] {
  const q = tracker.history.insert.find((x) => x.sql.includes("discord_guild_presence"))
  if (!q) return []
  // bindings: checked_at, guild_count, shares_server, user_id per row (knex sorts columns)
  const rows: { user_id: string; shares_server: boolean; guild_count: number }[] = []
  for (let i = 0; i + 3 < q.bindings.length; i += 4) {
    rows.push({ guild_count: q.bindings[i + 1] as number, shares_server: q.bindings[i + 2] as boolean, user_id: q.bindings[i + 3] as string })
  }
  return rows
}

beforeEach(() => {
  db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
  tracker.on.select("account_providers").response([
    { user_id: A, provider_id: "100000000000000001" },
    { user_id: B, provider_id: "100000000000000002" },
    { user_id: C, provider_id: "100000000000000003" },
  ])
  tracker.on.insert("discord_guild_presence").response([])
  tracker.on.delete("discord_guild_presence").response(0)
})

const sleep = async () => {}

describe("refreshGuildPresence", () => {
  it("marks linked users who share a server (and how many), and the rest false; non-users are not kept", async () => {
    const rest = fakeRest({
      "900000000000000001": ["100000000000000001", "555555555555555555"],
      "900000000000000002": ["100000000000000001", "100000000000000002"],
    })
    const stats = await presence.refreshGuildPresence({ rest, db, sleep, force: true })
    expect(stats).toMatchObject({ linked_users: 3, guilds: 2, sharing: 2, complete: true })
    expect(upserted()).toEqual(
      expect.arrayContaining([
        { user_id: A, shares_server: true, guild_count: 2 },
        { user_id: B, shares_server: true, guild_count: 1 },
        { user_id: C, shares_server: false, guild_count: 0 },
      ]),
    )
    expect(JSON.stringify(tracker.history.insert)).not.toContain("555555555555555555")
    // A complete crawl drops rows of users no longer linked.
    expect(tracker.history.delete).toHaveLength(1)
    // Members are read 1000 at a time.
    expect(rest.calls.some((c) => c.includes("limit=1000"))).toBe(true)
  })

  it("pages through a server's members with `after`", async () => {
    const many = Array.from({ length: presence.MEMBERS_PAGE_SIZE + 5 }, (_, i) => String(200000000000000000n + BigInt(i)))
    many.push("100000000000000003")
    const rest = fakeRest({ "900000000000000001": many })
    await presence.refreshGuildPresence({ rest, db, sleep, force: true })
    expect(rest.calls.filter((c) => c.startsWith("/guilds/"))).toHaveLength(2)
    expect(upserted()).toEqual(expect.arrayContaining([{ user_id: C, shares_server: true, guild_count: 1 }]))
  })

  it("if a server can't be read, writes only positives and keeps other rows", async () => {
    const rest = fakeRest(
      { "900000000000000001": ["100000000000000001"], "900000000000000002": ["100000000000000002"] },
      ["900000000000000002"],
    )
    const stats = await presence.refreshGuildPresence({ rest, db, sleep, force: true })
    expect(stats).toMatchObject({ complete: false, guilds_incomplete: 1 })
    expect(upserted()).toEqual([{ user_id: A, shares_server: true, guild_count: 1 }])
    expect(tracker.history.delete).toHaveLength(0)
  })

  it("skips when refreshed within the interval (a deploy restarts the schedule)", async () => {
    tracker.on.select("discord_guild_presence").response([{ at: new Date() }])
    const rest = fakeRest({ "900000000000000001": ["100000000000000001"] })
    expect(await presence.refreshGuildPresence({ rest, db, sleep })).toBeNull()
    expect(rest.calls).toHaveLength(0)
  })
})
