/**
 * Characterization: the backend-consumed queues as they behave today:
 * the email queue (tasks/email-queue-consumer.ts) and the bot's reply queue
 * (tasks/discord-queue-consumer.ts).
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { processEmailQueue } from "../../../tasks/email-queue-consumer.js"
import { processDiscordQueue } from "../../../tasks/discord-queue-consumer.js"
import { sendMessage } from "../../../clients/aws/sqs.js"
import { recorder, sqsAdvance, SQS_VISIBILITY_TIMEOUT_S } from "../../../test-utils/notif-char/fakes.js"
import { getKnex } from "../../../clients/database/knex-db.js"

describe("email queue", () => {
  it("a message scheduled in the future is never deleted and ends in the DLQ after 3 receives", async () => {
    await sendMessage(w.EMAIL_QUEUE(), {
      type: "digest_email",
      payload: { userId: "u", frequency: "daily" },
      metadata: { created_at: new Date().toISOString(), scheduled_at: new Date(Date.now() + 6 * 3600_000).toISOString() },
    })
    for (let i = 0; i < 4; i++) {
      await processEmailQueue()
      sqsAdvance(SQS_VISIBILITY_TIMEOUT_S * 1000)
    }
    await processEmailQueue()
    const r = recorder()
    expect({
      deleted: r.sqs.deleted.length,
      dlq: r.sqs.dlq.map((m) => (JSON.parse(m.body) as { type: string }).type),
      pending: r.sqs.queues.get(w.EMAIL_QUEUE())?.length ?? 0,
    }).toMatchInlineSnapshot(`
      {
        "deleted": 0,
        "dlq": [
          "digest_email",
        ],
        "pending": 0,
      }
    `)
  })

  it("an email for a user without a verified address is consumed and dropped", async () => {
    const u = await w.user("noemail", { email: "none" })
    await sendMessage(w.EMAIL_QUEUE(), {
      type: "notification_email",
      payload: { userId: u.user_id, notificationType: "order_create", data: {} },
      metadata: { created_at: new Date().toISOString(), priority: "normal" },
    })
    await processEmailQueue()
    const r = recorder()
    expect({ deleted: r.sqs.deleted.length, sent: r.email.length }).toMatchInlineSnapshot(`
      {
        "deleted": 1,
        "sent": 0,
      }
    `)
  })
})

describe("Discord bot reply queue", () => {
  it("thread_created: stores the thread id and posts the welcome message", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const order = await w.order("t1", { customer, assigned: seller })
    await sendMessage(w.BACKEND_QUEUE(), {
      type: "thread_created",
      payload: { thread_id: "800000000000000201", success: true },
      metadata: { original_order_id: order.order_id, entity_type: "order", created_at: new Date().toISOString() },
    })
    await processDiscordQueue()
    const row = await getKnex()("orders").where({ order_id: order.order_id }).first("thread_id")
    w.nameId("800000000000000201", "thread:t1")
    const obs = await w.observe()
    expect({ thread_id: String(row.thread_id), summary: w.summary(obs) }).toMatchInlineSnapshot(`
      {
        "summary": [
          "discord POST /channels/thread:t1/messages",
          "ERROR   Query error",
        ],
        "thread_id": "800000000000000201",
      }
    `)
    expect(obs.discord).toMatchSnapshot()
  })

  it("error reply (thread creation failed): discarded as an unknown type", async () => {
    const customer = await w.user("customer")
    const order = await w.order("t2", { customer })
    await sendMessage(w.BACKEND_QUEUE(), {
      type: "error",
      payload: { error: "Missing Access", success: false },
      metadata: { original_order_id: order.order_id, original_type: "create_thread", entity_type: "order", entity_id: order.order_id },
    })
    await processDiscordQueue()
    const r = recorder()
    const obs = await w.observe()
    expect({
      deleted: r.sqs.deleted.length,
      warnings: obs.warnings,
      errors: obs.errors,
    }).toMatchInlineSnapshot(`
      {
        "deleted": 1,
        "errors": [],
        "warnings": [
          "Unknown message type:",
        ],
      }
    `)
  })
})
