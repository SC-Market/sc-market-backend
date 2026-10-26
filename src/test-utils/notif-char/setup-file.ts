/**
 * Per-test-file setup for the notification characterization suite.
 *
 * - Creates this file's own database from the template built in global-setup
 *   and points the app's knex singleton at it (DATABASE_PASS is read when
 *   clients/database/knex-db.ts is first imported, which happens after this).
 * - Replaces every transport with the recording fakes in fakes.ts.
 * - Before each test: empties every table that is empty in the template (so
 *   seeded reference data such as notification_actions stays) and resets the
 *   recorder.
 */
import { afterAll, beforeEach, inject, vi } from "vitest"
import pg from "pg"
import {
  recorder,
  resetRecorder,
  sqsChangeVisibility,
  sqsDelete,
  sqsReceive,
  sqsSend,
} from "./fakes.js"

declare module "vitest" {
  export interface ProvidedContext {
    notifChar: { socketDir: string; template: string; truncate: string[] }
  }
}

const ctx = inject("notifChar")
const dbName = `nc_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
{
  const admin = new pg.Client({ host: ctx.socketDir, user: "postgres", database: "postgres" })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${dbName} TEMPLATE ${ctx.template}`)
  await admin.end()
}
process.env.DATABASE_PASS = JSON.stringify({
  host: ctx.socketDir,
  username: "postgres",
  password: "",
  dbname: dbName,
  port: 5432,
})

const resetClient = new pg.Client({ host: ctx.socketDir, user: "postgres", database: dbName })
await resetClient.connect()

