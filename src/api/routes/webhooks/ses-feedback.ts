/**
 * POST /api/webhooks/ses/feedback: SES bounce, complaint and delivery
 * notifications, delivered by an Amazon SNS HTTPS subscription
 * (services/email/email-feedback.ts has what each one does).
 *
 * Authentication is SNS's own message signature, checked on every request
 * (services/email/sns-signature.ts): the message must be signed by an AWS SNS
 * certificate and come from the one configured topic,
 * SES_FEEDBACK_SNS_TOPIC_ARN. Unset or malformed topic: every request is
 * refused (503), so the endpoint is closed until it is configured. Unsigned,
 * badly signed, foreign-topic or stale messages: 403. Nothing in the request
 * besides the verified body is trusted.
 *
 * Mounted in server.ts before sessions, cookies, CORS, CSRF and passport: it
 * reads no browser credential and opens no session. SNS posts text/plain
 * JSON; this router parses its own body (any content type, 256 kB).
 *
 * - SubscriptionConfirmation (verified, our topic): confirmed by fetching its
 *   SubscribeURL, which must be an SNS ConfirmSubscription URL for the topic.
 * - Notification: applied once per MessageId (email_feedback_events), in one
 *   transaction; a failure answers 500 so SNS retries.
 * - UnsubscribeConfirmation: logged, nothing else (no automatic resubscribe).
 */
import express, { type Request, type Response, type NextFunction } from "express"
import type { Knex } from "knex"
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible"
import { env } from "../../../config/env.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import logger from "../../../logger/logger.js"
import {
  expectedTopicArn,
  isSnsUrl,
  verifySnsMessage,
  type CertFetcher,
  type SnsMessage,
} from "../../../services/email/sns-signature.js"
import {
  claimFeedbackMessage,
  parseSesNotification,
  pruneFeedbackEvents,
} from "../../../services/email/email-feedback.js"
import { emailService } from "../../../services/email/email.service.js"

/** Per client IP, per instance. SES sends one notification per email event. */
export const SES_FEEDBACK_RATE_LIMIT = { points: 600, duration: 60 } as const

const PRUNE_EVERY_MS = 60 * 60 * 1000

export interface SesFeedbackDeps {
  topicArn: () => string | null
  db: () => Knex
  fetchCert?: CertFetcher
  /** GET the SubscribeURL of a verified SubscriptionConfirmation. */
  confirmSubscription: (url: string) => Promise<void>
  now?: () => Date
}

/** A SubscribeURL we will fetch: an SNS ConfirmSubscription URL for our topic. */
export function isConfirmSubscriptionUrl(value: string, topicArn: string): boolean {
  if (!isSnsUrl(value)) return false
  const url = new URL(value)
  return (
    url.searchParams.get("Action") === "ConfirmSubscription" &&
    url.searchParams.get("TopicArn") === topicArn &&
    !!url.searchParams.get("Token")
  )
}

async function confirmSubscriptionViaGet(url: string): Promise<void> {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`ConfirmSubscription failed: ${res.status}`)
}

export const defaultSesFeedbackDeps: SesFeedbackDeps = {
  topicArn: () => expectedTopicArn(env.SES_FEEDBACK_SNS_TOPIC_ARN),
  db: () => getKnex(),
  confirmSubscription: confirmSubscriptionViaGet,
}

async function applyNotification(db: Knex, message: SnsMessage): Promise<string> {
  const feedback = parseSesNotification(message.Message)
  if (feedback.kind === "ignored") return `ignored:${feedback.reason}`
  const applied = await db.transaction(async (trx) => {
    if (!(await claimFeedbackMessage(trx, message.MessageId, feedback.kind))) {
      return false
    }
    for (const recipient of feedback.recipients) {
      if (feedback.kind === "delivery") {
        await emailService.handleDelivery(recipient, trx)
      } else {
        await emailService.handleBounce(
          recipient,
          feedback.kind === "complaint" ? "complaint" : feedback.bounceType,
          feedback.subtype,
          trx,
        )
      }
    }
    return true
  })
  return applied ? feedback.kind : "duplicate"
}

export function createSesFeedbackRouter(deps: SesFeedbackDeps = defaultSesFeedbackDeps) {
  const router = express.Router()
  const limiter = new RateLimiterMemory({ keyPrefix: "ses_feedback_ip", ...SES_FEEDBACK_RATE_LIMIT })
  let lastPrune = 0

  router.post(
    "/feedback",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await limiter.consume(req.ip || "unknown")
        next()
      } catch (e) {
        if (!(e instanceof RateLimiterRes)) return next(e)
        res.setHeader("Retry-After", String(Math.ceil(e.msBeforeNext / 1000)))
        res.status(429).json({ error: "rate_limited" })
      }
    },
    express.text({ type: () => true, limit: "256kb" }),
    async (req: Request, res: Response) => {
      const topicArn = deps.topicArn()
      if (!topicArn) {
        logger.error("[ses-feedback] refused: SES_FEEDBACK_SNS_TOPIC_ARN is not set or malformed")
        res.status(503).json({ error: "not_configured" })
        return
      }
      const raw = typeof req.body === "string" ? req.body : ""
      const verified = await verifySnsMessage(raw, {
        topicArn,
        fetchCert: deps.fetchCert,
        now: deps.now?.(),
      })
      if (!verified.ok) {
        logger.warn("[ses-feedback] refused unverified message", {
          reason: verified.reason,
          snsMessageType: req.get("x-amz-sns-message-type"),
        })
        res.status(verified.reason === "malformed" ? 400 : 403).json({ error: verified.reason })
        return
      }
      const message = verified.message

      try {
        if (message.Type === "SubscriptionConfirmation") {
          if (!message.SubscribeURL || !isConfirmSubscriptionUrl(message.SubscribeURL, topicArn)) {
            logger.warn("[ses-feedback] refused SubscribeURL", { messageId: message.MessageId })
            res.status(403).json({ error: "bad_subscribe_url" })
            return
          }
          await deps.confirmSubscription(message.SubscribeURL)
          logger.info("[ses-feedback] SNS subscription confirmed", { topicArn })
          res.status(200).json({ ok: true })
          return
        }
        if (message.Type === "UnsubscribeConfirmation") {
          logger.warn("[ses-feedback] SNS subscription removed", { topicArn })
          res.status(200).json({ ok: true })
          return
        }

        const db = deps.db()
        const outcome = await applyNotification(db, message)
        logger.info("[ses-feedback] notification processed", {
          messageId: message.MessageId,
          outcome,
        })
        const now = Date.now()
        if (now - lastPrune > PRUNE_EVERY_MS) {
          lastPrune = now
          pruneFeedbackEvents(db).catch((error) =>
            logger.warn("[ses-feedback] prune failed", { error }),
          )
        }
        res.status(200).json({ ok: true })
      } catch (error) {
        logger.error("[ses-feedback] processing failed", {
          error,
          messageId: message.MessageId,
          type: message.Type,
        })
        res.status(500).json({ error: "processing_failed" })
      }
    },
  )

  // Body too large, bad encoding: answer without echoing anything.
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status) || 400
        : 500
    res.status(status >= 400 && status < 500 ? status : 500).json({ error: "bad_request" })
  })

  return router
}

export const sesFeedbackRouter = createSesFeedbackRouter()
