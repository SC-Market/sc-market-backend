import { createLogger, format, transports } from "winston"
import { env } from "../config/env.js"

const { Console } = transports

const formats = [
  format.timestamp(),
  format.printf(
    ({ timestamp, level, message, error, stack, cause, ...meta }) => {
      let logMessage = `${timestamp} [${level}]: ${message}`

      // Handle error objects specially
      if (error) {
        if (error instanceof Error) {
          logMessage += `\nError: ${error.message}`
          if (error.stack) {
            logMessage += `\nStack: ${error.stack}`
          }
        } else {
          logMessage += `\nError: ${String(error)}`
        }
      }

      // Handle stack trace if present
      if (stack) {
        logMessage += `\nStack: ${stack}`
      }

      // Handle cause if present
      if (cause) {
        logMessage += `\nCause: ${JSON.stringify(cause, null, 2)}`
      }

      // Handle additional metadata (excluding error-related fields)
      const cleanMeta = Object.keys(meta).filter(
        (key) => !["error", "stack", "cause"].includes(key),
      )

      if (cleanMeta.length > 0) {
        const filteredMeta = Object.fromEntries(
          cleanMeta.map((key) => [key, meta[key]]),
        )
        logMessage += `\nMetadata: ${JSON.stringify(filteredMeta, null, 2)}`
      }

      return logMessage
    },
  ),
]

if (env.NODE_ENV !== "production") {
  formats.push(format.colorize())
}

const logger = createLogger({
  level: env.LOG_LEVEL || "debug",
  format: format.combine(...formats),
  transports: [new Console()],
})

export default logger
