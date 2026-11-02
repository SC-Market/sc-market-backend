/**
 * POST /api/webhooks/ses/feedback end to end, through express: fail closed
 * without a topic, refuse anything unverified, confirm the subscription, and
 * apply bounces, complaints and deliveries once per SNS MessageId. The
 * database is mocked (test-utils/mock-knex-db.ts); the statements it gets are
 * checked. Fixture payloads are signed with a test-only key
 * (services/email/sns-test-helpers.ts).
 */
import express from "express"
import request from "supertest"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  db: null as unknown,
  raw: vi.fn(),
  claimed: new Set<string>(),
}))
vi.mock("../../../clients/database/knex-db.js", async () =>
  (await import("../../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

// email.service.js renders and sends notification emails; none are sent
// here, so its CDN client is never used.
vi.mock("../../../clients/cdn/cdn.js", () => ({ cdn: {} }))

const { createSesFeedbackRouter, isConfirmSubscriptionUrl } = await import("./ses-feedback.js")
const { SOFT_BOUNCE_LIMIT } = await import("../../../services/email/email-feedback.js")
const helpers = await import("../../../services/email/sns-test-helpers.js")
const { TOPIC_ARN, FIXTURE_TIME, fetchTestCert, sesFixture, signedNotification, signedSubscriptionConfirmation } = helpers

type Raw = [string, unknown[] | undefined]

function fakeDb() {
  const db = {
    raw: h.raw,
    transaction: async <T>(fn: (trx: unknown) => Promise<T>) => fn(db),
  }
  return db
}

function app(topicArn: string | null = TOPIC_ARN, confirmSubscription = vi.fn(async () => {})) {
  const a = express()
  a.use(
    "/api/webhooks/ses",
    createSesFeedbackRouter({
      topicArn: () => topicArn,
      db: () => h.db as never,
      fetchCert: fetchTestCert,
      confirmSubscription,
      now: () => FIXTURE_TIME,
    }),
  )
  return { app: a, confirmSubscription }
}

const post = (a: express.Express, body: unknown) =>
  request(a)
    .post("/api/webhooks/ses/feedback")
    .set("Content-Type", "text/plain; charset=UTF-8")
    .set("x-amz-sns-message-type", "Notification")
    .send(typeof body === "string" ? body : JSON.stringify(body))

const calls = (): Raw[] => h.raw.mock.calls as Raw[]
const updates = () => calls().filter(([sql]) => /UPDATE user_emails/.test(sql))

beforeEach(() => {
  h.claimed.clear()
  h.raw.mockReset()
  h.raw.mockImplementation(async (sql: string, bindings?: unknown[]) => {
    if (/INSERT INTO email_feedback_events/.test(sql)) {
      const id = String(bindings?.[0])
      if (h.claimed.has(id)) return { rows: [] }
      h.claimed.add(id)
      return { rows: [{ message_id: id }] }
    }
    if (/UPDATE user_emails/.test(sql)) {
      return { rows: [{ email_id: "e1", user_id: "u1", undeliverable: true }] }
    }
    return { rows: [] }
  })
  h.db = fakeDb()
})

describe("refuses", () => {
  it("everything with 503 when SES_FEEDBACK_SNS_TOPIC_ARN is not configured", async () => {
    const { app: a } = app(null)
    const res = await post(a, signedNotification(sesFixture("ses-bounce-permanent.json")))
    expect(res.status).toBe(503)
    expect(h.raw).not.toHaveBeenCalled()
  })

  it("an unsigned bounce with 403 and records nothing", async () => {
    const { app: a } = app()
    const res = await post(a, { ...signedNotification(sesFixture("ses-bounce-permanent.json")), Signature: "AAAA" })
    expect(res.status).toBe(403)
    expect(h.raw).not.toHaveBeenCalled()
  })

  it("raw SES JSON posted directly (no SNS envelope) with 400", async () => {
    const { app: a } = app()
    const res = await post(a, sesFixture("ses-bounce-permanent.json"))
    expect(res.status).toBe(400)
    expect(h.raw).not.toHaveBeenCalled()
  })

  it("a validly signed message from another topic", async () => {
    const { app: a } = app()
    const res = await post(
      a,
      signedNotification(sesFixture("ses-bounce-permanent.json"), {
        TopicArn: "arn:aws:sns:us-east-2:999999999999:other",
      }),
    )
    expect(res.status).toBe(403)
    expect(h.raw).not.toHaveBeenCalled()
  })

  it("a signed SubscriptionConfirmation whose SubscribeURL is not SNS's, without fetching it", async () => {
    const { app: a, confirmSubscription } = app()
    const res = await post(
      a,
      signedSubscriptionConfirmation({ SubscribeURL: "https://evil.example/?Action=ConfirmSubscription" }),
    )
    expect(res.status).toBe(403)
    expect(confirmSubscription).not.toHaveBeenCalled()
  })
})

describe("SubscriptionConfirmation", () => {
  it("is confirmed by fetching its SubscribeURL", async () => {
    const { app: a, confirmSubscription } = app()
    const message = signedSubscriptionConfirmation()
    const res = await post(a, message)
    expect(res.status).toBe(200)
    expect(confirmSubscription).toHaveBeenCalledWith(message.SubscribeURL)
  })

  it("SubscribeURL must be ConfirmSubscription for our topic", () => {
    const ok = signedSubscriptionConfirmation().SubscribeURL!
    expect(isConfirmSubscriptionUrl(ok, TOPIC_ARN)).toBe(true)
    expect(isConfirmSubscriptionUrl(ok.replace("ConfirmSubscription", "Unsubscribe"), TOPIC_ARN)).toBe(false)
    expect(isConfirmSubscriptionUrl(ok, "arn:aws:sns:us-east-2:123456789012:other")).toBe(false)
    expect(isConfirmSubscriptionUrl(ok.replace("https://", "http://"), TOPIC_ARN)).toBe(false)
  })
})

describe("Notification", () => {
  it("hard bounce: marks the address undeliverable, once per MessageId", async () => {
    const { app: a } = app()
    const message = signedNotification(sesFixture("ses-bounce-permanent.json"))
    expect((await post(a, message)).status).toBe(200)
    expect(updates()).toHaveLength(1)
    const [sql, bindings] = updates()[0]
    expect(sql).toContain("SET email_bounced_at = now()")
    expect(sql).toContain("WHERE lower(email) = lower(?)")
    expect(bindings).toEqual(["hard", "Permanent/General", "Gone.Seller@example.test"])

    // SNS redelivers, or someone replays the signed message: applied once.
    expect((await post(a, message)).status).toBe(200)
    expect(updates()).toHaveLength(1)
  })

  it("complaint: marks the address undeliverable as a complaint", async () => {
    const { app: a } = app()
    expect((await post(a, signedNotification(sesFixture("ses-complaint.json")))).status).toBe(200)
    expect(updates()[0][1]).toEqual(["complaint", "abuse", "annoyed@example.test"])
  })

  it("a not-spam feedback report changes nothing", async () => {
    const { app: a } = app()
    const body = sesFixture("ses-complaint.json").replace('"abuse"', '"not-spam"')
    expect((await post(a, signedNotification(body))).status).toBe(200)
    expect(updates()).toHaveLength(0)
    expect(calls().some(([sql]) => /INSERT INTO email_feedback_events/.test(sql))).toBe(false)
  })

  it("soft bounce: counts, and marks only at the limit", async () => {
    const { app: a } = app()
    expect((await post(a, signedNotification(sesFixture("ses-bounce-transient.json")))).status).toBe(200)
    const [sql, bindings] = updates()[0]
    expect(sql).toContain("soft_bounce_count = soft_bounce_count + 1")
    expect(sql.replace(/\s+/g, " ")).toContain(
      "email_bounced_at = CASE WHEN email_bounced_at IS NULL AND soft_bounce_count + 1 >= ? THEN now() ELSE email_bounced_at END",
    )
    expect(bindings).toEqual([
      SOFT_BOUNCE_LIMIT,
      SOFT_BOUNCE_LIMIT,
      SOFT_BOUNCE_LIMIT,
      "Transient/MailboxFull",
      "full.mailbox@example.test",
    ])
    expect(SOFT_BOUNCE_LIMIT).toBe(3)
  })

  it("delivery: records last_delivered_at and resets the soft-bounce count", async () => {
    const { app: a } = app()
    expect((await post(a, signedNotification(sesFixture("ses-delivery.json")))).status).toBe(200)
    const [sql, bindings] = updates()[0]
    expect(sql).toContain("SET last_delivered_at = now(), soft_bounce_count = 0")
    expect(sql).not.toContain("email_bounced_at =")
    expect(bindings).toEqual(["happy.seller@example.test"])
  })

  it("configuration-set events (eventType instead of notificationType) are read too", async () => {
    const { app: a } = app()
    const body = sesFixture("ses-bounce-permanent.json").replace('"notificationType"', '"eventType"')
    expect((await post(a, signedNotification(body))).status).toBe(200)
    expect(updates()).toHaveLength(1)
  })

  it("answers 500 when the database fails, so SNS retries", async () => {
    const { app: a } = app()
    h.raw.mockRejectedValue(new Error("db down"))
    expect((await post(a, signedNotification(sesFixture("ses-bounce-permanent.json")))).status).toBe(500)
  })
})
