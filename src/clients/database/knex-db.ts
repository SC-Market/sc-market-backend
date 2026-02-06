import Knex, { Knex as KnexClass } from "knex"
import { Profile, Strategy } from "passport-discord"
import { LRUCache } from "lru-cache"
import { RateLimiterPostgres } from "rate-limiter-flexible"
import { RESTGetAPIUserResult, Routes } from "discord-api-types/v10"
import { rest } from "../../services/discord/discord.service.js"
import pg from "pg"
import { env } from "../../config/env.js"
import { Database } from "./db-driver.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as tokenRefreshUtil from "../../api/util/token-refresh.js"
import logger from "../../logger/logger.js"
import { enableQueryMonitoring } from "./query-monitor.js"

pg.types.setTypeParser(1114, (s: string) => new Date(s.replace(" ", "T") + "Z"))

const dbConfig: {
  [key: string]: string
} = JSON.parse(env.DATABASE_PASS!)

export interface CachedDiscordUser {
  id: string
  username: string
  discriminator: string
}

export class KnexDatabase implements Database {
  knex: KnexClass
  strategy?: Strategy
  discord_profile_cache: LRUCache<string, CachedDiscordUser, void>
  ratelimiter: RateLimiterPostgres

  constructor(
    databaseConfig: KnexClass.Config | string = {
      asyncStackTraces: true,
      client: "pg",
      connection: {
        host: dbConfig.host || env.DATABASE_HOST || "localhost",
        user: dbConfig.username || env.DATABASE_USER || "postgres",
        password: dbConfig.password || env.DATABASE_PASS || "",
        database: dbConfig.dbname || env.DATABASE_TARGET || "postgres",
        port:
          (dbConfig.port as unknown as number) ||
          (env.DATABASE_PORT ? +env.DATABASE_PORT : 5431),
      },
      pool: {
        min: 0,
        max: 5,
        afterCreate: (conn: any, done: (err?: Error) => void) => {
          conn.query(`SET TIME ZONE 'UTC'`, done)
        },
      },
    },
  ) {
    this.knex = Knex(databaseConfig)

    // Enable query performance monitoring
    enableQueryMonitoring(this.knex)

    this.discord_profile_cache = new LRUCache({
      max: 500,

      // for use with tracking overall storage size
      maxSize: 5000,
      sizeCalculation: (value, key) => {
        return 1
      },

      // how long to live in ms
      ttl: 1000 * 60 * 60, // hour

      // return stale items before removing from cache?
      allowStale: false,

      updateAgeOnGet: false,
      updateAgeOnHas: false,

      // async method to use for cache.fetch(), for
      // stale-while-revalidate type of behavior
      fetchMethod: async (
        key: string,
        staleValue,
        { options, signal, context },
      ): Promise<CachedDiscordUser | undefined> => {
        const user = await profileDb.getUser({ user_id: key })

        const cached = this.discord_profile_cache.get(key)

        if (cached) {
          return cached
        }

        if (!user.discord_access_token) {
          return staleValue
        }

        if (!this.strategy) {
          return staleValue
        }

        // Get valid access token (will refresh if needed)
        const validAccessToken = await tokenRefreshUtil.getValidAccessToken(
          user.user_id,
          "discord",
        )

        if (!validAccessToken) {
          return staleValue
        }

        let profile: CachedDiscordUser | undefined = staleValue
        try {
          profile = await new Promise((resolve, reject) =>
            this.strategy!.userProfile(
              validAccessToken,
              (err, profile: Profile) => (err ? reject(err) : resolve(profile)),
            ),
          )
        } catch (e) {
          // Try to get Discord ID from provider system as fallback
          const discordProvider = await profileDb.getUserProvider(
            user.user_id,
            "discord",
          )
          if (discordProvider?.provider_id) {
            try {
              profile = (await rest.get(
                Routes.user(discordProvider.provider_id),
              )) as RESTGetAPIUserResult
            } catch (error) {
              logger.error("Error fetching Discord profile", { error })
            }
          }
        }

        return profile
      },
    })

    this.ratelimiter = new RateLimiterPostgres(
      {
        storeClient: this.knex,
        storeType: `knex`, // knex requires this option
        points: 60, // Number of points
        duration: 60, // Per 60 seconds
      },
      (error) => error && logger.error("Rate limiter error", { error }),
    )
  }

  setStrategy(strategy?: Strategy) {
    this.strategy = strategy
  }

  getStrategy(): Strategy | undefined {
    return this.strategy
  }
}

export const database = new KnexDatabase()

/**
 * Get the Knex instance for use in route-specific database modules.
 * This allows route modules to access the connection pool without
 * needing to import the entire database class.
 */
export const getKnex = (): KnexClass => {
  return database.knex
}
