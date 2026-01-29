import express, { Request, RequestHandler } from "express"
import compression from "compression"
import passport from "passport"
import cors, { CorsOptions } from "cors"
import session from "express-session"
import enableWS from "express-ws"
import wrapPGSession from "connect-pg-simple"
import pg from "pg"
import { hostname } from "os"
import { SitemapStream, streamToPromise } from "sitemap"
import { createGzip } from "zlib"
import { createServer } from "node:http"
import { Server } from "socket.io"
import { apiReference } from "@scalar/express-api-reference"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

import { apiRouter } from "./api/routes/v1/api-router.js"
import * as profileDb from "./api/routes/v1/profiles/database.js"
import * as contractorDb from "./api/routes/v1/contractors/database.js"
import * as recruitingDb from "./api/routes/v1/recruiting/database.js"
import * as marketDb from "./api/routes/v1/market/database.js"
import { userAuthorized } from "./api/middleware/auth.js"
import { errorHandler } from "./api/middleware/error-handler.js"
import { securityHeaders } from "./api/middleware/security-headers.js"
import { registrationRouter } from "./clients/discord_api/registration.js"
import { threadRouter } from "./clients/discord_api/threads.js"
import { trackActivity } from "./api/middleware/activity.js"
import { oapi } from "./api/routes/v1/openapi.js"
import { env } from "./config/env.js"
import { formatListingSlug } from "./api/routes/v1/market/helpers.js"
import { chatServer } from "./clients/messaging/websocket.js"
import { start_tasks } from "./tasks/tasks.js"
import {
  i18nMiddleware,
  addTranslationToRequestWithUser,
} from "./api/routes/v1/util/i18n.js"
import { adminOverride } from "./api/routes/v1/admin/middleware.js"
import { setupPassportStrategies } from "./api/util/passport-strategies.js"
import { setupAuthRoutes } from "./api/routes/auth-routes.js"
import logger from "./logger/logger.js"

import { createRequire } from "module"
const require = createRequire(import.meta.url)

const Bugsnag = require("@bugsnag/js")
import BugsnagPluginExpress from "@bugsnag/plugin-express"

const bugsnag = Bugsnag.start({
  apiKey: process.env.BUGSNAG_API_KEY || "",
  plugins: [BugsnagPluginExpress],
})

const SessionPool = pg.Pool

const deployEnvironment = env.NODE_ENV
const backend_url = new URL(env.BACKEND_URL || "http://localhost:7000")
const frontend_url = new URL(env.FRONTEND_URL || "http://localhost:5173")
const discord_backend_url = new URL(
  env.DISCORD_BACKEND_URL || "http://localhost:8081",
)
const discord_bot_url = new URL(env.DISCORD_BOT_URL || "http://localhost:8081")

const allowlist: string[] = [
  `http://${backend_url.host}`,
  `https://${backend_url.host}`,
  `http://${frontend_url.host}`,
  `https://${frontend_url.host}`,
  "https://discord.com",
  ...(env.PREMIUM_HOSTS || "").split(",").map((h) => `https://${h}`),
]

const corsOptions = function (
  req: Request,
  callback: (arg0: Error | null, arg1: CorsOptions) => void,
) {
  let corsOptions
  const origin = req.header("Origin")
  if (!origin || allowlist.indexOf(origin) !== -1) {
    corsOptions = {
      origin: true,
      credentials: true,
    } // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false } // disable CORS for this request
  }
  callback(null, corsOptions) // callback expects two parameters: error and options
}

const rootApp = express()
const bugsnagMiddleware = bugsnag.getPlugin("express")
rootApp.use(bugsnagMiddleware.requestHandler)
rootApp.use(bugsnagMiddleware.errorHandler)

const app = enableWS(rootApp).app

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

if (app.get("env") === "production") {
  app.set("trust proxy", 2) // trust first and second proxy
}

if (!env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in .env")
}

const isProduction = app.get("env") === "production"
const sessionMiddleware = session({
  secret: env.SESSION_SECRET!,
  name: "scmarket.sid",
  cookie: {
    secure: isProduction, // Only secure in production (HTTPS required)
    maxAge: 3600000 * 24 * 60,
    domain: env.BACKEND_HOST,
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

app.use(express.json({ limit: "2.5mb" }))
app.use(
  express.urlencoded({
    extended: true,
    limit: "2.5mb",
  }),
)

app.use(cors(corsOptions))
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
        `[Session] User ${id} not found during deserialization - invalidating session`,
      )
      return done(null, false)
    }
    // For other errors (database connection issues, etc.), log and invalidate
    logger.error(`[Session] Error deserializing user ${id}:`, { error })
    return done(null, false)
  }
})

// Setup passport strategies
setupPassportStrategies(backend_url)

app.use(passport.initialize())
app.use(passport.session())

app.use(trackActivity)

// Setup authentication routes
setupAuthRoutes(app, frontend_url)

let sitemap: Buffer