beforeEach(async () => {
  resetRecorder()
  const { resetWorld } = await import("./world.js")
  resetWorld()
  if (ctx.truncate.length) {
    await resetClient.query(
      `TRUNCATE ${ctx.truncate.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    )
  }
  // game_items is reference data (the real catalogue); drop only test items.
  await resetClient.query(`DELETE FROM game_items WHERE name LIKE 'CharTest %'`)
})

afterAll(async () => {
  try {
    const { database } = await import("../../clients/database/knex-db.js")
    await database.knex.destroy()
  } catch {
    // never imported by this file
  }
  await resetClient.end()
  const admin = new pg.Client({ host: ctx.socketDir, user: "postgres", database: "postgres" })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
  await admin.end()
})

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

// Web push: the VAPID HTTP request to the browser's push service.
vi.mock("web-push", () => {
  const sendNotification = async (
    sub: { endpoint: string },
    payload: string,
  ) => {
    const r = recorder()
    const status = r.pushFailures.get(sub.endpoint)
    if (status) {
      const err = new Error(`Received unexpected response code ${status}`) as Error & {
        statusCode: number
      }
      err.statusCode = status
      throw err
    }
    r.push.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
    return { statusCode: 201 }
  }
  const api = { setVapidDetails: () => {}, sendNotification }
  return { default: api, ...api }
})

// AWS: STS role assumption, SQS and SES.
vi.mock("@aws-sdk/client-sts", () => {
  class AssumeRoleCommand {
    constructor(public input: unknown) {}
  }
  class STSClient {
    async send() {
      return {
        Credentials: {
          AccessKeyId: "AKIAFAKE",
          SecretAccessKey: "fake",
          SessionToken: "fake",
          Expiration: new Date(Date.now() + 3600_000),
        },
      }
    }
  }
  return { STSClient, AssumeRoleCommand }
})

vi.mock("@aws-sdk/client-sqs", () => {
  class Cmd {
    constructor(public input: Record<string, unknown>) {}
  }
  class SendMessageCommand extends Cmd {}
  class ReceiveMessageCommand extends Cmd {}
  class DeleteMessageCommand extends Cmd {}
  class ChangeMessageVisibilityCommand extends Cmd {}
  class SQSClient {
    async send(cmd: Cmd) {
      const i = cmd.input as Record<string, never>
      if (cmd instanceof SendMessageCommand) {
        return { MessageId: sqsSend(i.QueueUrl, i.MessageBody, i.DelaySeconds ?? 0) }
      }
      if (cmd instanceof ReceiveMessageCommand) {
        const msgs = sqsReceive(i.QueueUrl, i.MaxNumberOfMessages ?? 1)
        return {
          Messages: msgs.length
            ? msgs.map((m) => ({
                MessageId: m.messageId,
                Body: m.body,
                ReceiptHandle: m.receiptHandle,
                Attributes: { ApproximateReceiveCount: String(m.receiveCount) },
              }))
            : undefined,
        }
      }
      if (cmd instanceof DeleteMessageCommand) {
        sqsDelete(i.QueueUrl, i.ReceiptHandle)
        return {}
      }
      if (cmd instanceof ChangeMessageVisibilityCommand) {
        sqsChangeVisibility(i.QueueUrl, i.ReceiptHandle, i.VisibilityTimeout)
        return {}
      }
      throw new Error(`fake SQS: unsupported command ${cmd.constructor.name}`)
    }
  }
  return {
    SQSClient,
    SendMessageCommand,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    ChangeMessageVisibilityCommand,
  }
})

vi.mock("@aws-sdk/client-ses", () => {
  class Cmd {
    constructor(public input: Record<string, never>) {}
  }
  class SendEmailCommand extends Cmd {}
  class SendRawEmailCommand extends Cmd {}
  class SESClient {
    async send(cmd: Cmd) {
      const i = cmd.input as Record<string, any>
      if (cmd instanceof SendEmailCommand) {
        recorder().email.push({
          to: i.Destination.ToAddresses,
          source: i.Source,
          subject: i.Message.Subject.Data,
          html: i.Message.Body.Html?.Data ?? "",
          text: i.Message.Body.Text?.Data ?? "",
          replyTo: i.ReplyToAddresses,
        })
        return { MessageId: `ses-${recorder().email.length}` }
      }
      if (cmd instanceof SendRawEmailCommand) {
        const raw = Buffer.from(i.RawMessage.Data).toString("utf8")
        recorder().email.push({
          to: i.Destinations ?? [],
          source: i.Source ?? "",
          subject: /^Subject: (.*)$/m.exec(raw)?.[1] ?? "",
          html: "",
          text: "",
          raw,
        })
        return { MessageId: `ses-${recorder().email.length}` }
      }
      throw new Error(`fake SES: unsupported command ${cmd.constructor.name}`)
    }
  }
  return { SESClient, SendEmailCommand, SendRawEmailCommand }
})

// Discord REST (bot token): DMs, thread and channel messages.
vi.mock("@discordjs/rest", () => {
  function call(method: "get" | "post" | "put" | "patch" | "delete") {
    return async (route: string, opts?: { body?: unknown }) => {
      const r = recorder()
      r.discord.push({ method, route, body: opts?.body })
      for (const [prefix, f] of r.discordFailures) {
        if (route.startsWith(prefix)) {
          const err = new Error(`Discord API ${f.status} (${f.code})`) as Error & {
            status: number
            code: number
          }
          err.status = f.status
          err.code = f.code
          throw err
        }
      }
      if (method === "post" && route === "/users/@me/channels") {
        const recipient = (opts?.body as { recipient_id: string }).recipient_id
        return { id: `dm-${recipient}`, type: 1 }
      }
      if (method === "post" && route.endsWith("/messages")) {
        return { id: `m-${r.discord.length}` }
      }
      if (method === "post" && route.endsWith("/invites")) {
        return { code: `inv${r.discord.length}` }
      }
      return {}
    }
  }
  class REST {
    setToken() {
      return this
    }
    get = call("get")
    post = call("post")
    put = call("put")
    patch = call("patch")
    delete = call("delete")
  }
  return { REST }
})

// Logger: recorded, not printed (set NOTIF_CHAR_LOGS=1 to print errors/warnings).
vi.mock("../../logger/logger.js", () => {
  const log =
    (level: "error" | "warn" | "info" | "debug") =>
    (message: unknown, ...meta: unknown[]) => {
      recorder().logs.push({ level, message: String(message), meta })
      if (process.env.NOTIF_CHAR_LOGS && (level === "error" || level === "warn")) {
        console.log(`[${level}]`, message, ...meta)
      }
    }
  const logger = {
    error: log("error"),
    warn: log("warn"),
    info: log("info"),
    debug: log("debug"),
  }
  return { default: logger }
})

// Outbound HTTP (notification webhooks): global fetch.
vi.stubGlobal("fetch", async (url: string | URL, init?: { method?: string; body?: string }) => {
  const r = recorder()
  const u = String(url)
  let body: unknown = init?.body
  try {
    body = init?.body ? JSON.parse(init.body) : undefined
  } catch {
    // not JSON
  }
  r.fetch.push({ url: u, method: (init?.method ?? "GET").toUpperCase(), body })
  const status = r.fetchStatus.get(u) ?? 204
  return new Response(status === 204 ? null : "fake", { status })
})

// Websocket: the socket.io chat server's broadcast.
{
  const { chatServer } = await import("../../clients/messaging/websocket.js")
  chatServer.emitMessage = (message: unknown) => {
    recorder().websocket.push(message)
  }
}
