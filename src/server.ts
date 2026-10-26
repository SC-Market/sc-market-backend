// Initialize Bugsnag FIRST — before any application imports that could crash.
// This ensures uncaughtException/unhandledRejection during module loading are captured.
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const Bugsnag = require("@bugsnag/js")
import BugsnagPluginExpress from "@bugsnag/plugin-express"
import { scrubBugsnagEvent } from "./logger/bugsnag-scrub.js"

const isDevelopment = process.env.NODE_ENV === "development"

const bugsnag = isDevelopment
  ? null
  : Bugsnag.start({
      apiKey: process.env.BUGSNAG_API_KEY || "",
      plugins: [BugsnagPluginExpress],
      enabledReleaseStages: ["production", "staging"],
      // Error reports are anonymous (the privacy policy says so, and the
      // cookie banner calls them "anonymous error reports"): no log
      // breadcrumbs, because log lines can carry user ids.
      enabledBreadcrumbTypes: ["error", "manual"],
      onError: (event: {
        request: Record<string, unknown>
        getMetadata: (section: string) => Record<string, unknown> | undefined
        clearMetadata: (section: string) => void
        addMetadata: (section: string, values: Record<string, unknown>) => void
      }) => {
        // plugin-express copies the client IP, headers (user agent,
        // CF-Connecting-IP, X-Forwarded-For), query, body and referer into
        // every event. Keep the method and the path only.
        const url = event.request.url
        event.request = {
          httpMethod: event.request.httpMethod,
          url: typeof url === "string" ? url.split(/[?#]/)[0] : undefined,
        }
        const meta = event.getMetadata("request")
        if (meta) {
          event.clearMetadata("request")
          event.addMetadata("request", {
            path: meta.path,
            httpMethod: meta.httpMethod,
          })
        }
        // The path can hold a token (/ingest/{token}, /unsubscribe/:token);
        // scrub it and messages/breadcrumbs with the log redaction.
        scrubBugsnagEvent(event)
      },
      // Never ship MFA codes, secrets or credentials in error reports.
      redactedKeys: [
        /code/i,
        /secret/i,
        /otpauth/i,
        /qr_data_url/i,
        /manual_key/i,
        /recovery/i,
        "authorization",
        "cookie",
        /token/i,
        /password/i,
      ],
    })

import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express"
import compression from "compression"
import cookieParser from "cookie-parser"
import passport from "passport"
import cors, { CorsOptions } from "cors"
import session from "express-session"
import enableWS from "express-ws"
import wrapPGSession from "connect-pg-simple"
import pg from "pg"
import { hostname } from "os"
import { createServer } from "node:http"
import { Server } from "socket.io"
import { apiReference } from "@scalar/express-api-reference"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

import { apiRouter } from "./api/routes/v1/api-router.js"
import { apiV1Router } from "./api/routes/v1/api-v1-router.js"
import { apiV2Router } from "./api/routes/v2/api-router.js"
import * as profileDb from "./api/routes/v1/profiles/database.js"
import { userAuthorized } from "./api/middleware/auth.js"
import { errorHandler, track500Responses } from "./api/middleware/error-handler.js"
import { securityHeaders } from "./api/middleware/security-headers.js"
import { bodyParsers } from "./api/middleware/body-parsers.js"
import { threadRouter } from "./clients/discord_api/threads.js"
import { channelSetupRouter } from "./clients/discord_api/channel-setups.js"
import { claimRouter } from "./clients/discord_api/claim.js"
import { trackActivity } from "./api/middleware/activity.js"
import { oapi } from "./api/routes/v1/openapi.js"
import { env } from "./config/env.js"
import { setupSitemapRoutes } from "./services/sitemap/sitemap.routes.js"
import { setupWellKnownRoutes } from "./services/well-known/well-known.routes.js"
import { chatServer } from "./clients/messaging/websocket.js"
import { start_tasks } from "./tasks/tasks.js"
import {
  i18nMiddleware,
  addTranslationToRequestWithUser,
} from "./api/routes/v1/util/i18n.js"
import { setupPassportStrategies } from "./api/util/passport-strategies.js"
import { setupAuthRoutes } from "./api/routes/auth-routes.js"
import logger from "./logger/logger.js"
import { requestContext } from "./logger/log-context.js"
import {
  cloudflareOnly,
  isRequestFromCloudflare,
  shouldEnforceCloudflareOrigin,
} from "./api/middleware/cloudflare-only.js"

const SessionPool = pg.Pool

const deployEnvironment = env.NODE_ENV
const backend_url = new URL(env.BACKEND_URL || "http://localhost:7000")
const frontend_url = new URL(env.FRONTEND_URL || "http://localhost:5173")
if (!env.BACKEND_PORT) {
  throw new Error(
    "BACKEND_PORT is not set. It must match the port the reverse proxy and the Lightsail publicEndpoint target, so there is no safe default to fall back to.",
  )
}
if (!env.DISCORD_BACKEND_URL) {
  throw new Error(
    "DISCORD_BACKEND_URL is not set. It determines the port the internal discord_app listens on, which the Discord bot must agree with.",
  )
}
const backend_port = env.BACKEND_PORT
const discord_backend_url = new URL(env.DISCORD_BACKEND_URL)
const discord_bot_url = new URL(env.DISCORD_BOT_URL || "http://localhost:8081")

import {
  isOriginAllowed,
  isOriginAllowedAsync,
} from "./api/util/allowed-origins.js"
import { csrfProtection } from "./api/middleware/csrf.js"
import { createSocketAllowRequest } from "./api/middleware/socket-origin.js"
import { customOriginGuard } from "./api/middleware/custom-origin.js"
import { applySiteRolePolicy } from "./api/util/site-admin-policy.js"
import { getMfaEnforcement } from "./services/mfa/config.js"

const corsOptions = function (
  req: Request,
  callback: (arg0: Error | null, arg1: CorsOptions) => void,
) {
  const origin = req.header("Origin")
  if (!origin) {
    callback(null, { origin: true, credentials: true })
    return
  }
  // Awaits a refresh when the custom-domain cache is stale, so a revoked
  // domain is not judged against the old list.
  isOriginAllowedAsync(origin).then(
    (allowed) =>
      callback(null, allowed ? { origin: true, credentials: true } : { origin: false }),
    () => callback(null, { origin: false }),
  )
}

const rootApp = express()

if (!isDevelopment && bugsnag) {
  const bugsnagMiddleware = bugsnag.getPlugin("express")
  rootApp.use(bugsnagMiddleware.requestHandler)
  rootApp.use(bugsnagMiddleware.errorHandler)
}

const app = enableWS(rootApp).app

if (app.get("env") === "production") {
  app.set("trust proxy", 2) // trust first and second proxy
}

// Request id (X-Request-Id in and out) and the logging context, so every log
// line of a request carries request_id, route and user_id. First, so even
// requests rejected by the guards below are correlated.
app.use(requestContext)

// Reject requests that reached the origin without passing through Cloudflare
// (e.g. via the *.cs.amazonlightsail.com URL, where X-Forwarded-For is
// caller-controlled and per-IP rate limits can be dodged). Runs before
// everything else on the public app; discord_app is a separate listener.
const enforceCloudflareOrigin = shouldEnforceCloudflareOrigin(env)
logger.info(
  `Cloudflare-only origin enforcement: ${enforceCloudflareOrigin ? "on" : "off"}`,
)
app.use(
  cloudflareOnly({
    enforce: enforceCloudflareOrigin,
    // Lightsail health check path (cdk lightsail-stack.ts).
    exemptPaths: ["/api/languages"],
  }),
)

// Configure response compression
// Compression is enabled with optimized settings:
// - threshold: Only compress responses larger than 1KB (saves CPU on small responses)
// - level: Compression level 6 (balanced between speed and compression ratio)
// - filter: Uses default compression filter which compresses text-based content types
//   (JSON, HTML, CSS, JS, XML, SVG, etc.) and skips already-compressed content
app.use(
  compression({
    threshold: 1024, // Only compress responses > 1KB (default is 1KB)
    level: 6, // Compression level 1-9 (6 is balanced, default is -1 which uses zlib default)
    // Default filter already handles:
    // - Text-based content types (JSON, HTML, CSS, JS, XML, SVG, etc.)
    // - Skips already-compressed content (gzip, deflate, br)
    // - Respects no-transform cache-control
  }),
)
app.use(securityHeaders())

// Serve favicon from src/public
import { readFileSync, existsSync } from "node:fs"
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
app.get("/favicon.ico", (req, res) => {
  try {
    // Try multiple paths: src/public (development) or dist/public (if copied during build)
    const possiblePaths = [
      join(__dirname, "public", "favicon.ico"), // dist/public if copied
      join(process.cwd(), "src", "public", "favicon.ico"), // src/public from project root
      join(__dirname, "..", "src", "public", "favicon.ico"), // src/public from dist/
    ]

    let faviconPath: string | null = null
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        faviconPath = path
        break
      }
    }

    if (!faviconPath) {
      res.status(404).send("Favicon not found")
      return
    }

    const favicon = readFileSync(faviconPath)
    res.setHeader("Content-Type", "image/x-icon")
    res.setHeader("Cache-Control", "public, max-age=31536000") // Cache for 1 year
    res.send(favicon)
  } catch (error) {
    res.status(404).send("Favicon not found")
  }
})

