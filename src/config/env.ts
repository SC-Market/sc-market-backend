import dotenv from "dotenv"

dotenv.config()

if (process.env.AWS_ACCESS_KEYS) {
  const items: { [key: string]: string } = JSON.parse(
    process.env.AWS_ACCESS_KEYS,
  )
  for (const entry in items) {
    process.env[entry] = items[entry]
  }
}

// Environment variable interface
interface Environment {
  // AWS
  AWS_REGION?: string
  S3_BUCKET_NAME?: string
  IMAGE_LAMBDA_NAME?: string

  // SQS Queues
  DISCORD_QUEUE_URL?: string
  BACKEND_QUEUE_URL?: string

  // Backend AWS Credentials (for SQS, Lambda, and other services)
  BACKEND_ACCESS_KEY_ID?: string
  BACKEND_SECRET_ACCESS_KEY?: string
  BACKEND_ROLE_ARN?: string

  // Discord
  DISCORD_API_KEY?: string
  DISCORD_BOT_URL?: string
  DISCORD_PUBLIC_KEY?: string
  // Interface the internal discord_app binds to. Defaults to 127.0.0.1; the
  // app is unauthenticated, so only widen this inside a private network.
  DISCORD_APP_HOST?: string

  // Database
  DATABASE_URL?: string

  // CDN
  CDN_URL?: string

  // Frontend URL (for notification links and assets)
  FRONTEND_URL?: string

  // API Keys
  NYDOO_KEY?: string
  NYDOO_EMAIL?: string

  // RSI/Spectrum
  RSI_TOKEN?: string
  RSI_DEVICE_ID?: string

  // Push Notifications (Web Push Protocol)
  // Generate VAPID keys using: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string // Usually a mailto: URL or website URL (e.g., "mailto:admin@sc-market.space")

  // Email Notifications (AWS SES)
  EMAIL_QUEUE_URL?: string // SQS queue URL for email processing
  AWS_SES_REGION?: string // AWS region for SES (defaults to AWS_REGION)
  EMAIL_FROM_NAME?: string // From name for emails (e.g., "SC Market")
  EMAIL_FROM_ADDRESS?: string // From email address (must be verified in SES)
  EMAIL_REPLY_TO?: string // Reply-to email address (optional)
  // ARN of the SNS topic SES publishes bounce, complaint and delivery
  // notifications to (POST /api/webhooks/ses/feedback). Unset or malformed:
  // the webhook refuses every request.
  SES_FEEDBACK_SNS_TOPIC_ARN?: string

  // Staff alerts for new storefront enquiries (services/storefront/staff-alerts.ts).
  // Unset: that channel is skipped (a warning is logged once at startup).
  STAFF_ALERT_EMAIL?: string // Staff inbox for the alert email (sent through SES)
  STAFF_DISCORD_WEBHOOK_URL?: string // Discord webhook for the staff channel (secret: never logged)
  // Webhook and Discord alert-channel posts through notify() (Phase 5,
  // services/notify/destination-cutover.ts): "all", or a comma-separated
  // list of "<channel>:<event>" routes / "<channel>:*". Unset: none live, the
  // legacy senders post and notify() runs in shadow mode.
  NOTIFY_DESTINATIONS_LIVE?: string
  // "off" disables the destination shadow comparison.
  NOTIFY_DESTINATIONS_SHADOW?: string

  // Cloudflare Pages deploy hook of the frontend's production branch, POSTed
  // after a successful game-data import so the prerendered game-data pages
  // rebuild (services/game-data/pages-deploy-hook.ts; at most once per 30
  // min). A secret: never logged. Unset: no rebuild (warned once at startup).
  CF_PAGES_DEPLOY_HOOK_URL?: string

  // Other
  NODE_ENV?: string
  // "true" | "false": reject requests that bypass Cloudflare. Unset means on
  // in production, off elsewhere (see api/middleware/cloudflare-only.ts).
  ENFORCE_CLOUDFLARE_ORIGIN?: string
  BACKEND_PORT?: string // Port the public API listens on; required, no default
  SESSION_SECRET?: string

  // JWT Authentication
  JWT_SECRET?: string          // Signing key for JWTs (falls back to SESSION_SECRET)
  JWT_AUTH_ENABLED?: string    // "true" to enable JWT auth, anything else = session auth

  [key: string]: string | undefined
}

export const env: Environment = process.env
