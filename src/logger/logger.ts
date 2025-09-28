import { createLogger, format, transports } from "winston"
import { env } from "../config/env.js"
import fs from "fs"
import path from "path"

const { Console, File } = transports

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs")
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

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

// Set log level based on environment:
// - Development: debug (most verbose)
// - Production: info (less verbose, no debug logs)
const logger = createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: format.combine(...formats),
  transports: [
    // Console output (for development and Docker logs)
    new Console(),
    
    // Error log file (only errors)
    new File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    
    // Combined log file (all levels)
    new File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
})

export default logger
