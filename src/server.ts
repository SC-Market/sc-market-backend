import express, { Request, RequestHandler } from "express"
import compression from "compression"
import passport from "passport"
import cors, { CorsOptions } from "cors"
import session from "express-session"

import { Profile, Strategy } from "passport-discord"
import refresh from "passport-oauth2-refresh"

import * as oauth2 from "passport-oauth2"
import { User } from "./api/routes/v1/api-models.js"
import enableWS from "express-ws"
import wrapPGSession from "connect-pg-simple"
import pg from "pg"
import { apiRouter } from "./api/routes/v1/api-router.js"
import { database } from "./clients/database/knex-db.js"
import { hostname } from "os"
import { adminAuthorized, errorHandler } from "./api/middleware/auth.js"
import { SitemapStream, streamToPromise } from "sitemap"
import { createGzip } from "zlib"
import { registrationRouter } from "./clients/discord_api/registration.js"
import { threadRouter } from "./clients/discord_api/threads.js"
import {
  process_auctions,
  process_expiring_market_listings,
  rebuild_search_view,
  update_price_history,
} from "./api/routes/v1/util/timers.js"
import { trackActivity } from "./api/middleware/activity.js"
import { messagingHandler } from "./clients/messaging/messaging.js"
import { createServer } from "node:http"
import { envoyManager } from "./clients/messaging/envoy.js"
import { oapi } from "./api/routes/v1/openapi.js"
import { env } from "./config/env.js"
import { formatListingSlug } from "./api/routes/v1/market/helpers.js"

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

const passportConfig = {
  // The Client Id for your discord application (See "Discord Application Setup")
  clientID: env.DISCORD_CLIENT_ID || "wumpus",

  // The Client Secret for your discord application (See "Discord Application Setup")
  clientSecret: env.DISCORD_CLIENT_SECRET || "supmuw",

  // The callback URL - Your app should be accessible on this domain. You can use
  // localhost for testing, just makes sure it's set as a Redirect URL (See "Discord Application Setup")
  callbackURL: new URL("auth/discord/callback", backend_url).toString(),

  /* Optional items: */

  // The scope for your OAuth request - You can use strings or Scope values
  // The default scope is Scope.IDENTIFY which gives basic profile information
  scope: ["identify"], // 'email', 'guilds'
}

const app = enableWS(express()).app

app.use(compression())

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

const sessionMiddleware = session({
  secret: env.SESSION_SECRET || "set this var",
  cookie: {
    secure: app.get("env") === "production",
    maxAge: 3600000 * 24 * 60,
  }, // Set to false, 60 days login
  store: new pgSession({
    pool: sessionDBaccess,
    tableName: "login_sessions",
    createTableIfMissing: true,
  }),
})

app.use(sessionMiddleware)

app.use(express.json({ limit: "2mb" }))
app.use(express.urlencoded({
  extended: true,
  limit: "2mb",
}))

app.use(cors(corsOptions))
app.use(express.json())

// Set up passport
passport.serializeUser((user: Express.User, done) => {
  done(null, (user as User).user_id) // user.id
})
passport.deserializeUser(async (id: string, done) => {
  // Retrieve a User object from database given an ID
  try {
    done(null, await database.getUser({ user_id: id }))
  } catch (e) {
    return null
  }
})

// Set up the Discord Strategy
const strategy = new Strategy(
  passportConfig,
  async (
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    cb: oauth2.VerifyCallback,
  ) => {
    profile.username = "new_user" + profile.id
    profile.displayName = "new_user" + profile.id

    cb(null, await database.insertUser(profile, accessToken, refreshToken))
  },
)

database.setStrategy(strategy)

passport.use(strategy)
refresh.use(strategy)

app.use(passport.initialize())
app.use(passport.session())

app.get("/logout", function (req, res) {
  req.logout({ keepSessionInfo: false }, (err) => {
    console.log(err)
  })
  res.redirect(frontend_url.toString() || "/")
})

app.use(trackActivity)

// Connect passport to express/connect/etc
app.get("/auth/discord", async (req, res, next) => {
  const query = req.query as { path?: string }
  const path = query.path

  return passport.authenticate("discord", { session: true, state: path })(
    req,
    res,
    next,
  )
})
app.get("/auth/discord/callback", async (req, res, next) => {
  const query = req.query as { state?: string }
  const state = query.state

  return passport.authenticate("discord", {
    failureRedirect: frontend_url.toString(),
    successRedirect: new URL(state || "", frontend_url).toString(),
    session: true,
  })(req, res, next)
})

let sitemap: Buffer

app.get("/sitemap.xml", async function (req, res) {
  try {
    res.header("Content-Type", "application/xml")
    res.header("Content-Encoding", "gzip")

    if (sitemap) {
      res.send(sitemap)
      return
    }

    const contractors = await database.getContractorListings({})
    const users = await database.getUsersWhere({ rsi_confirmed: true })
    const recruit_posts = await database.getAllRecruitingPosts()
    const market_listings = await database.searchMarket(
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
      console.error(e)
      res.status(500).json({ error: "Big error" }).end()
    }
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Big error 2" }).end()
  }
})

app.use(oapi)
app.use("/swaggerui", adminAuthorized, oapi.swaggerui())

app.use("/api", apiRouter)
messagingHandler.register(app)

app.use(errorHandler)
const httpServer = createServer(app)
envoyManager.register(httpServer, allowlist)

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

envoyManager.envoy.io.engine.use(onlyForHandshake(sessionMiddleware))
envoyManager.envoy.io.engine.use(onlyForHandshake(passport.initialize()))
envoyManager.envoy.io.engine.use(onlyForHandshake(passport.session()))
envoyManager.envoy.io.engine.use(
  onlyForHandshake((req, res, next) => {
    if (req.user) {
      next()
    } else {
      res.writeHead(401)
      res.end()
    }
  }),
)

envoyManager.initialize()

// Start the app
console.log(`server up on port ${hostname()}:${env.BACKEND_PORT || 80}`)
httpServer.listen(env.BACKEND_PORT || 80)

const discord_app = express()
discord_app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  }),
)
discord_app.use(express.json({ limit: "2mb" }))
discord_app.use("/register", registrationRouter)
discord_app.use("/threads", threadRouter)
discord_app.listen(discord_backend_url.port || 8081)
console.log(
  `discord backend up on port ${hostname()}:${
    discord_backend_url.port || 8081
  }`,
)

process_auctions()
setInterval(process_auctions, 5 * 60 * 1000) // 5 minutes

process_expiring_market_listings()
setInterval(process_expiring_market_listings, 60 * 60 * 1000) // 1 hour

rebuild_search_view()
setInterval(rebuild_search_view, 5 * 60 * 1000) // 5 minutes

update_price_history()
setInterval(rebuild_search_view, 6 * 60 * 60 * 1000) // 6 hours, twice as long as needed