const pgSession = wrapPGSession(session)

const dbConfig: { [key: string]: string } = JSON.parse(env.DATABASE_PASS!)
const sessionDBaccess = new SessionPool({
  host: dbConfig.host || env.DATABASE_HOST || "localhost",
  user: dbConfig.username || env.DATABASE_USER || "postgres",
  password: dbConfig.password || env.DATABASE_PASS || "",
  database: dbConfig.dbname || env.DATABASE_TARGET || "postgres",
  port:
    (dbConfig.port as unknown as number) ||
    (env.DATABASE_PORT ? +env.DATABASE_PORT : 5431),
})

if (!env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in .env")
}

const isProduction = app.get("env") === "production"
const sessionMiddleware = session({
  secret: env.SESSION_SECRET!,
  name: "scmarket.sid",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // Only secure in production (HTTPS required)
    maxAge: 3600000 * 24 * 60,
    // Don't set domain — let the browser default to the origin that set the cookie.
    // This works for both same-origin (localhost) and cross-origin (api.sc-market.space)
    // with credentials: "include".
    // In production: SameSite=None requires Secure=true for cross-site cookies
    // In development: Use SameSite=Lax since we're on localhost (same-site)
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    path: "/",
  }, // Set to false, 60 days login
  store: new pgSession({
    pool: sessionDBaccess,
    tableName: "login_sessions",
    createTableIfMissing: true,
  }),
})

