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
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_BUCKET_NAME?: string
  IMAGE_LAMBDA_NAME?: string
  
  // SQS Queues
  DISCORD_QUEUE_URL?: string
  BACKEND_QUEUE_URL?: string
  
  // SQS-specific AWS Credentials (separate from other AWS services)
  SQS_ACCESS_KEY_ID?: string
  SQS_SECRET_ACCESS_KEY?: string

  // Discord
  DISCORD_API_KEY?: string
  DISCORD_BOT_URL?: string

  // Database
  DATABASE_URL?: string

  // CDN
  CDN_URL?: string

  // API Keys
  SCAPI_KEY?: string
  NYDOO_KEY?: string
  NYDOO_EMAIL?: string

  // RSI/Spectrum
  RSI_TOKEN?: string
  RSI_DEVICE_ID?: string

  // Other
  NODE_ENV?: string
  PORT?: string
  SESSION_SECRET?: string

  [key: string]: string | undefined
}

export const env: Environment = process.env
