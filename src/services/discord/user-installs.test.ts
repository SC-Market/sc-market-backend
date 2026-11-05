/**
 * User installs of the SC Market Discord app (services/discord/user-installs.ts):
 * the bot reports them over the backend queue, a later 50007 DM failure
 * clears them. The database is knex-mock-client (test-utils/mock-knex-db.ts);
 * SQS and Discord REST are fakes. No DM is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: { getFileLinkResource: vi.fn() } }))

const installs = await import("./user-installs.js")
const attempts = await import("./dm-attempts.js")
const { processDiscordQueue } = await import("../../tasks/discord-queue-consumer.js")

const USER = "11111111-2222-4333-8444-555555555555"
const DISCORD = "123456789012345678"
let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
  vi.restoreAllMocks()
})

const upserts = () => tracker.history.insert.filter((q) => q.sql.includes("discord_user_installs"))
const clears = () => tracker.history.delete.filter((q) => q.sql.includes("discord_user_installs"))

describe("recordUserInstall", () => {
  it("records a linked user; a repeat only moves last_seen_at", async () => {
    tracker.on.select("account_providers").response({ user_id: USER })
    tracker.on.insert("discord_user_installs").response([])
    expect(await installs.recordUserInstall({ discord_id: DISCORD })).toBe(true)
    expect(tracker.history.select[0].bindings).toEqual(expect.arrayContaining(["discord", DISCORD]))
    const [q] = upserts()
    expect(q.bindings).toContain(USER)
    expect(q.sql).toMatch(/on conflict \("user_id"\) do update set "last_seen_at" = CURRENT_TIMESTAMP/i)
    // user_installed_at keeps the first sighting.
    expect(q.sql.slice(q.sql.toLowerCase().indexOf("do update"))).not.toContain("user_installed_at")
  })

  it("ignores a Discord account not linked to SC Market", async () => {
    tracker.on.select("account_providers").response(undefined)
    expect(await installs.recordUserInstall({ discord_id: DISCORD })).toBe(false)
    expect(upserts()).toHaveLength(0)
  })

  it.each([[null], [{}], [{ discord_id: "abc" }], [{ discord_id: 123456789012345678 }], [{ discord_id: `${DISCORD}0000` }]])(
    "rejects %j without touching the database",
    async (p) => {
      expect(await installs.recordUserInstall(p)).toBe(false)
      expect(tracker.history.all).toHaveLength(0)
    },
  )

  it("never throws", async () => {
    tracker.on.select("account_providers").response({ user_id: USER })
    tracker.on.insert("discord_user_installs").simulateError("db down")
    expect(await installs.recordUserInstall({ discord_id: DISCORD })).toBe(false)
  })
})

describe("a refused DM (50007 / 50278) clears the install", () => {
  beforeEach(() => {
    tracker.on.insert("discord_dm_attempts").response([])
    tracker.on.delete("discord_user_installs").response(1)
  })

  it("50007: cleared", async () => {
    await attempts.recordDmAttempt({ userId: USER, source: "notify:reminder.offer_pending", status: "failed", errorCode: 50007, httpStatus: 403 })
    expect(clears()).toHaveLength(1)
    expect(clears()[0].bindings).toContain(USER)
  })

  it("50278 (no mutual guilds): cleared", async () => {
    await attempts.recordDmAttempt({ userId: USER, source: "notify:reminder.offer_pending", status: "failed", errorCode: 50278, httpStatus: 403 })
    expect(clears()).toHaveLength(1)
  })

  it("from a bot-sent DM too (resolved from the Discord id)", async () => {
    tracker.on.select("account_providers").response({ user_id: USER })
    await attempts.recordBotDmResult({ discord_id: DISCORD, status: "failed", source: "thread_invite", error_code: 50007, http_status: 403 })
    expect(clears()).toHaveLength(1)
  })

  it("a delivered DM or another failure: kept", async () => {
    await attempts.recordDmAttempt({ userId: USER, source: "notify:x", status: "sent" })
    await attempts.recordDmAttempt({ userId: USER, source: "notify:x", status: "failed", errorCode: 40003, httpStatus: 429 })
    await attempts.recordDmAttempt({ userId: USER, source: "notify:x", status: "failed", errorCode: null, httpStatus: 500 })
    expect(clears()).toHaveLength(0)
  })
})

describe("bot user_install over the backend queue", () => {
  it("is recorded and the message deleted", async () => {
    const sqs = await import("../../clients/aws/sqs.js")
    const cfg = await import("../../clients/aws/sqs-config.js")
    vi.spyOn(cfg, "checkDiscordSQSConfiguration").mockReturnValue({ isDiscordConfigured: true } as never)
    vi.spyOn(sqs, "receiveMessage").mockResolvedValue({
      Messages: [
        {
          ReceiptHandle: "r1",
          MessageId: "m1",
          Body: JSON.stringify({
            type: "user_install",
            payload: { discord_id: DISCORD },
            metadata: { created_at: "2026-11-02T00:00:00Z" },
          }),
        },
      ],
    } as never)
    const del = vi.spyOn(sqs, "deleteMessage").mockResolvedValue({} as never)
    tracker.on.select("account_providers").response({ user_id: USER })
    tracker.on.insert("discord_user_installs").response([])
    await processDiscordQueue()
    expect(upserts()).toHaveLength(1)
    expect(del).toHaveBeenCalled()
  })
})