app.use(sessionMiddleware)
app.use(cookieParser())

app.use(bodyParsers())

// SCMDB ingest endpoint — token-authenticated, no cookies needed
app.options("/api/v2/integrations/scmdb/ingest/*", cors({ origin: "https://scmdb.net" }))
app.post("/api/v2/integrations/scmdb/ingest/*", cors({ origin: "https://scmdb.net" }))

app.use(cors(corsOptions))
// CSRF: unsafe methods need an allowed Origin and a JSON body (see csrf.ts).
// After cors() so a rejection still carries CORS headers for allowed origins
// and the frontend can read the error.
app.use(csrfProtection({ isOriginAllowed: isOriginAllowedAsync }))
// Sensitive routes (tokens, sessions, admin, account, email/links, transfers)
// are main-site only: a shop custom domain's JavaScript is the org's.
app.use(customOriginGuard)
app.use(track500Responses)
app.use(i18nMiddleware)

// Set up passport
passport.serializeUser((user: Express.User, done) => {
  done(null, user.user_id) // Express.User now extends our User type, so user_id is available
})
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await profileDb.getUser({ user_id: id })
    return done(null, user)
  } catch (e) {
    const error = e as Error
    // If user doesn't exist, gracefully invalidate the session
    // This prevents unnecessary error logging for legitimate session cleanup
    if (error.message === "Invalid user!") {
      logger.warn(
        `[Auth] User ${id} not found during deserialization - invalidating session`,
      )
      return done(null, false)
    }
    // For other errors (database connection issues, etc.), log and invalidate
    logger.error(`[Auth] Error deserializing user ${id}:`, { error })
    return done(null, false)
  }
})

// Setup passport strategies
setupPassportStrategies(backend_url)

app.use(passport.initialize())
app.use(passport.session())
// Re-enter the logging context: the session store's callbacks may not carry
// it (see logger/log-context.ts).
app.use(requestContext)

