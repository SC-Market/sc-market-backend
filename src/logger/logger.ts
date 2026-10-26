import { createLogger, format, transports } from "winston"
import { env } from "../config/env.js"
import fs from "fs"
import path from "path"
import { currentLogContext } from "./log-context.js"
import { buildLogRecord, toLoggable, type LogInfo } from "./format.js"

const { Console, File } = transports

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs")
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const isProduction = env.NODE_ENV === "production"

/**
 * Production: one JSON object per line (see format.ts), so Lightsail keeps
 * each log call, including its stack and metadata, as a single event.
 */
const jsonLine = format.printf((info) =>
  JSON.stringify(buildLogRecord(info as LogInfo, currentLogContext())),
)

/** Development: human-readable, multi-line, coloured. Same redaction. */
const pretty = format.printf((info) => {
  const record = buildLogRecord(info as LogInfo, currentLogContext())
  const { ts, level, msg, request_id, method, route, user_id, error, ...meta } =
    record
  const where = request_id
    ? ` (${String(request_id).slice(0, 8)} ${method ?? ""} ${route ?? ""}${user_id ? ` user=${user_id}` : ""})`
    : ""
  let line = `${ts} [${level}]${where}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`
  if (error) {
    const e = error as { message?: string; stack?: string }
    if (e.stack) line += `\n${e.stack}`
    else if (e.message) line += `\nError: ${e.message}`
    else line += `\nError: ${JSON.stringify(toLoggable(error), null, 2)}`
    const rest = { ...(error as Record<string, unknown>) }
    delete rest.stack
    delete rest.message
    delete rest.name
    if (Object.keys(rest).length > 0) {
      line += `\nError details: ${JSON.stringify(rest, null, 2)}`
    }
  }
  if (Object.keys(meta).length > 0) {
    line += `\nMetadata: ${JSON.stringify(meta, null, 2)}`
  }
  return line
})

// Set log level based on environment:
// - Development: debug (most verbose)
// - Production: info (less verbose, no debug logs)
const logger = createLogger({
  level: isProduction ? "info" : "debug",
  format: isProduction
    ? format.combine(format.timestamp(), jsonLine)
    : format.combine(format.timestamp(), format.colorize(), pretty),
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
