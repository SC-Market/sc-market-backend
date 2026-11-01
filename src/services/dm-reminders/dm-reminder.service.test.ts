/**
 * Unit tests for the reminder's grouping, message and query shape. The
 * end-to-end behaviour against Postgres (dedupe, quiet when read, cutover,
 * failures) is in services/notifications/__characterization__/other.char.test.ts.
 */
import { describe, expect, it, vi } from "vitest"
import knexFactory from "knex"

vi.mock("../../clients/database/knex-db.js", () => ({ getKnex: vi.fn() }))
vi.mock("../email/email.service.js", () => ({ emailService: { sendEmail: vi.fn() } }))
vi.mock("../email/template-engine.js", () => ({ renderEmailTemplate: vi.fn() }))
vi.mock("../notify/dispatcher.js", () => ({ notify: vi.fn() }))

import {
  MAX_MESSAGE_AGE_HOURS,
  REMINDER_CUTOVER,
  REMINDER_INTERVAL_HOURS,
  UNREAD_THRESHOLD_HOURS,
  buildDigests,
  candidatesQuery,
  reminderDm,
  type ReminderCandidate,
} from "./dm-reminder.service.js"

const c = (user: string, entity: string, action: ReminderCandidate["action"] = "order_message"): ReminderCandidate => ({
  user_id: user,
  username: user,
  display_name: user,
  entity_id: entity,
  action,
  message_at: new Date("2026-11-03T00:00:00Z"),
})

describe("timing", () => {
  it("a reminder always goes out within a day of the message", () => {
    // The task runs every 30 minutes.
    expect(UNREAD_THRESHOLD_HOURS + 0.5).toBeLessThan(24)
    expect(MAX_MESSAGE_AGE_HOURS).toBeLessThanOrEqual(24)
    expect(REMINDER_INTERVAL_HOURS).toBe(24)
  })
  it("the cutover is the 2026-11-01 deploy: no backfill of older unread messages", () => {
    expect(REMINDER_CUTOVER.toISOString()).toBe("2026-11-02T00:00:00.000Z")
  })
})

describe("buildDigests", () => {
  it("one digest per user with every due conversation, once each", () => {
    const { digests, capped } = buildDigests([c("u1", "o1"), c("u1", "o2", "offer_message"), c("u1", "o1"), c("u2", "o3")])
    expect(capped).toBe(0)
    expect(digests.map((d) => [d.user_id, d.conversations.map((x) => x.entity_id)])).toEqual([
      ["u1", ["o1", "o2"]],
      ["u2", ["o3"]],
    ])
  })
  it("per-run cap: the longest-waiting users first, the rest reported", () => {
    const { digests, capped } = buildDigests([c("u1", "a"), c("u2", "b"), c("u3", "c")], 2)
    expect(digests.map((d) => d.user_id)).toEqual(["u1", "u2"])
    expect(capped).toBe(1)
  })
})

describe("reminderDm", () => {
  it("lists the conversations with links; no mentions", () => {
    const { digests } = buildDigests([c("u1", "o1"), c("u1", "s1", "offer_message")])
    const dm = reminderDm(digests[0], new Map([["o1", "Sell [x](evil) Laranite"]]))
    expect(dm.allowed_mentions).toEqual({ parse: [] })
    expect(dm.embeds[0].title).toBe("You have unread messages in 2 conversations on SC Market")
    expect(dm.embeds[0].description).toContain("• [Order: Sell xevil Laranite](https://sc-market.space/contract/o1)")
    expect(dm.embeds[0].description).toContain("• [Offer: Offer chat](https://sc-market.space/offer/s1)")
  })
  it("caps the list", () => {
    const { digests } = buildDigests(Array.from({ length: 8 }, (_, i) => c("u1", `o${i}`)))
    expect(reminderDm(digests[0], new Map()).embeds[0].description).toContain("…and 3 more")
  })
})

describe("candidatesQuery", () => {
  const knex = knexFactory({ client: "pg" })
  const { sql, bindings } = candidatesQuery(knex, { cutover: new Date("2026-11-02T00:00:00Z") }).toSQL()

  it("only unread order/offer message notifications", () => {
    expect(sql).toContain('"n"."read" = ?')
    expect(bindings).toContain(false)
    expect(bindings).toEqual(expect.arrayContaining(["order_message", "offer_message"]))
  })
  it("unread for the threshold, newer than a day and than the cutover", () => {
    expect(sql).toContain(`NOW() - INTERVAL '${UNREAD_THRESHOLD_HOURS} hours'`)
    expect(sql).toContain(`GREATEST(NOW() - INTERVAL '${MAX_MESSAGE_AGE_HOURS} hours', ?::timestamptz)`)
    expect(bindings).toContain("2026-11-02T00:00:00.000Z")
  })
  it("dedupe: one per user per 24 h, one per conversation per new message", () => {
    expect(sql).toContain('from "dm_reminder_log" as "drl"')
    expect(sql).toContain(`NOW() - INTERVAL '${REMINDER_INTERVAL_HOURS} hours'`)
    expect(sql).toContain('from "dm_reminder_conversations" as "drc"')
    expect(sql).toContain("drc.reminded_at >= no.timestamp")
  })
  it("skips deleted accounts and users with no channel", () => {
    expect(sql).toContain('"a"."deleted_at" is null')
    expect(sql).toContain('from "account_providers" as "ap"')
    expect(sql).toContain('from "email_notification_preferences" as "enp"')
  })
})