app.get("/sitemap.xml", async function (req, res) {
  try {
    res.header("Content-Type", "application/xml")
    res.header("Content-Encoding", "gzip")

    if (sitemap) {
      res.json(sitemap)
      return
    }

    const contractors = await contractorDb.getContractorListings({})
    const users = await profileDb.getUsersWhere({ rsi_confirmed: true })
    const recruit_posts = await recruitingDb.getAllRecruitingPosts()
    const market_listings = await marketDb.searchMarket(
      {
        sale_type: null,
        maxCost: null,
        minCost: 0,
        quantityAvailable: 1,
        item_type: null,
        index: 0,
        rating: 0,
        reverseSort: false,
        sort: "timestamp",
        query: "",
        seller_rating: 0,
        page_size: 0,
      },
      {
        status: "active",
        internal: "false",
      },
    )

    const user_routes = []
    for (const user of users) {
      user_routes.push(
        {
          url: `/user/${user.username}`,
          changefreq: "monthly",
          priority: 0.5,
        },
        {
          url: `/user/${user.username}/services`,
          changefreq: "monthly",
          priority: 0.4,
        },
        {
          url: `/user/${user.username}/market`,
          changefreq: "monthly",
          priority: 0.4,
        },
        {
          url: `/user/${user.username}/order`,
          changefreq: "yearly",
          priority: 0.2,
        },
        {
          url: `/user/${user.username}/reviews`,
          changefreq: "monthly",
          priority: 0.2,
        },
      )
    }

    const market_routes = []
    for (const listing of market_listings) {
      let type
      switch (listing.listing_type) {
        case "unique": {
          type = "market"
          break
        }
        case "aggregate": {
          type = "market/aggregate"
          break
        }
        case "multiple": {
          type = "market/multiple"
          break
        }
        default:
          type = "market"
      }
      market_routes.push({
        url: `/${type}/${listing.listing_id}/#/${formatListingSlug(listing.title)}`,
        changefreq: "weekly",
        priority: 0.8,
      })
    }

    const contractor_routes = []
    for (const contractor of contractors) {
      contractor_routes.push(
        {
          url: `/contractor/${contractor.spectrum_id}`,
          changefreq: "monthly",
          priority: 0.5,
        },
        {
          url: `/contractor/${contractor.spectrum_id}/services`,
          changefreq: "monthly",
          priority: 0.4,
        },
        {
          url: `/contractor/${contractor.spectrum_id}/market`,
          changefreq: "monthly",
          priority: 0.4,
        },
        // {
        //     url: `/contractor/${contractor.spectrum_id}/recruiting`,
        //     changefreq: 'monthly',
        //     priority: 0.3,
        // },
        {
          url: `/contractor/${contractor.spectrum_id}/order`,
          changefreq: "yearly",
          priority: 0.2,
        },
        {
          url: `/contractor/${contractor.spectrum_id}/members`,
          changefreq: "monthly",
          priority: 0.2,
        },
      )
    }

    const recruit_routes = []
    for (const post of recruit_posts) {
      recruit_routes.push({
        url: `/recruiting/post/${post.post_id}`,
        changefreq: "monthly",
        priority: 0.5,
      })
    }

    const pages = [
      {
        url: "/",
        changefreq: "monthly",
        priority: 1.0,
      },
      {
        url: "/market",
        changefreq: "always",
        priority: 1.0,
      },
      {
        url: "/recruiting",
        changefreq: "always",
        priority: 1.0,
      },
      {
        url: "/contractors",
        changefreq: "always",
        priority: 1.0,
      },
      {
        url: "/contracts",
        changefreq: "always",
        priority: 1.0,
      },
      {
        url: "/services",
        changefreq: "always",
        priority: 1.0,
      },
      ...contractor_routes,
      ...user_routes,
      ...recruit_routes,
      ...market_routes,
    ]

    try {
      const smStream = new SitemapStream({
        hostname: "https://sc-market.space/",
      })
      const pipeline = smStream.pipe(createGzip())

      // pipe your entries or directly write them.
      for (const page of pages) {
        smStream.write(page)
      }
      /* or use
            Readable.from([{url: '/page-1'}...]).pipe(smStream)
            if you are looking to avoid writing your own loop.
            */

      // cache the response
      streamToPromise(pipeline).then((sm) => (sitemap = sm))
      // make sure to attach a write stream such as streamToPromise before ending
      smStream.end()
      // stream write the response
      pipeline.pipe(res).on("error", (e) => {
        throw e
      })
    } catch (e) {
      logger.error("Error generating sitemap stream", { error: e })
      res.status(500).json({ error: "Big error" }).end()
    }
  } catch (e) {
    logger.error("Error generating sitemap", { error: e })
    res.status(400).json({ error: "Big error 2" }).end()
  }
})

app.use(oapi)
app.use("/swaggerui", userAuthorized, oapi.swaggerui())

app.use(
  "/docs",
  apiReference({
    url: "/openapi.json",
  }),
)

app.use(addTranslationToRequestWithUser)

app.use(adminOverride)

app.use("/api", apiRouter)

app.use(errorHandler)
const httpServer = createServer(app)
const io = new Server(httpServer, {
  path: "/ws",
  cors: {
    credentials: true,
    origin: allowlist,
  },
})

function onlyForHandshake(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    // @ts-ignore
    const isHandshake = req._query.sid === undefined
    if (isHandshake) {
      middleware(req, res, next)
    } else {
      next()
    }
  }
}

io.engine.use(onlyForHandshake(sessionMiddleware))
io.engine.use(onlyForHandshake(passport.session()))
io.engine.use(
  onlyForHandshake((req, res, next) => {
    if (req.user) {
      next()
    } else {
      next(new Error("Unauthorized"))
    }
  }),
)

chatServer.initialize(io)

// Start the app
logger.info(`server up on port ${hostname()}:${env.BACKEND_PORT || 7000}`)
httpServer.listen(env.BACKEND_PORT || 7000)

const discord_app = express()
discord_app.use(
  express.urlencoded({
    extended: true,
    limit: "2.5mb",
  }),
)
discord_app.use(express.json({ limit: "2.5mb" }))
discord_app.use("/register", registrationRouter)
discord_app.use("/threads", threadRouter)
discord_app.listen(discord_backend_url.port || 8081)
logger.info(
  `discord backend up on port ${hostname()}:${
    discord_backend_url.port || 8081
  }`,
)

start_tasks()