// Global auth: populate req.user on ALL requests (including public ones).
// Checks Bearer token, JWT cookie, then session (passport already ran).
// This means @Security("loggedin") in TSOA controllers only needs to check req.user.
import {
  isJWTAuthEnabled,
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "./api/util/jwt.js"
import { populateUser } from "./api/middleware/populate-user.js"

app.use(populateUser)

app.use(trackActivity)

// Setup authentication routes
setupAuthRoutes(app, frontend_url)

setupSitemapRoutes(app)

setupWellKnownRoutes(app)


app.use(oapi)
app.use("/swaggerui", userAuthorized, oapi.swaggerui())

app.use(
  "/docs",
  apiReference({
    sources: [
      {
        title: "V2 API",
        slug: "v2",
        url: "/api/v2/openapi.json",
        default: true,
      },
      {
        title: "V1 API",
        slug: "v1",
        url: "/api/v1/openapi.json",
      },
    ],
    theme: "purple",
  }),
)

app.use(addTranslationToRequestWithUser)

app.use("/api", apiRouter)
app.use("/api/v1", apiV1Router)
app.use("/api/v2", apiV2Router)

app.use(errorHandler)
const httpServer = createServer(app)
const io = new Server(httpServer, {
  path: "/ws",
  // Socket.IO handles /ws before Express, so it needs its own guards
  // (Cloudflare-only, and Origin: see socket-origin.ts).
  allowRequest: createSocketAllowRequest({
    enforceCloudflare: enforceCloudflareOrigin,
    isFromCloudflare: isRequestFromCloudflare,
    isOriginAllowed: isOriginAllowedAsync,
  }),
  cors: {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true)
      } else {
        callback(null, false)
      }
    },
  },
})

/**
 * engine.io invokes these middlewares with its own request object, which carries
 * the parsed handshake query under `_query`. cookieParser / sessionMiddleware /
 * passport.session decorate that same object, so it doubles as an Express request.
 */
type HandshakeRequest = Request & { _query: Record<string, string> }

function onlyForHandshake(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const isHandshake = (req as HandshakeRequest)._query.sid === undefined
    if (isHandshake) {
      middleware(req, res, next)
    } else {
      next()
    }
  }
}

// WebSocket auth: try JWT cookie first, fall back to session
io.engine.use(onlyForHandshake(cookieParser()))
io.engine.use(onlyForHandshake(sessionMiddleware))
io.engine.use(onlyForHandshake(passport.session()))
io.engine.use(
  onlyForHandshake(async (req: Request, res: Response, next: NextFunction) => {
    // Try JWT cookie auth first
    if (isJWTAuthEnabled()) {
      const accessToken = getAccessTokenFromRequest(req)
      if (accessToken) {
        const payload = verifyAccessToken(accessToken)
        if (payload) {
          try {
            const user = await profileDb.getUser({ user_id: payload.sub })
            if (user && !user.banned) {
              req.user = user
              req.auth = {
                method: "jwt",
                sid: payload.sid,
                mfaAt: payload.mfa_at,
                amr: payload.amr,
              }
              await applySiteRolePolicy(req)
              return next()
            }
          } catch { /* fall through to session */ }
        }
      }
    }
    // Fall back to session auth
    if (req.user) {
      req.auth = { method: "session" }
      await applySiteRolePolicy(req)
      return next()
    }
    next(new Error("Unauthorized"))
  }),
)

chatServer.initialize(io)

// Warm up caches before starting the server
import { attributeDefinitionCache } from "./api/routes/v1/attributes/cache.js"
attributeDefinitionCache.warmUp().catch((error) => {
  logger.error("Failed to warm up attribute definition cache", { error })
})

// Admin MFA enforcement state (logs an error if on but not configured).
logger.info(`Admin MFA enforcement: ${getMfaEnforcement()}`)

// Start the app
logger.info(`server up on port ${hostname()}:${backend_port}`)
httpServer.listen(backend_port)

const discord_app = express()
discord_app.use(
  express.urlencoded({
    extended: true,
    limit: "2.5mb",
  }),
)
discord_app.use(express.json({ limit: "2.5mb" }))
discord_app.use("/threads", threadRouter)
discord_app.use("/channel-setups", channelSetupRouter)
discord_app.use("/claim", claimRouter)
// discord_app has no caller authentication: it trusts the discord_id in the
// request body. It must therefore only be reachable by the bot, which shares
// the container network namespace in Lightsail and calls http://localhost:8081.
// Bind to loopback by default; DISCORD_APP_HOST exists only for setups where
// the bot runs in a separate network namespace (e.g. docker-compose).
const discord_app_host = env.DISCORD_APP_HOST || "127.0.0.1"
discord_app.listen(Number(discord_backend_url.port), discord_app_host)
logger.info(
  `discord backend up on ${discord_app_host}:${discord_backend_url.port}`,
)

start_tasks()
