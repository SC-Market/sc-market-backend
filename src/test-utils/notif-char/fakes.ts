/**
 * Recording fakes for every notification transport, for the characterization
 * suite. Each fake replaces the outermost library call (web-push, the AWS SDK
 * clients, @discordjs/rest, global fetch, the socket.io chat server) so that all
 * of SC Market's own code runs, and records what would have left the process.
 *
 * State lives on globalThis so the vi.mock factories in setup-file.ts and the
 * tests share one instance.
 */

export interface PushSent {
  endpoint: string
  payload: unknown
}
export interface SqsMessage {
  queueUrl: string
  messageId: string
  body: string
  delaySeconds: number
  /** Simulated time at which the message becomes visible. */
  visibleAt: number
  receiveCount: number
  receiptHandle: string | null
}
export interface EmailSent {
  to: string[]
  source: string
  subject: string
  html: string
  text: string
  replyTo?: string[]
  raw?: string
}
export interface DiscordCall {
  method: "get" | "post" | "put" | "patch" | "delete"
  route: string
  body?: unknown
}
export interface FetchCall {
  url: string
  method: string
  body: unknown
}
export interface LogCall {
  level: "error" | "warn" | "info" | "debug"
  message: string
  meta: unknown[]
}

/** SQS defaults from cdk/lib/email-queues-stack.ts. */
export const SQS_VISIBILITY_TIMEOUT_S = 300
export const SQS_MAX_RECEIVE_COUNT = 3

export interface Recorder {
  push: PushSent[]
  /** Push endpoints that answer with an HTTP error status. */
  pushFailures: Map<string, number>
  sqs: {
    sent: { queueUrl: string; body: unknown; delaySeconds: number }[]
    queues: Map<string, SqsMessage[]>
    dlq: SqsMessage[]
    deleted: { queueUrl: string; body: unknown }[]
    visibilityChanges: { queueUrl: string; seconds: number }[]
    /** Simulated SQS clock, in ms. */
    now: number
    seq: number
  }
  email: EmailSent[]
  discord: DiscordCall[]
  /** Discord routes that reject, keyed by route prefix: status + Discord error code. */
  discordFailures: Map<string, { status: number; code: number }>
  fetch: FetchCall[]
  fetchStatus: Map<string, number>
  websocket: unknown[]
  logs: LogCall[]
}

function freshRecorder(): Recorder {
  return {
    push: [],
    pushFailures: new Map(),
    sqs: {
      sent: [],
      queues: new Map(),
      dlq: [],
      deleted: [],
      visibilityChanges: [],
      now: 0,
      seq: 0,
    },
    email: [],
    discord: [],
    discordFailures: new Map(),
    fetch: [],
    fetchStatus: new Map(),
    websocket: [],
    logs: [],
  }
}

const g = globalThis as unknown as { __notifChar?: Recorder }

export function recorder(): Recorder {
  if (!g.__notifChar) g.__notifChar = freshRecorder()
  return g.__notifChar
}

export function resetRecorder(): void {
  g.__notifChar = freshRecorder()
}

// ---------------------------------------------------------------------------
// SQS simulation (standard queue, at-least-once, DLQ after maxReceiveCount)
// ---------------------------------------------------------------------------

export function sqsSend(queueUrl: string, body: string, delaySeconds = 0) {
  const r = recorder()
  const msg: SqsMessage = {
    queueUrl,
    messageId: `msg-${++r.sqs.seq}`,
    body,
    delaySeconds,
    visibleAt: r.sqs.now + delaySeconds * 1000,
    receiveCount: 0,
    receiptHandle: null,
  }
  const q = r.sqs.queues.get(queueUrl) ?? []
  q.push(msg)
  r.sqs.queues.set(queueUrl, q)
  r.sqs.sent.push({ queueUrl, body: JSON.parse(body), delaySeconds })
  return msg.messageId
}

export function sqsReceive(queueUrl: string, max: number) {
  const r = recorder()
  const q = r.sqs.queues.get(queueUrl) ?? []
  const out: SqsMessage[] = []
  for (const m of [...q]) {
    if (out.length >= max) break
    if (m.visibleAt > r.sqs.now) continue
    if (m.receiveCount >= SQS_MAX_RECEIVE_COUNT) {
      // Redrive policy: moved to the DLQ instead of being delivered again.
      q.splice(q.indexOf(m), 1)
      r.sqs.dlq.push(m)
      continue
    }
    m.receiveCount++
    m.receiptHandle = `${m.messageId}#${m.receiveCount}`
    m.visibleAt = r.sqs.now + SQS_VISIBILITY_TIMEOUT_S * 1000
    out.push(m)
  }
  return out
}

export function sqsDelete(queueUrl: string, receiptHandle: string) {
  const r = recorder()
  const q = r.sqs.queues.get(queueUrl) ?? []
  const i = q.findIndex((m) => m.receiptHandle === receiptHandle)
  if (i >= 0) {
    r.sqs.deleted.push({ queueUrl, body: JSON.parse(q[i].body) })
    q.splice(i, 1)
  }
}

export function sqsChangeVisibility(queueUrl: string, receiptHandle: string, seconds: number) {
  const r = recorder()
  const m = (r.sqs.queues.get(queueUrl) ?? []).find((x) => x.receiptHandle === receiptHandle)
  if (m) m.visibleAt = r.sqs.now + seconds * 1000
  r.sqs.visibilityChanges.push({ queueUrl, seconds })
}

/** Advance the simulated SQS clock. */
export function sqsAdvance(ms: number) {
  recorder().sqs.now += ms
}

export function sqsPending(queueUrl: string): unknown[] {
  return (recorder().sqs.queues.get(queueUrl) ?? []).map((m) => JSON.parse(m.body))
}
