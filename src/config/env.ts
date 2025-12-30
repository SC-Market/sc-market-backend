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

  // Database
  DATABASE_URL?: string

  // CDN
  CDN_URL?: string

  // Frontend URL (for notification links and assets)
  FRONTEND_URL?: string

  // API Keys
  SCAPI_KEY?: string
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

  // Other
  NODE_ENV?: string
  PORT?: string
  SESSION_SECRET?: string

  [key: string]: string | undefined
}

export const env: Environment = process.env
