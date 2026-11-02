/**
 * Bounce tracking outside the webhook: SES notification parsing (fixtures),
 * the send path skipping undeliverable addresses (except the verification
 * email, which is how a user clears a bounce), re-verifying and changing the
 * address clearing it, and Settings › Email's deliverability status and
 * re-verify cooldown. The database is mocked (test-utils/mock-knex-db.ts,
 * knex-mock-client).
 */
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  db: null as unknown,
  sendEmailViaSES: vi.fn(),
}))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../../clients/aws/ses.js", () => ({ sendEmailViaSES: h.sendEmailViaSES }))
vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: {} }))
vi.mock("../test-accounts/isolation.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deliverableRecipients: async (ids: string[]) => ids,
}))
vi.mock("./template-engine.js", () => ({ renderEmailTemplate: async () => "body" }))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUser: async () => ({ username: "alice", display_name: "Alice", locale: "en" }),
}))

const { parseSesNotification } = await import("./email-feedback.js")
const { sesFixture } = await import("./sns-test-helpers.js")
const { emailService } = await import("./email.service.js")
const userEmailDb = await import("../../api/routes/v1/email/user-email-database.js")
const deliverability = await import("./deliverability.service.js")

let tracker: Tracker
const savedEnv = { from: process.env.EMAIL_FROM_ADDRESS, queue: process.env.EMAIL_QUEUE_URL }

const emailRow = (over: Record<string, unknown> = {}) => ({
  email_id: "em1",
  user_id: "u1",
  email: "alice@example.test",
  email_verified: true,
  is_primary: true,
  email_bounced_at: null,
  bounce_type: null,
  bounce_subtype: null,
  soft_bounce_count: 0,
  last_delivered_at: null,
  ...over,
})

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
  h.sendEmailViaSES.mockReset()
  h.sendEmailViaSES.mockResolvedValue("ses-msg-1")
  process.env.EMAIL_FROM_ADDRESS = "noreply@sc-market.space"
  delete process.env.EMAIL_QUEUE_URL
})

afterEach(() => {
  tracker.reset()
  if (savedEnv.from === undefined) delete process.env.EMAIL_FROM_ADDRESS
  else process.env.EMAIL_FROM_ADDRESS = savedEnv.from
  if (savedEnv.queue !== undefined) process.env.EMAIL_QUEUE_URL = savedEnv.queue
})

describe("parseSesNotification (fixtures)", () => {
  it("a Permanent bounce is hard", () => {
    expect(parseSesNotification(sesFixture("ses-bounce-permanent.json"))).toEqual({
      kind: "bounce",
      bounceType: "hard",
      subtype: "Permanent/General",
      recipients: ["Gone.Seller@example.test"],
    })
  })

  it("Transient and Undetermined bounces are soft", () => {
    expect(parseSesNotification(sesFixture("ses-bounce-transient.json"))).toMatchObject({
      kind: "bounce",
      bounceType: "soft",
      subtype: "Transient/MailboxFull",
    })
    const undetermined = sesFixture("ses-bounce-transient.json").replace('"Transient"', '"Undetermined"')
    expect(parseSesNotification(undetermined)).toMatchObject({ kind: "bounce", bounceType: "soft" })
  })

  it("a complaint, and not-spam is not one", () => {
    expect(parseSesNotification(sesFixture("ses-complaint.json"))).toEqual({
      kind: "complaint",
      subtype: "abuse",
      recipients: ["annoyed@example.test"],
    })
    expect(
      parseSesNotification(sesFixture("ses-complaint.json").replace('"abuse"', '"not-spam"')),
    ).toEqual({ kind: "ignored", reason: "not_spam" })
  })

  it("a delivery", () => {
    expect(parseSesNotification(sesFixture("ses-delivery.json"))).toEqual({
      kind: "delivery",
      recipients: ["happy.seller@example.test"],
    })
  })

  it("ignores other events and junk", () => {
    expect(parseSesNotification('{"notificationType":"Send"}').kind).toBe("ignored")
    expect(parseSesNotification("not json").kind).toBe("ignored")
    expect(parseSesNotification('{"notificationType":"Bounce","bounce":{"bounceType":"Permanent","bouncedRecipients":[{"emailAddress":"no-at-sign"}]}}').kind).toBe("ignored")
  })
})

