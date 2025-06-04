import { createLogger, format, transports } from "winston"
import { env } from "../config/env.js"

const { Console } = transports

const formats = [format.errors({ stack: true }), format.json()]

if (env.NODE_ENV !== "production") {
  formats.push(format.colorize())
}

const logger = createLogger({
  level: env.LOG_LEVEL || "info",
  format: format.combine(...formats),
  transports: [new Console()],
})

export default logger
