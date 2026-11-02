/**
 * Every Discord DM attempt lands in discord_dm_attempts: backend sends
 * (trySendDirectMessage, notify()'s adapter) and bot sends (dm_result over the
 * backend queue). The database is knex-mock-client (test-utils/mock-knex-db.ts);
 * Discord REST is a fake. No DM is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: { getFileLinkResource: vi.fn() } }))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUserDiscordId: vi.fn(async () => "123456789012345678"),
  getUser: vi.fn(),
}))

const attempts = await import("./dm-attempts.js")
const { discordService, rest } = await import("./discord.service.js")
const { discordDmAdapter } = await import("../notify/adapters/discord-dm.js")
const { processDiscordQueue } = await import("../../tasks/discord-queue-consumer.js")

const USER = "11111111-2222-4333-8444-555555555555"
const DISCORD = "123456789012345678"
let tracker: Tracker

function inserted() {
  return tracker.history.insert.filter((q) => q.sql.includes("discord_dm_attempts"))
}

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
  vi.restoreAllMocks()
})

describe("recordDmAttempt", () => {
  it("records a sent DM for the user", async () => {
    tracker.on.insert("discord_dm_attempts").response([])
    expect(await attempts.recordDmAttempt({ userId: USER, source: "notify:watchlist.price_alert", status: "sent", errorCode: 50007 })).toBe(true)
    const [q] = inserted()
    expect(q.bindings).toEqual(expect.arrayContaining([USER, "notify:watchlist.price_alert", "sent"]))
    // A sent DM carries no error code.
    expect(q.bindings).not.toContain(50007)
  })

  it("records a failure with Discord's error code and HTTP status", async () => {
    tracker.on.insert("discord_dm_attempts").response([])
    await attempts.recordDmAttempt({ userId: USER, source: "bot:thread_invite", status: "failed", errorCode: 50007, httpStatus: 403 })
    expect(inserted()[0].bindings).toEqual(expect.arrayContaining([USER, "bot:thread_invite", "failed", 50007, 403]))
  })

  it("finds the user from the Discord id; an unlinked Discord account is not recorded", async () => {
    tracker.on.select("account_providers").responseOnce({ user_id: USER })
    tracker.on.insert("discord_dm_attempts").response([])
    expect(await attempts.recordDmAttempt({ discordId: DISCORD, source: "backend:direct", status: "sent" })).toBe(true)
    expect(tracker.history.select[0].bindings).toEqual(expect.arrayContaining(["discord", DISCORD]))

    tracker.on.select("account_providers").responseOnce(undefined)
    expect(await attempts.recordDmAttempt({ discordId: DISCORD, source: "backend:direct", status: "sent" })).toBe(false)
    expect(inserted()).toHaveLength(1)
  })

  it("never throws, and refuses a malformed source", async () => {
    tracker.on.insert("discord_dm_attempts").simulateError("db down")
    expect(await attempts.recordDmAttempt({ userId: USER, source: "notify:x", status: "sent" })).toBe(false)
    expect(await attempts.recordDmAttempt({ userId: USER, source: "Bad Source!", status: "sent" })).toBe(false)
  })
})

describe("parseBotDmResult", () => {
  it("accepts a well-formed result", () => {
    expect(
      attempts.parseBotDmResult({ discord_id: DISCORD, status: "failed", source: "thread_invite", error_code: 50007, http_status: 403 }),
    ).toEqual({ discord_id: DISCORD, status: "failed", source: "thread_invite", error_code: 50007, http_status: 403 })
  })

  it.each([
    [null],
    [{ discord_id: "abc", status: "sent", source: "thread_invite" }],
    [{ discord_id: DISCORD, status: "maybe", source: "thread_invite" }],
    [{ discord_id: DISCORD, status: "sent", source: "x:y" }],
  ])("rejects %j", (p) => {
    expect(attempts.parseBotDmResult(p)).toBeNull()
  })
})

describe("trySendDirectMessage records every attempt", () => {
  it("a delivered DM", async () => {
    vi.spyOn(rest, "post").mockResolvedValue({ id: "dm-channel" } as never)
    tracker.on.insert("discord_dm_attempts").response([])
    const r = await discordService.trySendDirectMessage(DISCORD, { content: "x" }, { userId: USER, source: "notify:reminder.unread_messages" })
    expect(r).toEqual({ ok: true })
    expect(inserted()[0].bindings).toEqual(expect.arrayContaining([USER, "notify:reminder.unread_messages", "sent"]))
  })

  it("a 50007 failure, through notify()'s Discord DM adapter", async () => {
    vi.spyOn(rest, "post")
      .mockResolvedValueOnce({ id: "dm-channel" } as never)
      .mockRejectedValueOnce(Object.assign(new Error("Cannot send messages to this user"), { code: 50007, status: 403 }))
    tracker.on.insert("discord_dm_attempts").response([])
    const outcome = await discordDmAdapter.send({ content: "x" }, {
      eventKey: "watchlist.price_alert",
      legacyAction: "price_alert",
      recipient: { userId: USER, contractorId: null },
      idempotencyKey: "k",
      mandatory: false,
    } as never)
    expect(outcome.status).toBe("permanent")
    expect(inserted()[0].bindings).toEqual(expect.arrayContaining([USER, "notify:watchlist.price_alert", "failed", 50007, 403]))
  })
})

describe("bot dm_result over the backend queue", () => {
  it("is recorded as source bot:<kind>", async () => {
    const sqs = await import("../../clients/aws/sqs.js")
    const cfg = await import("../../clients/aws/sqs-config.js")
    vi.spyOn(cfg, "checkDiscordSQSConfiguration").mockReturnValue({ isDiscordConfigured: true } as never)
    vi.spyOn(sqs, "receiveMessage").mockResolvedValue({
      Messages: [
        {
          ReceiptHandle: "r1",
          MessageId: "m1",
          Body: JSON.stringify({
            type: "dm_result",
            payload: { discord_id: DISCORD, status: "failed", source: "thread_invite", error_code: 50007, http_status: 403 },
            metadata: { created_at: "2026-11-02T00:00:00Z" },
          }),
        },
      ],
    } as never)
    const del = vi.spyOn(sqs, "deleteMessage").mockResolvedValue({} as never)
    tracker.on.select("account_providers").response({ user_id: USER })
    tracker.on.insert("discord_dm_attempts").response([])
    await processDiscordQueue()
    expect(inserted()[0].bindings).toEqual(expect.arrayContaining([USER, "bot:thread_invite", "failed", 50007, 403]))
    expect(del).toHaveBeenCalled()
  })
})