describe("send path", () => {
  const mail = { to: "Alice@Example.test", subject: "Hi", html: "<p>x</p>", text: "x" }

  it("skips an undeliverable address (case-insensitive) without calling SES", async () => {
    tracker.on.select(/from "user_emails"/).response([{ email_id: "em1" }])
    const result = await emailService.sendEmail(mail)
    expect(result.status).toBe("suppressed")
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
    const q = tracker.history.select[0]
    expect(q.sql).toMatch(/lower\(email\) = lower\(\$\d\)/)
    expect(q.sql).toContain('"email_bounced_at" is not null')
    expect(q.bindings).toContain("Alice@Example.test")
  })

  it("sends to a deliverable address", async () => {
    tracker.on.select(/from "user_emails"/).response([])
    expect((await emailService.sendEmail(mail)).status).toBe("sent")
    expect(h.sendEmailViaSES).toHaveBeenCalledTimes(1)
  })

  it("the verification email still goes to a bounced address (re-verifying clears the bounce)", async () => {
    tracker.on.select(/from "user_emails"/).response([emailRow({ email_bounced_at: new Date(), bounce_type: "hard" })])
    tracker.on.insert(/email_verification_tokens/).response([
      { token_id: "t1", token: "tok", email_id: "em1", user_id: "u1" },
    ])
    tracker.on.update(/email_verification_tokens/).response(1)
    await emailService.sendVerificationEmail("u1", "alice@example.test")
    expect(h.sendEmailViaSES).toHaveBeenCalledTimes(1)
    expect(h.sendEmailViaSES.mock.calls[0][0]).toBe("alice@example.test")
  })

  it("notification emails skip a bounced primary address before rendering", async () => {
    tracker.on.select(/from "user_emails"/).response([emailRow({ email_bounced_at: new Date(), bounce_type: "complaint" })])
    expect(await emailService.sendNotificationEmail("u1", "admin_alert", { alert: {} }, true)).toBe(false)
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
  })
})

describe("clearing a bounce", () => {
  it("verifying the address clears the bounce fields", async () => {
    tracker.on.update(/user_emails/).response([emailRow()])
    await userEmailDb.verifyUserEmail("em1")
    const q = tracker.history.update[0]
    expect(q.sql).toMatch(/"email_bounced_at" = \$\d+/)
    expect(q.sql).toMatch(/"bounce_type" = \$\d+/)
    expect(q.sql).toMatch(/"soft_bounce_count" = \$\d+/)
    expect(q.sql).not.toContain("last_delivered_at")
  })

  it("changing the address clears its bounce and delivery history", async () => {
    tracker.on.update(/user_emails/).response([emailRow()])
    await userEmailDb.updateUserEmail("em1", { email: "new@example.test", email_verified: false, verified_at: null })
    const q = tracker.history.update[0]
    expect(q.sql).toMatch(/"email_bounced_at" = \$\d+/)
    expect(q.sql).toMatch(/"last_delivered_at" = \$\d+/)
  })

  it("other updates leave them alone", async () => {
    tracker.on.update(/user_emails/).response([emailRow()])
    await userEmailDb.updateUserEmail("em1", { email_verified: true })
    expect(tracker.history.update[0].sql).not.toContain("email_bounced_at")
  })
})

describe("Settings › Email deliverability", () => {
  const NOW = new Date("2026-11-02T12:00:00.000Z")

  it("reports a bounced address, with when and why", async () => {
    tracker.on.select(/from "user_emails"/).response([
      emailRow({
        email_bounced_at: new Date("2026-11-02T10:00:00.000Z"),
        bounce_type: "hard",
        last_delivered_at: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ])
    tracker.on.select(/from "email_verification_tokens"/).response([])
    expect(await deliverability.getEmailDeliverability("u1", NOW)).toEqual({
      has_email: true,
      email_verified: true,
      undeliverable: true,
      bounced_at: "2026-11-02T10:00:00.000Z",
      bounce_type: "hard",
      last_delivered_at: "2026-10-01T00:00:00.000Z",
      reverify_available_at: null,
    })
  })

  it("no email: nothing to report", async () => {
    tracker.on.select(/from "user_emails"/).response([])
    expect(await deliverability.getEmailDeliverability("u1", NOW)).toMatchObject({
      has_email: false,
      undeliverable: false,
    })
  })

  it("re-verify refuses an address that is not bounced", async () => {
    tracker.on.select(/from "user_emails"/).response([emailRow()])
    expect(await deliverability.requestReverify("u1", NOW)).toEqual({ ok: false, reason: "not_undeliverable" })
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
  })

  it("re-verify waits out the cooldown after a recent verification email", async () => {
    tracker.on.select(/from "user_emails"/).response([emailRow({ email_bounced_at: new Date(), bounce_type: "soft" })])
    tracker.on.select(/from "email_verification_tokens"/).response([
      { token_id: "t0", created_at: new Date(NOW.getTime() - 5 * 60 * 1000) },
    ])
    const result = await deliverability.requestReverify("u1", NOW)
    expect(result).toEqual({
      ok: false,
      reason: "cooldown",
      reverifyAvailableAt: new Date(NOW.getTime() + 10 * 60 * 1000),
    })
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
    expect(deliverability.REVERIFY_COOLDOWN_MS).toBe(15 * 60 * 1000)
  })
})
