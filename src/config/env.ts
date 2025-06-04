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

export const env = process.env
