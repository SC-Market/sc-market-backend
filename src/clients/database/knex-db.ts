import Knex, { Knex as KnexClass } from "knex"
import { Profile, Strategy } from "passport-discord"
import { MessageBody, PostBody, User } from "../../api/routes/v1/api-models.js"
import { LRUCache } from "lru-cache"
import logger from "../../logger/logger.js"
import {
  AvailabilitySpan,
  DBAccountIntegration,
  DBAccountProvider,
  DBAccountSettings,
  DBAdminAlert,
  DBAggregateComplete,
  DBAggregateListingComplete,
  DBAggregateListingRaw,
  DBAggregateRaw,
  DBAuctionDetails,
  DBAvailabilityEntry,
  DBBlocklist,
  DBBuyOrder,
  DBChat,
  DBChatParticipant,
  DBComment,
  DBCommentVote,
  DBContentReport,
  DBContractor,
  DBContractorArchiveDetails,
  DBContractorInvite,
  DBContractorInviteCode,
  DBContractorMember,
  DBContractorMemberRole,
  DBContractorRole,
  DBDelivery,
  DBFollow,
  DBImageResource,
  DBMarketAggregate,
  DBMarketAggregateListing,
  DBMarketBid,
  DBMarketCategory,
  DBMarketItem,
  DBMarketListing,
  DBMarketListingDetails,
  DBMarketListingDetailsBase,
  DBMarketListingImage,
  DBMarketMultiple,
  DBMarketMultipleListing,
  DBMarketOffer,
  DBMarketOfferListing,
  DBMarketOrder,
  DBMarketSearchResult,
  DBMessage,
  DBMultipleComplete,
  DBMultipleListingCompositeComplete,
  DBMultipleListingRaw,
  DBMultipleRaw,
  DBNotification,
  DBNotificationActions,
  DBNotificationChange,
  DBNotificationObject,
  DBNotificationWebhook,
  DBOffer,
  DBOfferMarketListing,
  DBOfferSession,
  DBOrder,
  DBOrderApplicant,
  DBOrderComment,
  DBOrderSetting,
  DBPost,
  DBPostPhoto,
  DBPriceHistory,
  DBRecruitingPost,
  DBRecruitingVote,
  DBReview,
  DBService,
  DBServiceImage,
  DBShip,
  DBTransaction,
  DBUniqueListing,
  DBUniqueListingComplete,
  DBUniqueListingRaw,
  DBUser,
  DBWebhookActions,
  MinimalContractor,
  MinimalUser,
  OrderApplicantResponse,
  BadgeData,
  BadgeMetadata,
} from "./db-models.js"
import { Database } from "./db-driver.js"
import { cdn } from "../cdn/cdn.js"
import {
  formatBid,
  formatInvite,
  formatListing,
  formatReview,
  getContractorRating,
  getUserRating,
} from "../../api/routes/v1/util/formatting.js"
import { RateLimiterPostgres } from "rate-limiter-flexible"
import { RESTGetAPIUserResult, Routes } from "discord-api-types/v10"
import { rest } from "../../api/routes/v1/util/discord.js"
import pg from "pg"
import { serializeOrderDetails } from "../../api/routes/v1/orders/serializers.js"
import {
  DBContractOffer,
  DBPublicContract,
} from "../../api/routes/v1/contracts/types.js"
import { serializeOfferSession } from "../../api/routes/v1/offers/serializers.js"
import { env } from "../../config/env.js"
import {
  ContractorListingsQuery,
  MarketSearchQuery,
  OrderStats,
  UserListingsQuery,
} from "../../api/routes/v1/market/types.js"
import { RecruitingSearchQuery } from "../../api/routes/v1/recruiting/controller.js"

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
        const user = await this.getUser({ user_id: key })

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
        const { getValidAccessToken } = await import(
          "../../api/util/token-refresh.js"
        )
        const validAccessToken = await getValidAccessToken(user.user_id, "discord")

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
          const discordProvider = await this.getUserProvider(user.user_id, "discord")
          if (discordProvider?.provider_id) {
            try {
              profile = (await rest.get(
                Routes.user(discordProvider.provider_id),
              )) as RESTGetAPIUserResult
            } catch (error) {
              console.error(error)
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
      (error) => error && console.log(error),
    )
  }

  setStrategy(strategy?: Strategy) {
    this.strategy = strategy
  }

  getStrategy(): Strategy | undefined {
    return this.strategy
  }

  async insertUserRaw(data: Partial<DBUser> | Partial<DBUser>[]) {
    return (await this.knex<DBUser>("accounts").insert(data).returning("*"))[0]
  }

  async insertUser(
    profile: CachedDiscordUser,
    access_token: string,
    refresh_token: string,
  ): Promise<User> {
    // Check if user exists by Discord provider
    let user = await this.getUserByProvider("discord", profile.id)

    if (user == null) {
      // Create new user with Discord provider
      // Discord tokens typically expire in 7 days
      const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      // Generate username in format: new_user{discord_id}
      const generatedUsername = `new_user${profile.id}`
      user = await this.createUserWithProvider(
        {
          provider_type: "discord",
          provider_id: profile.id,
          access_token: access_token,
          refresh_token: refresh_token,
          token_expires_at: discordExpiresAt,
          metadata: {
            username: generatedUsername,
            displayName: generatedUsername,
          },
          is_primary: true,
        },
        "en",
      )
      
      // Also set discord_id for backward compatibility
      await this.knex<DBUser>("accounts")
        .where("user_id", user.user_id)
        .update({
          discord_id: profile.id,
          discord_access_token: access_token,
          discord_refresh_token: refresh_token,
        })
      
      // Refresh user to get updated discord_id
      user = await this.getUser({ user_id: user.user_id })
      
      // Account settings are created by createUserWithProvider, so no need to insert again
    } else {
      // Update tokens for existing user
      // Discord tokens typically expire in 7 days
      const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await this.updateProviderTokens(user.user_id, "discord", {
        access_token: access_token,
        refresh_token: refresh_token,
        token_expires_at: discordExpiresAt,
      })
      
      // Also update legacy columns for backward compatibility
      await this.updateUser(
        { user_id: user.user_id },
        {
          discord_access_token: access_token,
          discord_refresh_token: refresh_token,
        },
      )
      
      // Refresh user
      user = await this.getUser({ user_id: user.user_id })
    }

    return user
  }

  async insertUserWithLocale(
    profile: CachedDiscordUser,
    access_token: string,
    refresh_token: string,
    preferredLocale: string,
  ): Promise<User> {
    // Check if user exists by Discord provider
    let user = await this.getUserByProvider("discord", profile.id)

    if (user == null) {
      // Create new user with Discord provider
      // Discord tokens typically expire in 7 days
      const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      user = await this.createUserWithProvider(
        {
          provider_type: "discord",
          provider_id: profile.id,
          access_token: access_token,
          refresh_token: refresh_token,
          token_expires_at: discordExpiresAt,
          metadata: {
            username: profile.username,
          },
          is_primary: true,
        },
        preferredLocale,
      )
      
      // Also set discord_id for backward compatibility
      await this.knex<DBUser>("accounts")
        .where("user_id", user.user_id)
        .update({
          discord_id: profile.id,
          discord_access_token: access_token,
          discord_refresh_token: refresh_token,
        })
      
      // Refresh user to get updated discord_id
      user = await this.getUser({ user_id: user.user_id })
    } else {
      // Update tokens and locale for existing user
      // Discord tokens typically expire in 7 days
      const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await this.updateProviderTokens(user.user_id, "discord", {
        access_token: access_token,
        refresh_token: refresh_token,
        token_expires_at: discordExpiresAt,
      })
      
      // Also update legacy columns for backward compatibility
      await this.updateUser(
        { user_id: user.user_id },
        {
          discord_access_token: access_token,
          discord_refresh_token: refresh_token,
          locale: preferredLocale,
        },
      )
      
      // Refresh user
      user = await this.getUser({ user_id: user.user_id })
    }

    return user
  }

  // Provider Management Methods

  /**
   * Get user by provider (replaces direct discord_id lookup)
   */
  async getUserByProvider(
    providerType: string,
    providerId: string,
  ): Promise<User | null> {
    const provider = await this.knex<DBAccountProvider>("account_providers")
      .where("provider_type", providerType)
      .where("provider_id", providerId)
      .first()

    if (!provider) {
      return null
    }

    return this.getUser({ user_id: provider.user_id })
  }

  /**
   * Get a specific provider for a user
   */
  async getUserProvider(
    userId: string,
    providerType: string,
  ): Promise<DBAccountProvider | null> {
    const provider = await this.knex<DBAccountProvider>("account_providers")
      .where("user_id", userId)
      .where("provider_type", providerType)
      .first()
    return provider || null
  }

  /**
   * Get Discord provider ID for a user
   * Returns null if Discord is not linked
   */
  async getUserDiscordId(userId: string): Promise<string | null> {
    const provider = await this.getUserProvider(userId, "discord")
    return provider?.provider_id || null
  }

  /**
   * Get user by Discord ID
   */
  async getUserByDiscordId(discordId: string): Promise<User | null> {
    return await this.getUserByProvider("discord", discordId)
  }

  /**
   * Get all providers for a user
   */
  async getUserProviders(userId: string): Promise<DBAccountProvider[]> {
    return this.knex<DBAccountProvider>("account_providers")
      .where("user_id", userId)
      .select("*")
  }

  /**
   * Get primary provider for a user
   */
  async getPrimaryProvider(userId: string): Promise<DBAccountProvider | null> {
    const result = await this.knex<DBAccountProvider>("account_providers")
      .where("user_id", userId)
      .where("is_primary", true)
      .first()
    return result || null
  }

  /**
   * Link a provider to a user account
   * Note: For Citizen ID, validation should be done before calling this
   */
  async linkProvider(
    userId: string,
    providerData: {
      provider_type: string
      provider_id: string
      access_token?: string | null
      refresh_token?: string | null
      token_expires_at?: Date | null
      metadata?: Record<string, any>
      is_primary?: boolean
    },
  ): Promise<DBAccountProvider> {
    // Check if provider already linked to different account
    const existingProvider = await this.knex<DBAccountProvider>(
      "account_providers",
    )
      .where("provider_type", providerData.provider_type)
      .where("provider_id", providerData.provider_id)
      .first()

    if (existingProvider && existingProvider.user_id !== userId) {
      throw new Error(
        `This ${providerData.provider_type} account is already linked to another user`,
      )
    }

    const [provider] = await this.knex<DBAccountProvider>("account_providers")
      .insert({
        user_id: userId,
        provider_type: providerData.provider_type,
        provider_id: providerData.provider_id,
        access_token: providerData.access_token || null,
        refresh_token: providerData.refresh_token || null,
        token_expires_at: providerData.token_expires_at || null,
        metadata: providerData.metadata || null, // JSONB column handles JSON automatically
        is_primary: providerData.is_primary ?? false,
        linked_at: new Date(),
      })
      .onConflict(["user_id", "provider_type"])
      .merge({
        access_token: providerData.access_token || null,
        refresh_token: providerData.refresh_token || null,
        token_expires_at: providerData.token_expires_at || null,
        metadata: providerData.metadata || null, // JSONB column handles JSON automatically
        last_used_at: new Date(),
      })
      .returning("*")

    return provider
  }

  /**
   * Unlink a provider from a user account
   */
  async unlinkProvider(userId: string, providerType: string): Promise<void> {
    // Prevent unlinking if it's the only primary provider
    const providers = await this.getUserProviders(userId)
    const primaryProviders = providers.filter((p) => p.is_primary)

    if (
      primaryProviders.length === 1 &&
      primaryProviders[0].provider_type === providerType
    ) {
      throw new Error("Cannot unlink the only primary authentication provider")
    }

    await this.knex<DBAccountProvider>("account_providers")
      .where("user_id", userId)
      .where("provider_type", providerType)
      .delete()
  }

  /**
   * Update provider tokens
   */
  async updateProviderTokens(
    userId: string,
    providerType: string,
    tokens: {
      access_token?: string
      refresh_token?: string
      token_expires_at?: Date | null
    },
  ): Promise<void> {
    await this.knex<DBAccountProvider>("account_providers")
      .where("user_id", userId)
      .where("provider_type", providerType)
      .update({
        ...tokens,
        last_used_at: new Date(),
      })
  }

  /**
   * Set primary provider
   */
  async setPrimaryProvider(
    userId: string,
    providerType: string,
  ): Promise<void> {
    // First, unset all primary providers
    await this.knex<DBAccountProvider>("account_providers")
      .where("user_id", userId)
      .update({ is_primary: false })

    // Then set the new primary
    await this.knex<DBAccountProvider>("account_providers")
      .where("user_id", userId)
      .where("provider_type", providerType)
      .update({ is_primary: true })
  }

  /**
   * Create user with provider (replaces insertUserWithLocale for new providers)
   * Note: For Citizen ID, verification must be checked before calling this
   */
  async createUserWithProvider(
    providerData: {
      provider_type: string
      provider_id: string
      access_token?: string | null
      refresh_token?: string | null
      token_expires_at?: Date | null
      metadata?: Record<string, any>
      is_primary?: boolean
    },
    locale: string = "en",
  ): Promise<User> {
    // Check if provider already exists
    const existingProvider = await this.knex<DBAccountProvider>(
      "account_providers",
    )
      .where("provider_type", providerData.provider_type)
      .where("provider_id", providerData.provider_id)
      .first()

    if (existingProvider) {
      // Update tokens and return existing user
      await this.updateProviderTokens(
        existingProvider.user_id,
        providerData.provider_type,
        {
          access_token: providerData.access_token || undefined,
          refresh_token: providerData.refresh_token || undefined,
          token_expires_at: providerData.token_expires_at || undefined,
        },
      )
      return this.getUser({ user_id: existingProvider.user_id })
    }

    // Create new user
    const username =
      providerData.metadata?.username ||
      `user_${providerData.provider_id.substring(0, 8)}`
    const displayName =
      providerData.metadata?.displayName ||
      providerData.metadata?.username ||
      username

    const [user] = await this.knex<DBUser>("accounts")
      .insert({
        username: username,
        display_name: displayName,
        locale: locale,
        rsi_confirmed: false, // Will be updated to true for Citizen ID after creation
        discord_id: null, // Can be null now
      })
      .returning("*")

    // Link provider
    await this.linkProvider(user.user_id, {
      ...providerData,
      is_primary: providerData.is_primary ?? true, // First provider is always primary
    })

    // Create account settings
    await this.knex<DBAccountSettings>("account_settings").insert({
      user_id: user.user_id,
    })

    return this.getUser({ user_id: user.user_id })
  }

  /**
   * Validate if Citizen ID can be linked to an existing account
   * Rules:
   * - Account must be unverified (rsi_confirmed = false), OR
   * - Account must be verified AND usernames must match
   */
  async validateCitizenIDLinking(
    userId: string,
    citizenIDSpectrumId: string,
  ): Promise<{
    canLink: boolean
    reason?: string
    accountSpectrumId?: string
    citizenIDSpectrumId?: string
  }> {
    const user = await this.getUser({ user_id: userId })

    // If account is unverified, can always link
    if (!user.rsi_confirmed) {
      return { canLink: true }
    }

    // If account is verified, spectrum IDs must match
    if (user.spectrum_user_id && user.spectrum_user_id === citizenIDSpectrumId) {
      return { canLink: true }
    }

    return {
      canLink: false,
      reason: "Account is verified but spectrum IDs do not match",
      accountSpectrumId: user.spectrum_user_id || undefined,
      citizenIDSpectrumId: citizenIDSpectrumId,
    }
  }

  // Integration Management Methods

  /**
   * Get integration settings for a user
   */
  async getUserIntegration(
    userId: string,
    integrationType: string,
  ): Promise<DBAccountIntegration | null> {
    const result = await this.knex<DBAccountIntegration>("account_integrations")
      .where("user_id", userId)
      .where("integration_type", integrationType)
      .first()
    return result || null
  }

  /**
   * Update or create integration settings
   */
  async upsertIntegration(
    userId: string,
    integration: {
      integration_type: string
      settings: Record<string, any>
      enabled?: boolean
    },
  ): Promise<void> {
    await this.knex<DBAccountIntegration>("account_integrations")
      .insert({
        user_id: userId,
        integration_type: integration.integration_type,
        settings: integration.settings,
        enabled: integration.enabled ?? true,
        configured_at: new Date(),
      })
      .onConflict(["user_id", "integration_type"])
      .merge({
        settings: this.knex.raw("settings || ?::jsonb", [
          JSON.stringify(integration.settings),
        ]),
        enabled: integration.enabled ?? true,
        last_used_at: new Date(),
      })
  }

  /**
   * Get all integrations for a user
   */
  async getUserIntegrations(userId: string): Promise<DBAccountIntegration[]> {
    return this.knex<DBAccountIntegration>("account_integrations")
      .where("user_id", userId)
      .select("*")
  }

  /**
   * Get Discord integration settings with fallback to old columns
   * This provides backward compatibility during migration
   */
  async getDiscordIntegrationSettings(userId: string): Promise<{
    official_server_id: string | null
    discord_thread_channel_id: string | null
  }> {
    // Try new integration table first
    const integration = await this.getUserIntegration(userId, "discord")
    if (integration && integration.settings) {
      return {
        official_server_id:
          integration.settings.official_server_id?.toString() || null,
        discord_thread_channel_id:
          integration.settings.discord_thread_channel_id?.toString() || null,
      }
    }

    // Fallback to old columns
    const user = await this.getUser({ user_id: userId })
    if (user) {
      return {
        official_server_id: user.official_server_id?.toString() || null,
        discord_thread_channel_id:
          user.discord_thread_channel_id?.toString() || null,
      }
    }

    return {
      official_server_id: null,
      discord_thread_channel_id: null,
    }
  }

  async insertContractor(
    details: Partial<DBContractor>,
  ): Promise<DBContractor> {
    return (
      await this.knex<DBContractor>("contractors")
        .insert(details)
        .returning("*")
    )[0]
  }

  /**
   * @deprecated Use `insertContractorMemberRole` instead
   * @param contractor_id
   * @param user_id
   * @param role
   */
  async insertContractorMember(
    contractor_id: string,
    user_id: string,
    role: string,
  ): Promise<DBContractorMember> {
    return (
      await this.knex<DBContractorMember>("contractor_members")
        .insert({ contractor_id, user_id, role })
        .returning("*")
    )[0]
  }

  /**
   * @deprecated
   * @param where
   * @param value
   */
  async updateContractorMember(
    where: any,
    value: any,
  ): Promise<DBContractorMember[]> {
    return this.knex<DBContractorMember>("contractor_members")
      .update(value)
      .where(where)
      .returning("*")
  }

  /**
   * @deprecated
   * @param where
   */
  async removeContractorMember(
    where: Partial<DBContractorMember>,
  ): Promise<DBContractorMember[]> {
    return this.knex<DBContractorMember>("contractor_members")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeUserContractorRoles(
    contractor_id: string,
    user_id: string,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .where({ user_id: user_id })
      .andWhere({
        role_id: this.knex.raw(
          "ANY(?)",
          this.knex("contractor_roles")
            .where({ contractor_id })
            .select("role_id"),
        ),
      })
      .delete()
      .returning("*")
  }

  async getUser(
    where: any,
    options: {
      noBalance: boolean
    } = { noBalance: false },
  ): Promise<User> {
    const user = await this.knex<DBUser>("accounts").where(where).first()

    if (!user) {
      throw new Error("Invalid user!")
    }

    return {
      ...(options.noBalance ? {} : { balance: user.balance }),
      user_id: user.user_id!,
      display_name: user!.display_name,
      profile_description: user.profile_description,
      role: user.role,
      username: user.username,
      avatar: user.avatar,
      banner: user.banner,
      rsi_confirmed: user.rsi_confirmed,
      spectrum_user_id: user.spectrum_user_id,
      discord_access_token: user.discord_access_token,
      discord_refresh_token: user.discord_refresh_token,
      official_server_id: user.official_server_id,
      discord_thread_channel_id: user.discord_thread_channel_id,
      market_order_template: user.market_order_template,
      locale: user.locale,
    } as User
  }

  async findUser(
    where: any,
    options: {
      noBalance: boolean
    } = { noBalance: false },
  ): Promise<User | null> {
    const user = await this.knex<DBUser>("accounts").where(where).first()

    if (!user) {
      return null
    }

    return {
      ...(options.noBalance ? {} : { balance: user.balance }),
      user_id: user.user_id!,
      display_name: user!.display_name,
      profile_description: user.profile_description,
      role: user.role,
      username: user.username,
      avatar: user.avatar,
      banner: user.banner,
      rsi_confirmed: user.rsi_confirmed,
      spectrum_user_id: user.spectrum_user_id,
      discord_access_token: user.discord_access_token,
      discord_refresh_token: user.discord_refresh_token,
      official_server_id: user.official_server_id,
      discord_thread_channel_id: user.discord_thread_channel_id,
      market_order_template: user.market_order_template,
      locale: user.locale,
    } as User
  }

  async getLogin(where: any): Promise<User> {
    const user = await this.knex<DBUser>("accounts").where(where).first()

    if (!user) {
      throw new Error("Invalid user!")
    }

    return {
      user_id: user.user_id!,
      display_name: user!.display_name,
      profile_description: user.profile_description,
      role: user.role,
      username: user.username,
      avatar: user.avatar,
      banner: user.banner,
      rsi_confirmed: user.rsi_confirmed,
      spectrum_user_id: user.spectrum_user_id,
    } as User
  }

  async getMinimalUser(
    where: any,
    options: {
      noBalance: boolean
    } = { noBalance: false },
  ): Promise<MinimalUser> {
    const user = await this.knex<DBUser>("accounts")
      .where(where)
      .first("accounts.*")

    if (!user) {
      throw new Error("Invalid user!")
    }

    return {
      username: user.username,
      avatar: (await cdn.getFileLinkResource(user.avatar))!,
      display_name: user.display_name,
      rating: await getUserRating(user.user_id),
      badges: await this.getUserBadges(user.user_id),
    }
  }

  async getAllMinimalUsers(
    options: {
      noBalance: boolean
    } = { noBalance: false },
  ): Promise<MinimalUser[]> {
    const users = await this.knex<DBUser>("accounts").select()

    return await Promise.all(
      users.map(async (user) => ({
        username: user.username,
        avatar: (await cdn.getFileLinkResource(user.avatar))!,
        display_name: user.display_name,
        rating: {
          avg_rating: 0,
          rating_count: 0,
          streak: 0,
          total_rating: 0,
        },
      })),
    )
  }

  async incrementUserBalance(user_id: string, amount: number): Promise<void> {
    await this.knex("accounts")
      .where({ user_id: user_id })
      .increment("balance", amount)
  }

  async decrementUserBalance(user_id: string, amount: number): Promise<void> {
    await this.knex("accounts")
      .where({ user_id: user_id })
      .decrement("balance", amount)
  }

  async incrementContractorBalance(
    contractor_id: string,
    amount: number,
  ): Promise<void> {
    await this.knex("contractors")
      .where({ contractor_id: contractor_id })
      .increment("balance", amount)
  }

  async decrementContractorBalance(
    contractor_id: string,
    amount: number,
  ): Promise<void> {
    await this.knex("contractors")
      .where({ contractor_id: contractor_id })
      .decrement("balance", amount)
  }

  async getContractor(where: any): Promise<DBContractor> {
    const contractor = await this.knex<DBContractor>("contractors")
      .where(where)
      .first()

    if (!contractor) {
      throw new Error("Invalid contractor!")
    }

    return contractor
  }

  async getContractorSafe(
    where: any,
  ): Promise<DBContractor | undefined | null> {
    const contractor = await this.knex<DBContractor>("contractors")
      .where(where)
      .first()

    return contractor
  }

  async getContractorsByIds(contractorIds: string[]): Promise<DBContractor[]> {
    if (!contractorIds.length) {
      return []
    }

    return this.knex<DBContractor>("contractors").whereIn(
      "contractor_id",
      contractorIds,
    )
  }

  async getMinimalContractor(where: any): Promise<MinimalContractor> {
    const contractor = await this.knex<DBContractor>("contractors")
      .where(where)
      .first()

    if (!contractor) {
      throw new Error("Invalid contractor!")
    }

    return {
      spectrum_id: contractor.spectrum_id,
      avatar: (await cdn.getFileLinkResource(contractor.avatar))!,
      name: contractor.name,
      rating: await getContractorRating(contractor.contractor_id),
      badges: await this.getContractorBadges(contractor.contractor_id),
    }
  }

  async getContractorListings(where: any): Promise<DBContractor[]> {
    return this.knex<DBContractor>("contractors").where(where).select()
  }

  async insertContractorInvites(values: any[]): Promise<DBContractorInvite[]> {
    return this.knex<DBContractorInvite>("contractor_invites")
      .insert(values)
      .returning("*")
  }

  async removeContractorInvites(user_id: string, contractor_id: string) {
    const invites = await this.knex<DBContractorInvite>("contractor_invites")
      .where({ user_id, contractor_id })
      .delete()
      .returning("*")

    const action =
      await database.getNotificationActionByName("contractor_invite")
    for (const invite of invites) {
      await this.knex<DBNotificationObject>("notification_object")
        .where({
          entity_id: invite.invite_id,
          action_type_id: action.action_type_id,
        })
        .delete()
    }
  }

  async removeNotificationObject(where: any) {
    return this.knex<DBNotificationObject>("notification_object")
      .where(where)
      .delete()
      .returning("*")
  }

  async getContractorInvites(where: any): Promise<DBContractorInvite[]> {
    return this.knex<DBContractorInvite>("contractor_invites")
      .where(where)
      .select()
  }

  async getContractorInvite(
    where: any,
  ): Promise<DBContractorInvite | undefined | null> {
    return this.knex<DBContractorInvite>("contractor_invites")
      .where(where)
      .first()
  }

  async getInviteCodes(where: any): Promise<DBContractorInviteCode[]> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .where(where)
      .select("*")
  }

  async updateInviteCodes(
    where: any,
    body: any,
  ): Promise<DBContractorInviteCode[]> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .where(where)
      .update(body)
      .returning("*")
  }

  async deleteInviteCodes(where: any): Promise<DBContractorInviteCode[]> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .where(where)
      .delete()
      .returning("*")
  }

  async getInviteCode(where: any): Promise<DBContractorInviteCode | null> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .where(where)
      .first("*")
  }

  async createInviteCode(
    body: Partial<DBContractorInviteCode>,
  ): Promise<DBContractorInviteCode[]> {
    return this.knex<DBContractorInviteCode>("contractor_invite_codes")
      .insert(body)
      .returning("*")
  }

  async removeAllContractorInvites(
    contractor_id: string,
  ): Promise<DBContractorInvite[]> {
    const invites = await this.knex<DBContractorInvite>("contractor_invites")
      .where({ contractor_id })
      .delete()
      .returning("*")

    if (!invites.length) {
      return invites
    }

    const action = await this.getNotificationActionByName("contractor_invite")

    await this.knex<DBNotificationObject>("notification_object")
      .whereIn(
        "entity_id",
        invites.map((invite) => invite.invite_id),
      )
      .andWhere("action_type_id", action.action_type_id)
      .delete()

    return invites
  }

  async upsertContractorArchiveDetails(
    values: Partial<DBContractorArchiveDetails>,
  ): Promise<DBContractorArchiveDetails[]> {
    return this.knex<DBContractorArchiveDetails>("contractor_archive_details")
      .insert(values)
      .onConflict("contractor_id")
      .merge(values)
      .returning("*")
  }

  async getContractorArchiveDetails(
    where: Partial<DBContractorArchiveDetails>,
  ) {
    return this.knex<DBContractorArchiveDetails>("contractor_archive_details")
      .where(where)
      .first()
  }

  async getImageResource(where: any): Promise<DBImageResource> {
    const resource = await this.knex<DBImageResource>("image_resources")
      .where(where)
      .first()

    if (!resource) {
      throw new Error("Invalid resource!")
    }

    return resource
  }

  async insertImageResource(values: any): Promise<DBImageResource> {
    const resources = await this.knex<DBImageResource>("image_resources")
      .insert(values)
      .returning("*")
    return resources[0]
  }

  async getImageResources(where: any): Promise<DBImageResource[]> {
    return this.knex<DBImageResource>("image_resources").where(where).select()
  }

  async removeImageResource(where: any): Promise<DBImageResource[]> {
    return this.knex<DBImageResource>("image_resources")
      .where(where)
      .delete()
      .returning("*")
  }

  async getUserContractors(where: any): Promise<DBContractor[]> {
    return this.knex<DBContractor>("contractor_members")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "contractor_members.contractor_id",
      )
      .where(where)
      .select("contractors.*")
  }

  async getUserContractorRoles(where: any): Promise<
    {
      spectrum_id: string
      role: string
      role_id: string
      name: string
      position: number
    }[]
  > {
    // Use contractor_member_roles to get all roles for the user
    return this.knex<{
      spectrum_id: string
      role: string
      role_id: string
      name: string
      position: number
    }>("contractor_member_roles")
      .join(
        "contractor_roles",
        "contractor_member_roles.role_id",
        "=",
        "contractor_roles.role_id",
      )
      .join(
        "contractors",
        "contractor_roles.contractor_id",
        "=",
        "contractors.contractor_id",
      )
      .where(where)
      .select(
        "contractors.spectrum_id",
        "contractor_roles.name as role",
        "contractor_roles.role_id",
        "contractor_roles.position",
        "contractors.name",
      )
  }

  async getContractorMembersUsernames(where: any): Promise<
    {
      username: string
      role: string
    }[]
  > {
    return (
      this.knex<{
        username: string
        role: string
      }>("contractor_members")
        // .join('contractors', 'contractors.contractor_id', '=', 'contractor_members.contractor_id')
        .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
        .where(where)
        .select("accounts.username", "contractor_members.role")
    )
  }

  async getContractorMembersUsernamesAndID(where: any): Promise<
    {
      username: string
      role: string
      user_id: string
    }[]
  > {
    return (
      this.knex<{
        username: string
        role: string
        user_id: string
      }>("contractor_members")
        // .join('contractors', 'contractors.contractor_id', '=', 'contractor_members.contractor_id')
        .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
        .where(where)
        .select(
          "accounts.username",
          "contractor_members.role",
          "accounts.user_id",
        )
    )
  }

  async getContractorMembers(where: any): Promise<DBContractorMember[]> {
    return this.knex<DBContractorMember>("contractor_members")
      .where(where)
      .select("*")
  }

  async getContractorMembersPaginated(
    contractor_id: string,
    options: {
      page: number
      page_size: number
      search?: string
      sort?: string
      role_filter?: string
    },
  ): Promise<{ members: any[]; total: number }> {
    const knex = this.knex
    const { page, page_size, search, sort = "username", role_filter } = options

    // Build base query using contractor_member_roles for multiple roles support
    let query = knex("contractor_member_roles")
      .join(
        "contractor_roles",
        "contractor_member_roles.role_id",
        "contractor_roles.role_id",
      )
      .join("accounts", "contractor_member_roles.user_id", "accounts.user_id")
      .where("contractor_roles.contractor_id", contractor_id)
      .select(
        "contractor_member_roles.user_id",
        "contractor_roles.role_id",
        "contractor_roles.name as role_name",
        "accounts.username",
        "accounts.avatar",
      )

    // Add search filter
    if (search) {
      query = query.where("accounts.username", "ilike", `%${search}%`)
    }

    // Add role filter (using role_id)
    if (role_filter) {
      query = query.where("contractor_roles.role_id", role_filter)
    }

    // Get total count (separate query to avoid GROUP BY issues)
    const countQuery = knex("contractor_member_roles")
      .join(
        "contractor_roles",
        "contractor_member_roles.role_id",
        "contractor_roles.role_id",
      )
      .join("accounts", "contractor_member_roles.user_id", "accounts.user_id")
      .where("contractor_roles.contractor_id", contractor_id)

    if (search) {
      countQuery.where("accounts.username", "ilike", `%${search}%`)
    }

    if (role_filter) {
      countQuery.where("contractor_roles.role_id", role_filter)
    }

    const countResult = await countQuery.countDistinct(
      "contractor_member_roles.user_id as total",
    )
    const total = parseInt(countResult[0].total as string)

    // Add sorting
    switch (sort) {
      case "username":
        query = query.orderBy("accounts.username", "asc")
        break
      case "role":
        query = query.orderBy("contractor_roles.position", "asc")
        break
      default:
        query = query.orderBy("accounts.username", "asc")
    }

    // Add pagination
    query = query.limit(page_size).offset(page * page_size)

    // Execute query to get filtered members
    const filteredMembers = await query

    // Get all roles for each filtered member (regardless of filter)
    const memberIds = [...new Set(filteredMembers.map((m) => m.user_id))]
    const allRolesQuery = knex("contractor_member_roles")
      .join(
        "contractor_roles",
        "contractor_member_roles.role_id",
        "contractor_roles.role_id",
      )
      .join("accounts", "contractor_member_roles.user_id", "accounts.user_id")
      .where("contractor_roles.contractor_id", contractor_id)
      .whereIn("contractor_member_roles.user_id", memberIds)
      .select(
        "contractor_member_roles.user_id",
        "contractor_roles.role_id",
        "accounts.username",
        "accounts.avatar",
      )

    const allRoles = await allRolesQuery

    // Group roles by user to handle multiple roles per member
    const membersMap = new Map()
    allRoles.forEach((member) => {
      if (!membersMap.has(member.user_id)) {
        membersMap.set(member.user_id, {
          user_id: member.user_id,
          username: member.username,
          roles: [],
        })
      }
      membersMap.get(member.user_id).roles.push(member.role_id)
    })

    // Convert to array format and enrich with minimal user data
    const membersWithRoles = await Promise.all(
      Array.from(membersMap.values()).map(async (member) => {
        const minimalUser = await this.getMinimalUser({
          user_id: member.user_id,
        })
        return {
          ...minimalUser,
          roles: member.roles,
        }
      }),
    )

    return {
      members: membersWithRoles,
      total,
    }
  }

  async getContractorMemberRoles(
    where: any,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .where(where)
      .select("*")
  }

  async getMembersWithMatchingRole(
    contractor_id: string,
    subquery: any,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .whereExists(
        this.knex("contractor_roles")
          .whereRaw(
            "contractor_member_roles.role_id = contractor_roles.role_id",
          )
          .andWhere(subquery)
          .andWhere("contractor_id", contractor_id),
      )
      .select("contractor_member_roles.*")
  }

  async getContractorCustomers(contractor_id: string): Promise<
    (DBUser & {
      spent: number
    })[]
  > {
    return this.knex<
      DBUser & {
        spent: number
      }
    >("accounts")
      .join("orders", "accounts.user_id", "=", "orders.customer_id")
      .where({ "orders.contractor_id": contractor_id })
      .groupBy("accounts.user_id")
      .select("accounts.*", this.knex.raw("SUM(orders.cost) as spent"))
  }

  async getContractorReviews(contractor_id: string): Promise<DBReview[]> {
    return this.knex<
      DBUser & {
        spent: number
      }
    >("order_reviews")
      .join("orders", "orders.order_id", "=", "order_reviews.order_id")
      .where({ "orders.contractor_id": contractor_id, role: "customer" })
      .select("order_reviews.*")
      .orderBy("order_reviews.timestamp", "desc")
  }

  async getUserReviews(user_id: string): Promise<DBReview[]> {
    return this.knex<
      DBUser & {
        spent: number
      }
    >("order_reviews")
      .join("orders", "orders.order_id", "=", "order_reviews.order_id")
      .where({
        "orders.assigned_id": user_id,
        "orders.contractor_id": null,
        role: "customer",
      })
      .orWhere({ "orders.customer_id": user_id, role: "contractor" })
      .select("order_reviews.*")
      .orderBy("order_reviews.timestamp", "desc")
  }

  async getOrderCount(where: Partial<DBOrder>): Promise<number> {
    return +(
      await this.knex<{ count: number }>("orders").where(where).count()
    )[0].count
  }

  /*
    SELECT order_reviews.*
        FROM order_reviews
        JOIN orders
            ON orders.order_id = order_reviews.order_id
        WHERE orders.assigned_id = 97534879-843f-446d-b37b-d264f7d1865e
            AND orders.contractor_id IS NULL
    *
    */

  /**
   * @deprecated
   * @param user_id
   * @param contractor_id
   */
  async getContractorRoleLegacy(
    user_id: string,
    contractor_id: string,
  ): Promise<
    | {
        username: string
        role: string
      }
    | null
    | undefined
  > {
    return this.knex<{
      username: string
      role: string
    }>("contractor_members")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "contractor_members.contractor_id",
      )
      .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
      .where({
        "contractors.contractor_id": contractor_id,
        "accounts.user_id": user_id,
      })
      .first("accounts.username", "contractor_members.role")
  }

  async getContractorRoles(where: any): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles").where(where).select()
  }

  async getContractorRolesPublic(where: any): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .where(where)
      .select("role_id", "name", "contractor_id", "position")
  }

  async getContractorRole(
    where: any,
  ): Promise<DBContractorRole | null | undefined> {
    return this.knex<DBContractorRole>("contractor_roles").where(where).first()
  }

  async insertContractorMemberRole(
    values: any,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .insert(values)
      .returning("*")
  }

  async insertContractorRole(values: any): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .insert(values)
      .returning("*")
  }

  async updateContractorRole(
    where: any,
    values: any,
  ): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .where(where)
      .update(values)
      .returning("*")
  }

  async deleteContractorRole(where: any): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeContractorMemberRoles(
    where: Partial<DBContractorMemberRole>,
  ): Promise<DBContractorMemberRole[]> {
    return this.knex<DBContractorMemberRole>("contractor_member_roles")
      .where(where)
      .delete()
      .returning("*")
  }

  async getMemberRoles(
    contractor_id: string,
    user_id: string,
  ): Promise<DBContractorRole[]> {
    return this.knex<DBContractorRole>("contractor_roles")
      .join(
        "contractor_member_roles",
        "contractor_member_roles.role_id",
        "=",
        "contractor_roles.role_id",
      )
      .where({
        "contractor_roles.contractor_id": contractor_id,
        "contractor_member_roles.user_id": user_id,
      })
      .select("contractor_roles.*")
  }

  async isContractorAdmin(
    user_id: string,
    contractor_id: string,
  ): Promise<boolean> {
    return ["admin", "owner"].includes(
      (await database.getContractorRoleLegacy(user_id, contractor_id))?.role ||
        "",
    )
  }

  async isContractorOwner(
    user_id: string,
    contractor_id: string,
  ): Promise<boolean> {
    return ["owner"].includes(
      (await database.getContractorRoleLegacy(user_id, contractor_id))?.role ||
        "",
    )
  }

  async getContractorFields(where: any): Promise<
    {
      field: string
      contractor_id: string
    }[]
  > {
    return this.knex<{
      field: string
      contractor_id: string
    }>("contractor_fields")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "contractor_fields.contractor_id",
      )
      .where(where)
      .select("contractor_fields.*")
  }

  async setContractorFields(
    contractor_id: string,
    fields: string[],
  ): Promise<
    {
      field: string
      contractor_id: string
    }[]
  > {
    await this.knex<{
      field: string
      contractor_id: string
    }>("contractor_fields")
      .where({ contractor_id })
      .delete()

    return this.knex<{
      field: string
      contractor_id: string
    }>("contractor_fields")
      .insert(fields.map((f) => ({ field: f, contractor_id })))
      .returning("*")
  }

  async updateUser(where: any, values: Partial<DBUser>) {
    return this.knex<DBUser>("accounts")
      .where(where)
      .update(values)
      .returning("*")
  }

  async updateContractor(where: any, values: Partial<DBContractor>) {
    return this.knex<DBContractor>("contractors")
      .where(where)
      .update(values)
      .returning("*")
  }

  async getUsers() {
    return this.knex<DBUser>("accounts").select()
  }

  async getUsersWhere(where: any = {}) {
    return this.knex<DBUser>("accounts").where(where).select()
  }

  async getUsersPaginated(
    page: number,
    pageSize: number,
    where: any = {},
    sortBy: string = "created_at",
    sortOrder: "asc" | "desc" = "desc",
  ) {
    const offset = (page - 1) * pageSize

    // Get total count
    const totalCount = await this.knex<DBUser>("accounts")
      .where(where)
      .count("* as count")
      .first()
    const total = totalCount ? parseInt((totalCount as any).count) : 0

    // Get paginated users
    const users = await this.knex<DBUser>("accounts")
      .where(where)
      .orderBy(sortBy, sortOrder)
      .limit(pageSize)
      .offset(offset)
      .select()

    return {
      users,
      pagination: {
        page,
        page_size: pageSize,
        total_users: total,
        total_pages: Math.ceil(total / pageSize),
        has_next: page < Math.ceil(total / pageSize),
        has_prev: page > 1,
      },
    }
  }

  async getOrders(where: any): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders").where(where).select()
  }

  async getRelatedOrders(c: string): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders")
      .where({ customer_id: c })
      .orWhere({ assigned_id: c })
      .select()
  }

  async getRelatedOffers(c: string): Promise<DBOfferSession[]> {
    return this.knex<DBOfferSession>("offer_sessions")
      .where({ customer_id: c })
      .orWhere({ assigned_id: c })
      .select()
  }

  async getRelatedActiveOrders(c: string): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders")
      .where("status", "!=", "fulfilled")
      .andWhere("status", "!=", "cancelled")
      .andWhere((qb) =>
        qb.where({ customer_id: c }).orWhere({ assigned_id: c }),
      )
      .orderBy("timestamp", "desc")
      .select()
  }

  async getAllThreads(): Promise<{ thread_id: number }[]> {
    return this.knex<{ thread_id: number }>("orders")
      .where("thread_id", "IS NOT", null)
      .select("thread_id")
  }

  async getServices(where: any): Promise<DBService[]> {
    return this.knex<DBService>("services").where(where).select()
  }

  async getServicesPaginated(params: {
    page?: number
    pageSize?: number
    search?: string
    kind?: string
    minCost?: number
    maxCost?: number
    paymentType?: string
    sortBy?: "timestamp" | "cost" | "service_name"
    sortOrder?: "asc" | "desc"
    status?: string
  }): Promise<{
    services: DBService[]
    pagination: {
      currentPage: number
      pageSize: number
      totalItems: number
      totalPages: number
      hasNextPage: boolean
      hasPreviousPage: boolean
    }
  }> {
    const {
      page = 0,
      pageSize = 20,
      search,
      kind,
      minCost,
      maxCost,
      paymentType,
      sortBy = "timestamp",
      sortOrder = "desc",
      status = "active",
    } = params

    // Build base query with filters
    let query = this.knex<DBService>("services")
    let countQuery = this.knex<DBService>("services")

    // Apply status filter
    query = query.where("status", status)
    countQuery = countQuery.where("status", status)

    // Apply search filter (search in service_name and service_description)
    if (search) {
      const searchTerm = `%${search.toLowerCase()}%`
      query = query.where(function () {
        this.whereRaw("service_name ILIKE ?", [searchTerm]).orWhereRaw(
          "service_description ILIKE ?",
          [searchTerm],
        )
      })
      countQuery = countQuery.where(function () {
        this.whereRaw("service_name ILIKE ?", [searchTerm]).orWhereRaw(
          "service_description ILIKE ?",
          [searchTerm],
        )
      })
    }

    // Apply kind filter
    if (kind) {
      query = query.where("kind", kind)
      countQuery = countQuery.where("kind", kind)
    }

    // Apply cost range filters
    if (minCost !== undefined) {
      query = query.where("cost", ">=", minCost)
      countQuery = countQuery.where("cost", ">=", minCost)
    }
    if (maxCost !== undefined) {
      query = query.where("cost", "<=", maxCost)
      countQuery = countQuery.where("cost", "<=", maxCost)
    }

    // Apply payment type filter
    if (paymentType) {
      query = query.where("payment_type", paymentType)
      countQuery = countQuery.where("payment_type", paymentType)
    }

    // Get total count
    const totalCountResult = await countQuery.count("* as count").first()
    const totalItems = parseInt((totalCountResult as any).count)

    // Calculate pagination
    const totalPages = Math.ceil(totalItems / pageSize)
    const offset = page * pageSize

    // Apply sorting and pagination
    query = query.orderBy(sortBy, sortOrder).offset(offset).limit(pageSize)

    // Execute query
    const services = await query.select()

    return {
      services,
      pagination: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages - 1,
        hasPreviousPage: page > 0,
      },
    }
  }

  async getService(where: any): Promise<DBService | undefined> {
    return this.knex<DBService>("services").where(where).first()
  }

  async getOrderComments(where: any): Promise<DBOrderComment[]> {
    return this.knex<DBOrderComment>("order_comments").where(where).select()
  }

  async getOrderReviews(where: any): Promise<DBReview[]> {
    return this.knex<DBReview>("order_reviews").where(where).select()
  }

  async getOrderReview(where: Partial<DBReview>): Promise<DBReview | null> {
    return (
      (await this.knex<DBReview>("order_reviews").where(where).first()) || null
    )
  }

  async getOrderApplicants(where: any): Promise<DBOrderApplicant[]> {
    return this.knex<DBOrderApplicant>("order_applicants").where(where).select()
  }

  async getOrderApplicantsPublicIds(
    where: any,
  ): Promise<OrderApplicantResponse[]> {
    const apps = await this.getOrderApplicants(where)
    return await Promise.all(
      apps.map(async (applicant) => ({
        ...applicant,
        user_applicant_id: undefined,
        org_applicant_id: undefined,
        user_applicant: applicant.user_applicant_id
          ? await database.getMinimalUser({
              user_id: applicant.user_applicant_id,
            })
          : null,
        org_applicant: applicant.org_applicant_id
          ? await database.getMinimalContractor({
              contractor_id: applicant.org_applicant_id,
            })
          : null,
      })),
    )
  }

  async createOrderComment(
    data: Partial<DBOrderComment>,
  ): Promise<DBOrderComment[]> {
    return this.knex<DBOrderComment>("order_comments")
      .insert(data)
      .returning("*")
  }

  async createOrderReview(data: Partial<DBReview>): Promise<DBReview[]> {
    return this.knex<DBReview>("order_reviews").insert(data).returning("*")
  }

  async requestReviewRevision(
    review_id: string,
    requester_id: string,
    message?: string,
  ): Promise<DBReview> {
    const now = new Date()
    const [review] = await this.knex<DBReview>("order_reviews")
      .where({ review_id })
      .update({
        revision_requested: true,
        revision_requested_at: now,
        revision_message: message || null,
      })
      .returning("*")

    return review
  }

  async updateOrderReview(
    review_id: string,
    updates: Partial<DBReview>,
  ): Promise<DBReview> {
    const [review] = await this.knex<DBReview>("order_reviews")
      .where({ review_id })
      .update({
        ...updates,
        last_modified_at: new Date(),
      })
      .returning("*")

    return review
  }

  async getOrderReviewWithRevisionStatus(
    review_id: string,
  ): Promise<(DBReview & { can_edit: boolean }) | null> {
    const review = await this.getOrderReview({ review_id })
    if (!review) return null

    // This method will be enhanced with permission logic in the controller
    // For now, we'll return a placeholder that will be updated based on user context
    return {
      ...review,
      can_edit: false, // Placeholder - will be determined by controller based on user permissions
    }
  }

  async createOrderApplication(data: Partial<DBOrderApplicant>): Promise<void> {
    await this.knex<DBOrderApplicant>("order_applicants").insert(data)
  }

  async getOrder(where: any): Promise<DBOrder> {
    const order = await this.knex<DBOrder>("orders").where(where).first()

    if (!order) {
      throw new Error("Invalid order!")
    }

    return order
  }

  async createOrder(data: Partial<DBOrder>): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders").insert(data).returning("*")
  }

  async createBuyOrder(data: any): Promise<DBBuyOrder[]> {
    return this.knex<DBBuyOrder>("market_buy_orders")
      .insert(data)
      .returning("*")
  }

  async updateBuyOrder(
    where: Partial<DBBuyOrder>,
    values: any,
  ): Promise<DBBuyOrder[]> {
    return this.knex<DBBuyOrder>("market_buy_orders")
      .update(values)
      .where(where)
      .returning("*")
  }

  async getBuyOrder(
    where: Partial<DBBuyOrder>,
  ): Promise<DBBuyOrder | undefined> {
    return this.knex<DBBuyOrder>("market_buy_orders").where(where).first()
  }

  async getPriceHistory(
    where: Partial<DBPriceHistory>,
  ): Promise<DBPriceHistory[]> {
    return this.knex<DBPriceHistory>("market_price_history")
      .where(where)
      .orderBy("date", "asc")
      .select()
  }

  async createService(data: Partial<DBService>): Promise<DBService[]> {
    return this.knex<DBService>("services").insert(data).returning("*")
  }

  async updateService(
    where: Partial<DBService>,
    data: Partial<DBService>,
  ): Promise<DBService[]> {
    return this.knex<DBService>("services")
      .update(data)
      .where(where)
      .returning("*")
  }

  async updateOrder(
    order_id: string,
    data: Partial<DBOrder>,
  ): Promise<DBOrder[]> {
    return this.knex<DBOrder>("orders")
      .where({ order_id })
      .update(data)
      .returning("*")
  }

  async updateOffer(id: string, data: Partial<DBOffer>): Promise<DBOffer[]> {
    return this.knex<DBOffer>("order_offers")
      .where({ id })
      .update(data)
      .returning("*")
  }

  async updateOfferSession(
    id: string,
    data: Partial<DBOfferSession>,
  ): Promise<DBOfferSession[]> {
    return this.knex<DBOfferSession>("offer_sessions")
      .where({ id })
      .update(data)
      .returning("*")
  }

  async updateOrderOffer(
    id: string,
    data: Partial<DBOffer>,
  ): Promise<DBOffer[]> {
    const query = this.knex<DBOffer>("order_offers")
      .where({ id })
      .update(data)
      .returning("*")
    return query
  }

  async updateMarketListing(
    listing_id: string,
    data: Partial<DBMarketListing>,
  ): Promise<void> {
    await this.knex<DBMarketListing>("market_listings")
      .where({ listing_id })
      .update(data)
  }

  async updateMarketMultiple(
    multiple_id: string,
    data: Partial<DBMarketMultiple>,
  ): Promise<void> {
    await this.knex<DBMarketMultiple>("market_multiples")
      .where({ multiple_id })
      .update(data)
  }

  async clearOrderApplications(order_id: string): Promise<void> {
    await this.knex<DBOrder>("orders").where({ order_id }).delete()
  }

  async insertWebhookAction(
    data: Partial<DBWebhookActions>,
  ): Promise<DBWebhookActions[]> {
    return this.knex<DBWebhookActions>("webhook_actions")
      .insert(data)
      .returning("*")
  }

  async createNotificationWebhook(
    data: Partial<DBNotificationWebhook>,
  ): Promise<DBNotificationWebhook[]> {
    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .insert(data)
      .returning("*")
  }

  async deleteNotificationWebhook(
    where: Partial<DBNotificationWebhook>,
  ): Promise<DBNotificationWebhook[]> {
    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .delete()
      .where(where)
      .returning("*")
  }

  async getNotificationWebhooks(
    where: Partial<DBNotificationWebhook>,
  ): Promise<DBNotificationWebhook[]> {
    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .select("*")
      .where(where)
  }

  async getNotificationWebhooksByAction(
    where: any,
    action_type_name: string,
  ): Promise<DBNotificationWebhook[]> {
    const action = await this.getNotificationActionByName(action_type_name)

    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .join(
        "webhook_actions",
        "notification_webhooks.webhook_id",
        "=",
        "webhook_actions.webhook_id",
      )
      .where(where)
      .andWhere({ action_type_id: action.action_type_id })
      .select("notification_webhooks.*")
  }

  async getNotificationWebhook(
    where: any,
  ): Promise<DBNotificationWebhook | null> {
    return this.knex<DBNotificationWebhook>("notification_webhooks")
      .where(where)
      .first("*")
  }

  async getTransaction(where: any): Promise<DBTransaction> {
    const transaction = await this.knex<DBTransaction>("transactions")
      .where(where)
      .first()

    if (!transaction) {
      throw new Error("Invalid transaction!")
    }

    return transaction
  }

  async getTransactions(where: any): Promise<DBTransaction[]> {
    return this.knex<DBTransaction>("transactions").where(where).select()
  }

  async getUserTransactions(user_id: string): Promise<DBTransaction[]> {
    return this.knex<DBTransaction>("transactions")
      .where({ user_sender_id: user_id })
      .or.where({ user_recipient_id: user_id })
      .select()
  }

  async getContractorTransactions(
    contractor_id: string,
  ): Promise<DBTransaction[]> {
    return this.knex<DBTransaction>("transactions")
      .where({ contractor_sender_id: contractor_id })
      .or.where({ contractor_recipient_id: contractor_id })
      .select()
  }

  async createTransaction(data: any): Promise<void> {
    await this.knex<DBTransaction>("transactions").insert(data)
  }

  async insertPost(postBody: PostBody): Promise<DBPost> {
    return (
      await this.knex<DBPost>("posts")
        .insert({
          user_id: postBody.user_id,
          caption: postBody.caption,
          description: postBody.description,
        })
        .returning("*")
    )[0]
  }

  async getPost(where: any) {
    const post = await this.knex<DBPost>("posts").where(where).first()

    if (!post) {
      return null
    }

    return post as DBPost
  }

  async getPostPhotos(where: any) {
    return this.knex<DBPostPhoto>("post_photos").where(where).select()
  }

  async getPostLikeCount(
    where: any,
    user_id?: string,
  ): Promise<{
    count: number
    liked?: boolean
  }> {
    // @ts-ignore
    const count: {
      CNT: string
    }[] = await this.knex<{
      CNT: string
    }>("likes")
      .where(where)
      .count("* as CNT")
      .select()

    if (!count[0]!.CNT) {
      return { count: 0, liked: false }
    } else {
      const res = { count: +count[0]!.CNT, liked: false }
      // @ts-ignore
      const liked: {
        CNT: string
      }[] = await this.knex<{
        CNT: string
      }>("likes")
        .where({ ...where, user_id: user_id })
        .count("* as CNT")
        .select()
      res.liked = !!+liked[0]!.CNT
      return res
    }
  }

  async updatePost(where: any, values: any) {
    await this.knex<DBPost>("posts").where(where).update(values)
  }

  async insertPostPhoto(post_id: string, filename: string): Promise<void> {
    await this.knex<DBPostPhoto>("post_photos").insert({
      post_id: post_id,
      filename: filename,
    })
  }

  async getChat(where: Partial<DBChat>): Promise<DBChat> {
    const chat = await this.knex<DBChat>("chats").where(where).first()

    if (!chat) {
      throw new Error("Invalid chat!")
    }

    return chat as DBChat
  }

  async updateChat(
    where: Partial<DBChat>,
    values: Partial<DBChat>,
  ): Promise<DBChat[]> {
    return this.knex<DBChat>("chats").where(where).update(values).returning("*")
  }

  async getChatParticipants(where: any): Promise<string[]> {
    const res = await this.knex<DBChatParticipant>("chat_participants")
      .where(where)
      .select()

    return res.map((r) => r.user_id)
  }

  async getMostRecentMessage(where: any): Promise<DBMessage | undefined> {
    return this.knex<DBMessage>("messages")
      .where(where)
      .orderBy("timestamp", "desc")
      .first()
  }

  getChatByParticipant(participant: string): Promise<DBChat[]> {
    return this.knex<DBChat>("chats")
      .join("chat_participants", "chats.chat_id", "chat_participants.chat_id")
      .where({
        "chat_participants.user_id": participant,
      })
      .select("chats.*")
  }

  async getMessage(where: any): Promise<DBMessage | null> {
    const message = await this.knex<DBMessage>("messages").where(where).first()

    if (!message) {
      return null
    }

    return message as DBMessage
  }

  getMessages(where: Partial<DBMessage>): Promise<DBMessage[]> {
    return this.knex<DBMessage>("messages")
      .where(where)
      .orderBy("timestamp", "ASC")
      .select("*")
  }

  async insertChat(
    participants: string[],
    order_id?: string,
    session_id?: string,
  ): Promise<DBChat> {
    const chat = (
      await this.knex<DBChat>("chats")
        .insert({ order_id, session_id })
        .returning("*")
    )[0]

    for (const participant of participants) {
      await this.knex<DBChatParticipant>("chat_participants").insert({
        chat_id: chat.chat_id,
        user_id: participant,
      })
    }

    return chat
  }

  async insertMessage(messageBody: MessageBody): Promise<DBMessage> {
    return (
      await this.knex<DBMessage>("messages").insert(messageBody).returning("*")
    )[0]
  }

  async updateMessage(where: any, values: any) {
    await this.knex<DBMessage>("messages").where(where).update(values)
  }

  async deleteMessage(where: any) {
    await this.knex<DBMessage>("messages").where(where).delete()
  }

  async getFeed(user_id: string, page: number): Promise<DBPost[]> {
    const follows = await this.knex<DBFollow>("follows")
      .where("user_id", user_id)
      .select()

    const follow_ids = (follows || []).map((item) => item.followed)
    follow_ids.push(user_id)

    return this.knex<DBPost>("posts")
      .whereRaw("user_id = ANY(?)", [follow_ids])
      .orderBy("time", "DESC")
      .limit(25)
      .offset(25 * page)
      .select("*")
  }

  async getProfilePhotos(username: string): Promise<DBPostPhoto[]> {
    const user = await this.getUser({ username: username })

    if (!user) {
      throw new Error(`Invalid user ${username}!`)
    }

    return this.knex<DBPostPhoto>("post_photos")
      .join("posts", "posts.post_id", "=", "post_photos.post_id")
      .where("posts.user_id", user.user_id)
      .select("post_photos.*")
  }

  followUser(follower: string, followed: string): Promise<void> {
    return this.knex("follows").insert({
      user_id: follower,
      followed: followed,
    })
  }

  // Blocklist methods
  async blockUser(
    blocker_id: string,
    blocked_id: string,
    blocker_type: "user" | "contractor",
    reason?: string,
  ): Promise<DBBlocklist> {
    const insertData: any = {
      blocker_id, // Keep for backward compatibility
      blocked_id,
      blocker_type,
      reason: reason || "",
    }

    // Set the appropriate blocker column based on type
    if (blocker_type === "user") {
      insertData.blocker_user_id = blocker_id
      insertData.blocker_contractor_id = null
    } else {
      insertData.blocker_user_id = null
      insertData.blocker_contractor_id = blocker_id
    }

    const [blocklist] = await this.knex<DBBlocklist>("blocklist")
      .insert(insertData)
      .returning("*")
    return blocklist
  }

  async unblockUser(
    blocker_id: string,
    blocked_id: string,
    blocker_type: "user" | "contractor",
  ): Promise<void> {
    const whereClause: any = {
      blocked_id,
      blocker_type,
    }

    // Use the appropriate blocker column based on type
    if (blocker_type === "user") {
      whereClause.blocker_user_id = blocker_id
    } else {
      whereClause.blocker_contractor_id = blocker_id
    }

    await this.knex("blocklist").where(whereClause).delete()
  }

  async isUserBlocked(
    blocker_id: string,
    blocked_id: string,
    blocker_type: "user" | "contractor",
  ): Promise<boolean> {
    const whereClause: any = {
      blocked_id,
      blocker_type,
    }

    // Use the appropriate blocker column based on type
    if (blocker_type === "user") {
      whereClause.blocker_user_id = blocker_id
    } else {
      whereClause.blocker_contractor_id = blocker_id
    }

    const block = await this.knex<DBBlocklist>("blocklist")
      .where(whereClause)
      .first()
    return !!block
  }

  async getUserBlocklist(
    blocker_id: string,
    blocker_type: "user" | "contractor",
  ): Promise<DBBlocklist[]> {
    const whereClause: any = {
      blocker_type,
    }

    // Use the appropriate blocker column based on type
    if (blocker_type === "user") {
      whereClause.blocker_user_id = blocker_id
    } else {
      whereClause.blocker_contractor_id = blocker_id
    }

    return this.knex<DBBlocklist>("blocklist")
      .where(whereClause)
      .orderBy("created_at", "desc")
  }

  async getBlockedByUsers(user_id: string): Promise<DBBlocklist[]> {
    return this.knex<DBBlocklist>("blocklist")
      .where("blocked_id", user_id)
      .orderBy("created_at", "desc")
  }

  async checkIfBlockedForOrder(
    customer_id: string,
    contractor_id: string | null,
    assigned_id: string | null,
  ): Promise<boolean> {
    // Check if customer is blocked by contractor
    if (contractor_id) {
      const contractorBlock = await this.knex<DBBlocklist>("blocklist")
        .where({
          blocker_contractor_id: contractor_id,
          blocked_id: customer_id,
          blocker_type: "contractor",
        })
        .first()
      if (contractorBlock) return true
    }

    // Check if customer is blocked by assigned user
    if (assigned_id) {
      const userBlock = await this.knex<DBBlocklist>("blocklist")
        .where({
          blocker_user_id: assigned_id,
          blocked_id: customer_id,
          blocker_type: "user",
        })
        .first()
      if (userBlock) return true
    }

    return false
  }

  insertLike(body: { post_id: string; user_id: string }): Promise<void> {
    return this.knex("likes").insert(body)
  }

  searchUsers(query: string): Promise<DBUser[]> {
    return this.knex<DBUser>("accounts")
      .where("username", "ilike", `%${query}%`)
      .or.where("display_name", "ilike", `%${query}%`)
      .limit(25)
      .select()
  }

  /**
   * @deprecated
   * @param query
   * @param contractor_id
   */
  searchOrgMembers(
    query: string,
    contractor_id: string,
  ): Promise<
    (DBUser & {
      role: "admin" | "owner" | "member"
    })[]
  > {
    return this.knex<
      DBUser & {
        role: "admin" | "owner" | "member"
      }
    >("accounts")
      .join(
        "contractor_members",
        "accounts.user_id",
        "=",
        "contractor_members.user_id",
      )
      .where("contractor_members.contractor_id", contractor_id)
      .where("username", "ilike", `%${query}%`)
      .or.where("display_name", "ilike", `%${query}%`)
      .select("accounts.*", "contractor_members.role")
  }

  searchContractors(query: string): Promise<DBContractor[]> {
    return this.knex<DBContractor>("contractors")
      .where({ archived: false })
      .andWhere((qb) => {
        qb.where("spectrum_id", "ilike", `%${query}%`).orWhere(
          "name",
          "ilike",
          `%${query}%`,
        )
      })
      .select()
  }

  async getShips(where: any): Promise<DBShip[]> {
    return this.knex<DBShip>("ships").where(where).select()
  }

  async getShip(where: any): Promise<DBShip | undefined> {
    return this.knex<DBShip>("ships").where(where).first()
  }

  async createShip(body: any): Promise<DBShip[]> {
    return this.knex<DBShip>("ships").insert(body).returning("*")
  }

  async createDelivery(data: any): Promise<void> {
    await this.knex<DBDelivery>("deliveries").insert(data)
  }

  async getDeliveries(where: any): Promise<DBDelivery[]> {
    return this.knex<DBDelivery>("deliveries").where(where).select()
  }

  async getMarketListing(where: any): Promise<DBMarketListing> {
    const listing = await this.knex<DBMarketListing>("market_listings")
      .where(where)
      .first()

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return listing
  }

  async getMarketListingDetails(
    where: Partial<DBMarketListingDetails>,
  ): Promise<DBMarketListingDetails> {
    const listing = await this.knex<DBMarketListingDetails>(
      "market_listing_details",
    )
      .where(where)
      .first()

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return listing
  }

  async getMarketUniqueListing(
    where: Partial<DBUniqueListing>,
  ): Promise<DBUniqueListing> {
    const listing = await this.knex<DBUniqueListing>("market_unique_listings")
      .where(where)
      .first()

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return listing
  }

  async getMarketListingComplete(
    listing_id: string,
  ): Promise<
    | DBUniqueListingComplete
    | DBAggregateListingComplete
    | DBMultipleListingCompositeComplete
  > {
    const listing = await this.getMarketListing({ listing_id })

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    if (listing.sale_type === "aggregate") {
      return this.getMarketAggregateListingComplete(listing.listing_id)
    } else if (listing.sale_type === "multiple") {
      return this.getMarketMultipleListingComplete(listing.listing_id)
    } else {
      return this.getMarketUniqueListingComplete(listing.listing_id)
    }
  }

  async formatUniqueRaw(
    listing: DBUniqueListingRaw,
  ): Promise<DBUniqueListingComplete> {
    return {
      listing_id: listing.listing_id,
      accept_offers: listing.accept_offers,
      details_id: listing.details_id,
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listing: {
        listing_id: listing.listing_id,
        sale_type: listing.sale_type,
        price: listing.price,
        quantity_available: listing.quantity_available,
        status: listing.status,
        internal: listing.internal,
        user_seller_id: listing.user_seller_id,
        contractor_seller_id: listing.contractor_seller_id,
        timestamp: listing.timestamp,
        expiration: listing.expiration,
      },
      images: await database.getMarketListingImages({
        details_id: listing.details_id,
      }),
    }
  }

  async getMarketUniqueListingComplete(
    listing_id: string,
  ): Promise<DBUniqueListingComplete> {
    const listing: DBUniqueListingRaw = await this.knex<DBUniqueListingRaw>(
      "market_unique_listings",
    )
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_unique_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where("market_unique_listings.listing_id", "=", listing_id)
      .first(
        "market_unique_listings.*",
        "market_listings.*",
        "market_listing_details.*",
        this.knex.ref("game_items.name").as("item_name"),
        // 'market_listings as listing',
        // 'market_listing_details as details',
      )

    if (!listing) {
      throw new Error(`Invalid listing! ${listing_id}`)
    }

    return this.formatUniqueRaw(listing)
  }

  async getMarketUniqueListingsComplete(
    where: any,
  ): Promise<DBUniqueListingComplete[]> {
    const listings = await this.knex<DBUniqueListingRaw>(
      "market_unique_listings",
    )
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_unique_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where(where)
      .select(
        "*",
        // 'market_listings as listing',
        // 'market_listing_details as details',
      )

    return Promise.all(listings.map((listing) => this.formatUniqueRaw(listing)))
  }

  async getListingsByGameItemID(
    game_item_id: string,
    listing_where: any,
  ): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .join(
        "market_unique_listings",
        "market_unique_listings.listing_id",
        "=",
        "market_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .where("market_listing_details.game_item_id", "=", game_item_id)
      .andWhere(listing_where)
      .select()
  }

  async getBuyOrdersByGameItemID(
    game_item_id: string,
    historic = false,
  ): Promise<DBBuyOrder[]> {
    const base = this.knex<DBBuyOrder>("market_buy_orders").where({
      game_item_id,
    })

    if (historic) {
      return base.select()
    } else {
      return base
        .andWhere("expiry", ">", this.knex.fn.now())
        .andWhere("fulfilled_timestamp", null)
    }
  }

  async formatAggregateRaw(
    listing: DBAggregateRaw,
    listing_where: any,
  ): Promise<DBAggregateComplete> {
    const listings = await this.getListingsByGameItemID(
      listing.game_item_id,
      listing_where,
    )
    const buy_orders = await this.getBuyOrdersByGameItemID(
      listing.game_item_id,
      false,
    )

    return {
      game_item_id: listing.game_item_id,
      details_id: listing.details_id,
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listings,
      buy_orders,
      images: await database.getMarketListingImages({
        details_id: listing.details_id,
      }),
    }
  }

  async getMarketAggregateComplete(
    game_item_id: string,
    listing_where: any,
  ): Promise<DBAggregateComplete> {
    const listing: DBAggregateRaw = await this.knex<DBAggregateRaw>(
      "game_items",
    )
      // .join('market_listings', 'market_listings.listing_id', '=', 'market_aggregate_listings.aggregate_listing_id')
      .join(
        "market_listing_details",
        "game_items.details_id",
        "=",
        "market_listing_details.details_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where("game_items.id", "=", game_item_id)
      .first(
        "game_items.*",
        "market_listing_details.*",
        this.knex.ref("game_items.name").as("item_name"),
      )

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return this.formatAggregateRaw(listing, listing_where)
  }

  async getMarketAggregatesComplete(
    where: any,
    listing_where: any,
    has_listings: boolean = false,
    has_buy_orders: boolean = false,
  ): Promise<DBAggregateComplete[]> {
    let listings = this.knex<DBAggregateRaw>("game_items").join(
      "market_listing_details",
      "game_items.details_id",
      "=",
      "market_listing_details.details_id",
    )
    if (has_listings) {
      listings = listings.where((pred) =>
        pred.whereExists(
          this.knex("market_unique_listings")
            .where(
              "market_unique_listings.details_id",
              "=",
              this.knex.raw("market_listing_details.details_id"),
            )
            .select(),
        ),
      )
    } else if (has_buy_orders) {
      listings = listings.where((pred) =>
        pred.whereExists(
          this.knex("market_buy_orders")
            .where(
              "market_buy_orders.game_item_id",
              "=",
              this.knex.raw("game_items.id"),
            )
            .select(),
        ),
      )
    }
    // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
    listings = listings.andWhere(where).select("*")

    return Promise.all(
      (await listings).map((listing) =>
        this.formatAggregateRaw(listing, listing_where),
      ),
    )
  }

  async getMarketBuyOrdersComplete() {
    const q = this.knex<DBAggregateRaw>("game_items")
      .join(
        "market_listing_details",
        "game_items.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .whereExists(
        this.knex("market_buy_orders")
          .where(
            "market_buy_orders.game_item_id",
            "=",
            this.knex.raw("game_items.id"),
          )
          .select(),
      )

    return Promise.all(
      (await q).map((listing) =>
        this.formatAggregateRaw(listing, { status: "active" }),
      ),
    )
  }

  async formatAggregateListingRaw(
    listing: DBAggregateListingRaw,
  ): Promise<DBAggregateListingComplete> {
    return {
      aggregate: {
        game_item_id: listing.game_item_id,
        details_id: listing.details_id,
      },
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listing: {
        listing_id: listing.listing_id,
        sale_type: listing.sale_type,
        price: listing.price,
        quantity_available: listing.quantity_available,
        status: listing.status,
        internal: listing.internal,
        user_seller_id: listing.user_seller_id,
        contractor_seller_id: listing.contractor_seller_id,
        timestamp: listing.timestamp,
        expiration: listing.expiration,
      },
      images: await database.getMarketListingImages({
        details_id: listing.details_id,
      }),
    }
  }

  async getMarketAggregateListingComplete(
    listing_id: string,
  ): Promise<DBAggregateListingComplete> {
    const listing: DBAggregateListingRaw =
      await this.knex<DBAggregateListingRaw>("market_listings")
        .join(
          "market_unique_listings",
          "market_listings.listing_id",
          "=",
          "market_unique_listings.listing_id",
        )
        .join(
          "market_listing_details",
          "market_aggregates.details_id",
          "=",
          "market_listing_details.details_id",
        )
        .leftJoin(
          "game_items",
          "game_items.id",
          "=",
          "market_listing_details.game_item_id",
        )
        // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
        .where("market_listings.listing_id", "=", listing_id)
        .first(
          "market_listings.*",
          "market_unique_listings.*",
          "market_listing_details.*",
          this.knex.ref("game_items.name").as("item_name"),
        )

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return this.formatAggregateListingRaw(listing)
  }

  async formatMultipleRaw(
    listing: DBMultipleRaw,
    listing_where: any,
  ): Promise<DBMultipleComplete> {
    const listings = await this.getMarketMultipleListingsComplete({
      "market_multiples.multiple_id": listing.multiple_id,
      ...listing_where,
    })

    return {
      contractor_seller_id: listing.contractor_seller_id,
      default_listing: listings.find(
        (l) => l.listing.listing_id === listing.default_listing_id,
      )!,
      default_listing_id: listing.default_listing_id,
      user_seller_id: listing.user_seller_id,
      multiple_id: listing.multiple_id,
      details_id: listing.details_id,
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listings,
    }
  }

  async getMarketMultipleComplete(
    multiple_id: string,
    listing_where: any,
  ): Promise<DBMultipleComplete> {
    const listing: DBMultipleRaw = await this.knex<DBMultipleRaw>(
      "market_multiples",
    )
      // .join('market_listings', 'market_listings.listing_id', '=', 'market_aggregate_listings.aggregate_listing_id')
      .join(
        "market_listing_details",
        "market_multiples.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where("market_multiples.multiple_id", "=", multiple_id)
      .first(
        "market_multiples.*",
        "market_listing_details.*",
        this.knex.ref("game_items.name").as("item_name"),
      )

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return this.formatMultipleRaw(listing, listing_where)
  }

  async getMarketMultiplesComplete(
    where: any,
    listing_where: any,
    has_listings: boolean = false,
  ): Promise<DBMultipleComplete[]> {
    let listings
    if (has_listings) {
      listings = await this.knex<DBMultipleRaw>("market_multiples")
        .join(
          "market_listing_details",
          "market_multiples.details_id",
          "=",
          "market_listing_details.details_id",
        )
        .leftJoin(
          "game_items",
          "game_items.id",
          "=",
          "market_listing_details.game_item_id",
        )
        .where(where)
        .select(
          "market_multiples.*",
          "market_listing_details.*",
          this.knex.ref("game_items.name").as("item_name"),
        )
    } else {
      listings = await this.knex<DBMultipleRaw>("market_multiples")
        .join(
          "market_listing_details",
          "market_multiples.details_id",
          "=",
          "market_listing_details.details_id",
        )
        .leftJoin(
          "game_items",
          "game_items.id",
          "=",
          "market_listing_details.game_item_id",
        )
        // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
        .whereExists(
          this.knex("market_multiple_listings")
            .where(
              "market_multiple_listings.multiple_id",
              "=",
              this.knex.raw("market_multiples.multiple_id"),
            )
            .select("*", this.knex.ref("game_items.name").as("item_name")),
        )
        .where(where)
        .select("*")
    }

    return Promise.all(
      listings.map((listing) => this.formatMultipleRaw(listing, listing_where)),
    )
  }

  async formatMultipleListingRaw(
    listing: DBMultipleListingRaw,
  ): Promise<DBMultipleListingCompositeComplete> {
    return {
      multiple: {
        multiple_id: listing.multiple_id,
        details_id: listing.multiple_details_id,
        default_listing_id: listing.default_listing_id,
        user_seller_id: listing.user_seller_id,
        contractor_seller_id: listing.contractor_seller_id,
      },
      details: {
        details_id: listing.details_id,
        item_type: listing.item_type,
        item_name: listing.item_name,
        game_item_id: listing.game_item_id,
        title: listing.title,
        description: listing.description,
      },
      listing: {
        listing_id: listing.listing_id,
        sale_type: listing.sale_type,
        price: listing.price,
        quantity_available: listing.quantity_available,
        status: listing.status,
        internal: listing.internal,
        user_seller_id: listing.user_seller_id,
        contractor_seller_id: listing.contractor_seller_id,
        timestamp: listing.timestamp,
        expiration: listing.expiration,
      },
      images: await database.getMarketListingImages({
        details_id: listing.details_id,
      }),
    }
  }

  async getMarketMultipleListingComplete(
    listing_id: string,
  ): Promise<DBMultipleListingCompositeComplete> {
    const listing: DBMultipleListingRaw = await this.knex<DBMultipleListingRaw>(
      "market_listings",
    )
      .join(
        "market_multiple_listings",
        "market_listings.listing_id",
        "=",
        "market_multiple_listings.multiple_listing_id",
      )
      .join(
        "market_multiples",
        "market_multiples.multiple_id",
        "=",
        "market_multiple_listings.multiple_id",
      )
      .join(
        "market_listing_details",
        "market_multiple_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where("market_listings.listing_id", "=", listing_id)
      .first(
        "market_listings.*",
        "market_multiples.*",
        "market_listing_details.*",
        this.knex.ref("game_items.name").as("item_name"),
        this.knex.ref("market_multiple_listings.details_id").as("details_id"),
        this.knex.ref("market_multiples.details_id").as("multiple_details_id"),
      )

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return this.formatMultipleListingRaw(listing)
  }

  async getMarketMultipleListingsComplete(
    where: any,
  ): Promise<DBMultipleListingCompositeComplete[]> {
    const listings = await this.knex<DBMultipleListingRaw>("market_listings")
      .join(
        "market_multiple_listings",
        "market_listings.listing_id",
        "=",
        "market_multiple_listings.multiple_listing_id",
      )
      .join(
        "market_multiples",
        "market_multiples.multiple_id",
        "=",
        "market_multiple_listings.multiple_id",
      )
      .join(
        "market_listing_details",
        "market_multiple_listings.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      // .join('market_images', 'market_images.details_id', '=', 'market_listing_details.details_id')
      .where(where)
      .select(
        "market_listings.*",
        "market_multiples.*",
        "market_listing_details.*",
        this.knex.ref("market_multiple_listings.details_id").as("details_id"),
        this.knex.ref("market_multiples.details_id").as("multiple_details_id"),
        this.knex.ref("game_items.name").as("item_name"),
      )

    return Promise.all(
      listings.map((listing) => this.formatMultipleListingRaw(listing)),
    )
  }

  async getMarketOffers(where: any): Promise<DBMarketOffer[]> {
    return this.knex<DBMarketOffer>("market_offers").where(where).select()
  }

  async removeMarketOffers(where: any): Promise<DBMarketOffer[]> {
    return this.knex<DBMarketOffer>("market_offers")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeMarketOfferListings(where: any): Promise<DBMarketOfferListing[]> {
    return this.knex<DBMarketOfferListing>("market_offer_listings")
      .where(where)
      .delete()
      .returning("*")
  }

  async getMarketBids(where: any): Promise<DBMarketBid[]> {
    return this.knex<DBMarketBid>("market_bids").where(where).select()
  }

  async getAuctionDetail(where: any): Promise<DBAuctionDetails | undefined> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .where(where)
      .first()
  }

  async getAuctionDetails(where: any): Promise<DBAuctionDetails[]> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .where(where)
      .select()
  }

  async createAuctionDetails(values: any): Promise<DBAuctionDetails[]> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .insert(values)
      .returning("*")
  }

  async updateAuctionDetails(
    where: any,
    values: any,
  ): Promise<DBAuctionDetails[]> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .where(where)
      .update(values)
  }

  async getExpiringMarketListings(): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .where("expiration", "<=", this.knex.raw("now()"))
      .andWhere("status", "active")
      .select()
  }

  async getExpiringAuctions(): Promise<DBAuctionDetails[]> {
    return this.knex<DBAuctionDetails>("market_auction_details")
      .where("end_time", "<=", this.knex.raw("now()"))
      .select()
  }

  async removeMarketBids(where: any): Promise<DBMarketBid[]> {
    const bids = await this.knex<DBMarketBid>("market_bids")
      .where(where)
      .delete()
      .returning("*")

    const action = await this.getNotificationActionByName("market_item_bid")
    for (const bid of bids) {
      await this.removeNotificationObjects({
        entity_id: bid.bid_id,
        action_type_id: action.action_type_id,
      })
    }

    return bids
  }

  async getMarketOrder(where: any): Promise<DBMarketListing> {
    const listing = await this.knex<DBMarketListing>("market_orders")
      .where(where)
      .first()

    if (!listing) {
      throw new Error("Invalid listing!")
    }

    return listing
  }

  async getMarketListingImages(
    where: Partial<DBMarketListingImage>,
  ): Promise<DBMarketListingImage[]> {
    return this.knex<DBMarketListingImage>("market_images")
      .where(where)
      .select()
  }

  async getServiceListingImages(
    where: Partial<DBServiceImage>,
  ): Promise<DBServiceImage[]> {
    return this.knex<DBServiceImage>("service_images").where(where).select()
  }

  async getMarketListingImagesResolved(
    where: Partial<DBMarketListingImage>,
  ): Promise<string[]> {
    const images = await this.getMarketListingImages(where)
    const urls = await Promise.all(
      images.map((entry) => cdn.getFileLinkResource(entry.resource_id)),
    )
    return urls.filter((x) => x) as string[]
  }

  async getServiceListingImagesResolved(
    where: Partial<DBServiceImage>,
  ): Promise<string[]> {
    const images = await this.getServiceListingImages(where)
    const urls = await Promise.all(
      images.map((entry) => cdn.getFileLinkResource(entry.resource_id)),
    )
    return urls.filter((x) => x) as string[]
  }

  async getMarketListingImagesByListingID(
    listing: DBMarketListing,
  ): Promise<DBMarketListingImage[]> {
    if (listing.sale_type === "aggregate") {
      const complete = await this.getMarketAggregateListingComplete(
        listing.listing_id,
      )
      return complete.images
    } else {
      const complete = await this.getMarketUniqueListingComplete(
        listing.listing_id,
      )
      return complete.images
    }
  }

  async deleteMarketListingImages(
    where: Partial<DBMarketListingImage>,
  ): Promise<DBMarketListingImage[]> {
    return this.knex<DBMarketListingImage>("market_images")
      .where(where)
      .delete()
      .returning("*")
  }

  async deleteServiceImages(
    where: Partial<DBServiceImage>,
  ): Promise<DBServiceImage[]> {
    return this.knex<DBServiceImage>("service_images")
      .where(where)
      .delete()
      .returning("*")
  }

  async getMarketListingOrders(
    where: Partial<DBMarketOrder>,
  ): Promise<DBMarketOrder[]> {
    return this.knex<DBMarketOrder>("market_orders").where(where).select()
  }

  async getOrdersForListingPaginated(params: {
    listing_id: string
    page?: number
    pageSize?: number
    status?: string[]
    sortBy?: "timestamp" | "status"
    sortOrder?: "asc" | "desc"
  }): Promise<{
    orders: DBOrder[]
    pagination: {
      currentPage: number
      pageSize: number
      totalItems: number
      totalPages: number
      hasNextPage: boolean
      hasPreviousPage: boolean
    }
  }> {
    const {
      listing_id,
      page = 1,
      pageSize = 20,
      status,
      sortBy = "timestamp",
      sortOrder = "desc",
    } = params

    // Build the base query
    let query = this.knex<DBOrder>("orders")
      .join("market_orders", "market_orders.order_id", "=", "orders.order_id")
      .where("market_orders.listing_id", listing_id)

    // Apply status filter if provided
    if (status && status.length > 0) {
      query = query.whereIn("orders.status", status)
    }

    // Get total count for pagination
    const [{ count }] = await query.clone().count("* as count")
    const totalItems = parseInt(count as string)
    const totalPages = Math.ceil(totalItems / pageSize)
    const offset = (page - 1) * pageSize

    // Apply sorting and pagination
    const orders = await query
      .orderBy(`orders.${sortBy}`, sortOrder)
      .limit(pageSize)
      .offset(offset)
      .select("orders.*")

    return {
      orders,
      pagination: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    }
  }

  async insertMarketListingOrder(
    data: Partial<DBMarketOrder>,
  ): Promise<DBMarketOrder[]> {
    return this.knex<DBMarketOrder>("market_orders").insert(data).returning("*")
  }

  async insertOfferMarketListing(
    data: Partial<DBOfferMarketListing> | Partial<DBOfferMarketListing>[],
  ): Promise<DBOfferMarketListing[]> {
    return this.knex<DBOfferMarketListing>("offer_market_items")
      .insert(data)
      .returning("*")
  }

  async getOfferMarketListings(
    offer_id: string,
  ): Promise<DBOfferMarketListing[]> {
    return this.knex<DBOfferMarketListing>("offer_market_items")
      .where({ offer_id })
      .select()
  }

  async getOfferMarketListingCount(offer_id: string): Promise<{ sum: number }> {
    return this.knex<DBOfferMarketListing>("offer_market_items")
      .where({ offer_id })
      .first(this.knex.raw("COALESCE(SUM(quantity), 0) as sum"))
  }

  async getOrderMarketListingCount(order_id: string): Promise<{ sum: number }> {
    return this.knex<DBMarketOrder>("market_orders")
      .where({ order_id })
      .first(this.knex.raw("COALESCE(SUM(quantity), 0) as sum"))
  }

  async getOfferSessions(
    where: Partial<DBOfferSession>,
  ): Promise<DBOfferSession[]> {
    return this.knex<DBOfferSession>("offer_sessions").where(where).select()
  }

  async getUserMarketListings(user_id: string): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .join(
        "accounts",
        "accounts.user_id",
        "=",
        "market_listings.user_seller_id",
      )
      .where({ user_seller_id: user_id })
      .select("market_listings.*")
  }

  async getPublicMarketListings(): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .where({ status: "active", internal: false })
      .select("market_listings.*")
  }

  async getMarketListings(
    where: Partial<DBMarketListing>,
  ): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .where(where)
      .select("market_listings.*")
  }

  async getMarketAggregates(
    where: Partial<DBMarketAggregate>,
  ): Promise<DBMarketAggregate[]> {
    return this.knex<DBMarketAggregate>("market_aggregates")
      .where(where)
      .select("market_aggregates.*")
  }

  async getMarketAggregate(
    where: Partial<DBMarketAggregate>,
  ): Promise<DBMarketAggregate | undefined> {
    return this.knex<DBMarketAggregate>("market_aggregates")
      .where(where)
      .first()
  }

  async getMarketAggregateListings(
    where: any,
  ): Promise<DBMarketAggregateListing[]> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_aggregate_listings.aggregate_listing_id",
      )
      .where(where)
      .select("*")
  }

  async updateMarketAggregateListing(
    aggregate_id: string,
    data: Partial<DBMarketAggregateListing>,
  ): Promise<DBMarketAggregateListing[]> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .where({ aggregate_id })
      .update(data)
      .returning("*")
  }

  async getMarketAggregateListing(
    where: Partial<DBMarketAggregateListing>,
  ): Promise<DBMarketAggregateListing | undefined> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .where(where)
      .first()
  }

  async createMarketMultiple(
    body: Partial<DBMarketMultiple> | Partial<DBMarketMultiple>[],
  ) {
    return this.knex<DBMarketMultiple>("market_multiples")
      .insert(body)
      .returning("*")
  }

  async createMarketMultipleListing(
    body: Partial<DBMarketMultipleListing> | Partial<DBMarketMultipleListing>[],
  ) {
    return this.knex<DBMarketMultipleListing>("market_multiple_listings")
      .insert(body)
      .returning("*")
  }

  async getMarketAggregateListingByUser(
    aggregate_id: string,
    user_seller_id: string,
  ): Promise<DBMarketAggregateListing | undefined> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_aggregate_listings.aggregate_listing_id",
      )
      .where({ user_seller_id, aggregate_id })
      .andWhere("status", "!=", "archived")
      .first()
  }

  async getMarketAggregateListingByContractor(
    aggregate_id: string,
    contractor_seller_id: string,
  ): Promise<DBMarketAggregateListing | undefined> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .join(
        "market_listings",
        "market_listings.listing_id",
        "=",
        "market_aggregate_listings.aggregate_listing_id",
      )
      .where({ contractor_seller_id, aggregate_id })
      .andWhere("status", "!=", "archived")
      .first()
  }

  async insertMarketAggregate(
    body: Partial<DBMarketAggregate>,
  ): Promise<DBMarketAggregate[]> {
    return this.knex<DBMarketAggregate>("market_aggregates")
      .insert(body)
      .returning("*")
  }

  async updateMarketAggregate(
    where: Partial<DBMarketAggregate>,
    values: Partial<DBMarketAggregate>,
  ): Promise<DBMarketAggregate[]> {
    return this.knex<DBMarketAggregate>("market_aggregates")
      .where(where)
      .update(values)
      .returning("*")
  }

  async insertMarketAggregateListing(
    body: Partial<DBMarketAggregateListing>,
  ): Promise<DBMarketAggregateListing[]> {
    return this.knex<DBMarketAggregateListing>("market_aggregate_listings")
      .insert(body)
      .returning("*")
  }

  async getContractorMarketListings(where: any): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .join(
        "contractors",
        "contractors.contractor_id",
        "=",
        "market_listings.contractor_seller_id",
      )
      .where(where)
      .select("market_listings.*")
  }

  async createMarketListing(
    body: Partial<DBMarketListing>,
  ): Promise<DBMarketListing[]> {
    return this.knex<DBMarketListing>("market_listings")
      .insert(body)
      .returning("*")
  }

  async createUniqueListing(
    body: Partial<DBUniqueListing>,
  ): Promise<DBUniqueListing[]> {
    return this.knex<DBUniqueListing>("market_unique_listings")
      .insert(body)
      .returning("*")
  }

  async removeUniqueListing(
    where: Partial<DBUniqueListing>,
  ): Promise<DBUniqueListing[]> {
    return this.knex<DBUniqueListing>("market_unique_listings")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeMultipleListing(
    where: Partial<DBMarketMultipleListing>,
  ): Promise<DBMarketMultipleListing[]> {
    return this.knex<DBMarketMultipleListing>("market_multiple_listings")
      .where(where)
      .delete()
      .returning("*")
  }

  async createListingDetails(
    body: Partial<DBMarketListingDetailsBase>,
  ): Promise<DBMarketListingDetails[]> {
    return this.knex<DBMarketListingDetails>("market_listing_details")
      .insert(body)
      .returning("*")
  }

  async updateListingDetails(
    where: Partial<DBMarketListingDetails>,
    values: Partial<DBMarketListingDetails>,
  ): Promise<DBMarketListingDetails[]> {
    return this.knex<DBMarketListingDetails>("market_listing_details")
      .where(where)
      .update(values)
      .returning("*")
  }

  async createMarketBid(data: Partial<DBMarketBid>): Promise<DBMarketBid[]> {
    return this.knex<DBMarketBid>("market_bids").insert(data).returning("*")
  }

  async deleteMarketBids(where: any): Promise<DBMarketBid[]> {
    return this.knex<DBMarketBid>("market_bids")
      .where(where)
      .delete()
      .returning("*")
  }

  async createOrderOfferSession(
    data: Partial<
      Omit<DBOfferSession, "timestamp"> & { timestamp: string | Date }
    >,
  ): Promise<DBOfferSession[]> {
    return this.knex<DBOfferSession>("offer_sessions")
      .insert(data as DBOfferSession)
      .returning("*")
  }

  async createOrderOffer(
    data: Partial<Omit<DBOffer, "timestamp"> & { timestamp: string | Date }>,
  ): Promise<DBOffer[]> {
    return this.knex<DBOffer>("order_offers")
      .insert(data as DBOffer)
      .returning("*")
  }

  async insertMarketDetailsPhoto(value: Partial<DBMarketListingImage>) {
    return this.knex<DBMarketListingImage>("market_images")
      .insert(value)
      .returning("*")
  }

  async insertMarketListingPhoto(
    listing: DBMarketListing,
    items: {
      resource_id?: string
      aggregate_id?: string
    }[],
  ) {
    const unique = await database.getMarketUniqueListingComplete(
      listing.listing_id,
    )
    return this.knex<DBMarketListingImage>("market_images")
      .insert(
        items.map((o) => ({ ...o, details_id: unique.details.details_id })),
      )
      .returning("*")
  }

  async insertServiceImage(body: DBServiceImage) {
    return this.knex<DBServiceImage>("service_images")
      .insert(body)
      .returning("*")
  }

  // Notifications
  async insertNotificationObjects(items: Partial<DBNotificationObject>[]) {
    return this.knex<DBNotificationObject>("notification_object")
      .insert(items)
      .returning("*")
  }

  async removeNotificationObjects(where: any) {
    return this.knex<DBNotificationObject>("notification_object")
      .where(where)
      .delete()
      .returning("*")
  }

  async insertNotifications(items: Partial<DBNotification>[]) {
    return this.knex<DBNotification>("notification")
      .insert(items)
      .returning("*")
  }

  async insertNotificationChange(items: Partial<DBNotificationChange>[]) {
    return this.knex<DBNotificationChange>("notification_change")
      .insert(items)
      .returning("*")
  }

  async getNotifications(where: Partial<DBNotification>) {
    return this.knex<DBNotification>("notification").select("*").where(where)
  }

  async updateNotifications(
    where: Partial<DBNotification>,
    values: Partial<DBNotification>,
  ) {
    return this.knex<DBNotification>("notification").update(values).where(where)
  }

  async deleteNotifications(where: Partial<DBNotification>) {
    return this.knex<DBNotification>("notification")
      .where(where)
      .delete()
      .returning("*")
  }

  async getNotificationObject(where: Partial<DBNotificationObject>) {
    return this.knex<DBNotificationObject>("notification_object")
      .select("*")
      .where(where)
  }

  async getNotificationAction(
    where: Partial<DBNotificationActions>,
  ): Promise<DBNotificationActions[]> {
    return this.knex<DBNotificationActions>("notification_actions")
      .select("*")
      .where(where)
  }

  async getNotificationChange(where: Partial<DBNotificationChange>) {
    return this.knex<DBNotificationChange>("notification_change")
      .select("*")
      .where(where)
  }

  async getEntityByType(entity_type: string, entity_id: string) {
    let order
    switch (entity_type) {
      case "orders":
        order = await this.getOrder({ order_id: entity_id })
        return serializeOrderDetails(order, null)
      case "order_reviews": {
        const review = await this.getOrderReview({ review_id: entity_id })
        order = await this.getOrder({ order_id: review!.order_id })
        return await formatReview(order, review!.role)
      }
      case "contractors":
        return await this.getMinimalContractor({ contractor_id: entity_id })
      case "market_listing": {
        const listing = await this.getMarketListing({ listing_id: entity_id })
        return await formatListing(listing)
      }
      case "contractor_invites": {
        const invite = await this.getContractorInvite({ invite_id: entity_id })
        return await formatInvite(invite!)
      }
      case "market_bids": {
        const bids = await this.getMarketBids({ bid_id: entity_id })
        return await formatBid(bids[0])
      }
      case "offer_sessions": {
        const [offers] = await this.getOfferSessions({ id: entity_id })
        return await serializeOfferSession(offers)
      }
      case "admin_alerts": {
        const alerts = await this.getAdminAlerts({ alert_id: entity_id })
        return alerts[0] || null
      }
      // case 'recruiting_comment_reply':
      //     const offers = await this.getMarketOffers({offer_id: entity_id})
      //     return await formatComment(offers[0])
      default:
        throw Error(`Invalid entity type ${entity_type}`)
    }
  }

  async getCompleteNotificationsByUser(user_id: string) {
    const notifs = await this.getNotifications({ notifier_id: user_id })

    const complete_notifs = []
    for (const notif of notifs) {
      const notif_object = await this.getNotificationObject({
        notification_object_id: notif.notification_object_id,
      })
      const notif_action = await this.getNotificationAction({
        action_type_id: notif_object[0].action_type_id,
      })
      const notif_change = await this.getNotificationChange({
        notification_object_id: notif.notification_object_id,
      })
      const actors = await Promise.all(
        notif_change.map((c) => this.getMinimalUser({ user_id: c.actor_id })),
      )

      let entity
      try {
        entity = await this.getEntityByType(
          notif_action[0].entity,
          notif_object[0].entity_id,
        )
      } catch (e) {
        // console.error(e)
        continue
      }
      complete_notifs.push({
        read: notif.read,
        notification_id: notif.notification_id,
        action: notif_action[0].action,
        actors: actors,
        entity_type: notif_action[0].entity,
        entity: entity,
        timestamp: notif_object[0].timestamp,
      })
    }

    complete_notifs.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    )

    return complete_notifs
  }

  async getCompleteNotificationsByUserPaginated(
    user_id: string,
    page: number,
    pageSize: number = 20,
    actionFilter?: string,
    entityIdFilter?: string,
  ) {
    // Build base query for filtering - will be reused for both counting and data fetching
    let baseQuery = this.knex<DBNotification>("notification").where({
      notifier_id: user_id,
    })

    // Always join notification_object for consistent filtering
    baseQuery = baseQuery.join(
      "notification_object",
      "notification.notification_object_id",
      "=",
      "notification_object.notification_object_id",
    )

    // Apply filters if provided
    if (actionFilter) {
      baseQuery = baseQuery
        .join(
          "notification_actions",
          "notification_object.action_type_id",
          "=",
          "notification_actions.action_type_id",
        )
        .where("notification_actions.action", actionFilter)
    }

    if (entityIdFilter) {
      baseQuery = baseQuery.where(
        "notification_object.entity_id",
        entityIdFilter,
      )
    }

    // Get total count for pagination metadata
    const totalCount = await baseQuery
      .clone()
      .count("notification.notification_id as count")
      .first()

    // Get paginated notifications using the same base query
    const notifs = await baseQuery
      .clone()
      .select("*")
      .orderBy("notification_object.timestamp", "desc")
      .offset(page * pageSize)
      .limit(pageSize)

    const complete_notifs = []
    for (const notif of notifs) {
      // Since we already joined notification_object in baseQuery,
      // we can access the timestamp directly from the joined result
      const notif_object = await this.getNotificationObject({
        notification_object_id: notif.notification_object_id,
      })
      const notif_action = await this.getNotificationAction({
        action_type_id: notif_object[0].action_type_id,
      })
      const notif_change = await this.getNotificationChange({
        notification_object_id: notif.notification_object_id,
      })
      const actors = await Promise.all(
        notif_change.map((c) => this.getMinimalUser({ user_id: c.actor_id })),
      )

      let entity
      try {
        entity = await this.getEntityByType(
          notif_action[0].entity,
          notif_object[0].entity_id,
        )
      } catch (e) {
        logger.error(
          `Failed to serialize notification ${notif.notification_id}: ${e}`,
        )
        continue
      }
      complete_notifs.push({
        read: notif.read,
        notification_id: notif.notification_id,
        action: notif_action[0].action,
        actors: actors,
        entity_type: notif_action[0].entity,
        entity: entity,
        timestamp: notif_object[0].timestamp,
      })
    }

    // Note: Sorting is now handled in the database query for consistency
    const total = totalCount ? parseInt((totalCount as any).count) : 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      notifications: complete_notifs,
      pagination: {
        currentPage: page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages - 1,
        hasPreviousPage: page > 0,
      },
    }
  }

  async getUnreadNotificationCount(
    user_id: string,
    actionFilter?: string,
    entityIdFilter?: string,
  ): Promise<number> {
    // Build base query for filtering unread notifications
    let baseQuery = this.knex<DBNotification>("notification").where({
      notifier_id: user_id,
      read: false,
    })

    // Apply filters if provided
    if (actionFilter || entityIdFilter) {
      baseQuery = baseQuery.join(
        "notification_object",
        "notification.notification_object_id",
        "=",
        "notification_object.notification_object_id",
      )

      if (actionFilter) {
        baseQuery = baseQuery
          .join(
            "notification_actions",
            "notification_object.action_type_id",
            "=",
            "notification_actions.action_type_id",
          )
          .where("notification_actions.action", actionFilter)
      }

      if (entityIdFilter) {
        baseQuery = baseQuery.where(
          "notification_object.entity_id",
          entityIdFilter,
        )
      }
    }

    // Get count of unread notifications
    const result = await baseQuery
      .count("notification.notification_id as count")
      .first()

    return result ? parseInt((result as any).count) : 0
  }

  async getNotificationActionByName(
    name: string,
  ): Promise<DBNotificationActions> {
    const result = await this.knex<DBNotificationActions>(
      "notification_actions",
    )
      .where({ action: name })
      .first()

    return result!
  }

  async getAllRecruitingPosts() {
    return this.knex<DBRecruitingPost>("recruiting_posts").select()
  }

  async getAllRecruitingPostsPaginated(searchQuery: RecruitingSearchQuery) {
    // ['rating', 'name', 'activity', 'all-time']
    const knex = this.knex
    let query = this.knex<DBRecruitingPost>("recruiting_posts").whereIn(
      "recruiting_posts.contractor_id",
      this.knex("contractors")
        .select("contractor_id")
        .where("contractors.archived", false),
    )

    switch (searchQuery.sorting) {
      case "name":
        query = query
          .join(
            "contractors",
            "contractors.contractor_id",
            "=",
            "recruiting_posts.contractor_id",
          )
          .orderBy("contractors.name", searchQuery.reverseSort ? "asc" : "desc")
        break
      case "rating":
        query = query.orderBy(
          // @ts-ignore
          this.knex.raw(
            "get_total_rating(null, recruiting_posts.contractor_id)",
          ),
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "members":
        query = query
          .join(
            "contractors",
            "contractors.contractor_id",
            "=",
            "recruiting_posts.contractor_id",
          )
          .orderBy(
            this.knex.select(knex.raw(`contractors.size::integer`)),
            searchQuery.reverseSort ? "asc" : "desc",
          )
        break
      case "activity":
        query = query.orderBy(
          database
            .knex("recruiting_votes")
            .where(
              "recruiting_votes.post_id",
              "=",
              database.knex.raw("recruiting_posts.post_id"),
            )
            .andWhere(
              "recruiting_votes.timestamp",
              ">",
              this.knex.raw("now() - INTERVAL '1 month'"),
            )
            .count(),
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "all-time":
        query = query.orderBy(
          database
            .knex("recruiting_votes")
            .where(
              "recruiting_votes.post_id",
              "=",
              database.knex.raw("recruiting_posts.post_id"),
            )
            .count(),
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "date":
        query = query
          .join(
            "contractors",
            "contractors.contractor_id",
            "=",
            "recruiting_posts.contractor_id",
          )
          .orderBy(
            "contractors.created_at",
            searchQuery.reverseSort ? "asc" : "desc",
          )
        break
      case "post-date":
        query = query.orderBy(
          "recruiting_posts.timestamp",
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      default:
        return []
    }

    if (searchQuery.rating) {
      query = query.where(
        "get_avg_rating(null, recruiting_posts.contractor_id)",
        ">=",
        searchQuery.rating,
      )
    }

    if (searchQuery.fields.length) {
      query = query.where(
        knex.raw(
          "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = recruiting_posts.contractor_id))",
        ),
        "@>",
        searchQuery.fields,
      )
    }

    if (searchQuery.query) {
      query = query.where(function () {
        this.where("body", "ILIKE", "%" + searchQuery.query + "%").orWhere(
          "title",
          "ILIKE",
          "%" + searchQuery.query + "%",
        )
      })
    }

    return query
      .limit(searchQuery.pageSize)
      .offset(searchQuery.pageSize * searchQuery.index)
      .select()
  }

  async getAllContractorsPaginated(
    searchQuery: RecruitingSearchQuery,
  ): Promise<DBContractor[]> {
    // ['rating', 'name', 'activity', 'all-time']
    const knex = this.knex
    let query = this.knex<DBContractor>("contractors").where(
      "contractors.archived",
      false,
    )

    switch (searchQuery.sorting) {
      case "name":
        query = query.orderBy(
          "contractors.name",
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "date":
        query = query.orderBy(
          "contractors.created_at",
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "rating":
        query = query.orderBy(
          // @ts-ignore
          this.knex.raw("get_total_rating(null, contractors.contractor_id)"),
          searchQuery.reverseSort ? "asc" : "desc",
        )
        break
      case "members":
        query = query.orderBy("size", searchQuery.reverseSort ? "asc" : "desc")
        break
      default:
        return []
    }

    if (searchQuery.rating) {
      query = query.where(
        knex.raw("get_average_rating(null, contractors.contractor_id)"),
        ">=",
        searchQuery.rating,
      )
    }

    if (searchQuery.fields.length) {
      query = query.where(
        knex.raw(
          "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = contractors.contractor_id))",
        ),
        "@>",
        searchQuery.fields,
      )
    }

    if (searchQuery.query) {
      query = query.where(function () {
        this.where("description", "ILIKE", "%" + searchQuery.query + "%")
          .orWhere("name", "ILIKE", "%" + searchQuery.query + "%")
          .orWhere("spectrum_id", "ILIKE", "%" + searchQuery.query + "%")
      })
    }

    return query
      .limit(searchQuery.pageSize)
      .offset(searchQuery.pageSize * searchQuery.index)
      .select()
  }

  async getAllContractorsCount(searchQuery: RecruitingSearchQuery): Promise<
    {
      count: number
    }[]
  > {
    // ['rating', 'name', 'activity', 'all-time']
    const knex = this.knex
    let query = this.knex<DBContractor>("contractors").where(
      "contractors.archived",
      false,
    )

    if (searchQuery.rating) {
      query = query.where(
        knex.raw("get_average_rating(null, orders.contractor_id)"),
        ">=",
        searchQuery.rating,
      )
    }

    if (searchQuery.fields.length) {
      query = query.where(
        knex.raw(
          "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = contractors.contractor_id))",
        ),
        "@>",
        searchQuery.fields,
      )
    }

    if (searchQuery.query) {
      query = query.where(function () {
        this.where("description", "ILIKE", "%" + searchQuery.query + "%")
          .orWhere("name", "ILIKE", "%" + searchQuery.query + "%")
          .orWhere("spectrum_id", "ILIKE", "%" + searchQuery.query + "%")
      })
    }

    return query.count()
  }

  async getRecruitingPostCount() {
    return this.knex<{
      count: number
    }>("recruiting_posts")
      .whereIn(
        "recruiting_posts.contractor_id",
        this.knex("contractors")
          .select("contractor_id")
          .where("contractors.archived", false),
      )
      .count()
  }

  async getContractorCount(where: any) {
    return this.knex<{
      count: number
    }>("contractors")
      .where(where)
      .count()
  }

  async getRecruitingPost(where: any) {
    return this.knex<DBRecruitingPost>("recruiting_posts").where(where).first()
  }

  async updateRecruitingPost(where: any, values: any) {
    return this.knex<DBRecruitingPost>("recruiting_posts")
      .where(where)
      .update(values)
      .returning("*")
  }

  async getRecruitingPostComments(where: any) {
    return this.knex<DBComment>("comments")
      .join(
        "recruiting_comments",
        "comments.comment_id",
        "=",
        "recruiting_comments.comment_id",
      )
      .where(where)
      .select()
  }

  async insertRecruitingComment(values: any) {
    return this.knex<{
      comment_id: string
      post_id: string
    }>("recruiting_comments").insert(values)
  }

  async insertComment(values: any) {
    return this.knex<DBComment>("comments").insert(values).returning("*")
  }

  async deleteComments(where: any) {
    return this.knex<DBComment>("comments").where(where).delete().returning("*")
  }

  async updateComments(where: any, values: any) {
    return this.knex<DBComment>("comments")
      .where(where)
      .update(values)
      .returning("*")
  }

  async getComments(where: Partial<DBComment>) {
    return this.knex<DBComment>("comments").where(where).select()
  }

  async getComment(where: any) {
    return this.knex<DBComment>("comments").where(where).first()
  }

  async getCommentVoteCounts(where: any) {
    return this.knex<
      {
        upvote: string
        count: number
      }[]
    >("comment_votes")
      .where(where)
      .groupBy("upvote")
      .count()
      .select("upvote")
  }

  async getCommentVote(where: any) {
    return this.knex<DBCommentVote>("comment_votes").where(where).first()
  }

  async addCommentVote(values: any) {
    return this.knex<DBCommentVote>("comment_votes")
      .insert(values)
      .returning("*")
  }

  async removeCommentVote(where: any) {
    return this.knex<DBCommentVote>("comment_votes").where(where).delete()
  }

  async getRecruitingPostVoteCounts(where: any) {
    return this.knex<{
      upvote: string
      count: number
    }>("recruiting_votes")
      .where(where)
      .groupBy("upvote")
      .count()
      .select("upvote")
  }

  async addRecruitingPostVote(values: any) {
    return this.knex<DBRecruitingVote>("recruiting_votes")
      .insert(values)
      .returning("*")
  }

  async removeRecruitingPostVote(where: any) {
    return this.knex<DBRecruitingVote>("recruiting_votes")
      .where(where)
      .delete()
      .returning("*")
  }

  async removeRecruitingPostVoteLimit(where: any, limit: number) {
    return this.knex<DBRecruitingVote>("recruiting_votes")
      .where(where)
      .delete()
      .limit(limit)
      .returning("*")
  }

  async getRecruitingPostVote(where: any) {
    return this.knex<DBRecruitingVote>("recruiting_votes").where(where).first()
  }

  async getRecruitingPostVoteWithinWeek(where: any) {
    return this.knex<DBRecruitingVote>("recruiting_votes")
      .where(where)
      .where("timestamp", ">", this.knex.raw("now() - INTERVAL '1 week'"))
      .first()
  }

  async getUserSettings(user_id: string) {
    let settings = await this.knex<DBAccountSettings>("account_settings")
      .where({ user_id })
      .first()

    if (!settings) {
      settings = (
        await this.knex<DBAccountSettings>("account_settings")
          .insert({ user_id })
          .returning("*")
      )[0]
    }

    return settings
  }

  async getUserAvailability(user_id: string, contractor_id: string | null) {
    const availability = await this.knex<DBAvailabilityEntry>(
      "user_availability",
    )
      .where({ user_id })
      .andWhere("contractor_id", contractor_id)
      .select()

    if (!availability) {
      return []
    }

    return availability
  }

  async updateUserAvailability(
    user_id: string,
    contractor_id: string | null,
    spans: AvailabilitySpan[],
  ) {
    const entries: DBAvailabilityEntry[] = spans.map((s) => ({
      user_id,
      contractor_id,
      start: s.start,
      finish: s.finish,
    }))

    await this.knex<DBAvailabilityEntry>("user_availability")
      .where({ user_id, contractor_id })
      .delete()

    // Only insert if there are entries to insert (allows clearing availability)
    if (entries.length > 0) {
      return this.knex<DBAvailabilityEntry>("user_availability").insert(entries)
    }
    return []
  }

  async updateUserSettings(user_id: string, settings: any) {
    return this.knex<DBAccountSettings>("account_settings")
      .where({ user_id })
      .update(settings)
      .returning("*")
  }

  async rebuildMarket() {
    try {
      await this.knex.schema.refreshMaterializedView(
        "market_search_materialized",
        true,
      )
    } catch (error) {
      logger.error("Failed to refresh materialized view 'market_search_materialized' concurrently", {
        error: error instanceof Error ? error : new Error(String(error)),
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code,
        hint: (error as any)?.hint,
      })
      // Wait for next scheduled run (already scheduled every 5 minutes)
    }
  }

  async refreshBadgeView() {
    try {
      // Use CONCURRENTLY to allow reads during refresh (requires unique index)
      // This is slower than non-concurrent but doesn't block reads
      await this.knex.raw(
        "REFRESH MATERIALIZED VIEW CONCURRENTLY user_badges_materialized",
      )
    } catch (error) {
      logger.error("Failed to refresh materialized view 'user_badges_materialized' concurrently", {
        error: error instanceof Error ? error : new Error(String(error)),
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code,
        hint: (error as any)?.hint,
      })
      // Wait for next scheduled run (already scheduled every 2 hours)
    }
  }

  async updatePriceHistpry() {
    await this.knex.raw("CALL upsert_daily_price_history()")
  }

  async getUserMarketListingsFiltered(query: UserListingsQuery): Promise<{
    listings: (DBUniqueListingComplete | DBMultipleListingCompositeComplete)[]
    multiples: DBMultipleComplete[]
    total: number
  }> {
    const knex = this.knex

    // Build base queries for unique listings
    let uniqueQuery = knex("market_unique_listings")
      .join(
        "market_listings",
        "market_unique_listings.listing_id",
        "market_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "market_listing_details.details_id",
      )
      .where("market_listings.user_seller_id", query.user_id)
      .select(
        "market_unique_listings.*",
        "market_listings.*",
        "market_listing_details.*",
      )

    // Apply filters
    if (query.statuses && query.statuses.length > 0) {
      uniqueQuery = uniqueQuery.whereIn(
        "market_listings.status",
        query.statuses,
      )
    }

    if (query.sale_type) {
      uniqueQuery = uniqueQuery.where(
        "market_listings.sale_type",
        query.sale_type,
      )
    }

    if (query.item_type) {
      uniqueQuery = uniqueQuery.where(
        "market_listing_details.item_type",
        query.item_type,
      )
    }

    if (query.query) {
      uniqueQuery = uniqueQuery.where(function () {
        this.whereRaw("market_listing_details.title ILIKE ?", [
          `%${query.query}%`,
        ]).orWhereRaw("market_listing_details.description ILIKE ?", [
          `%${query.query}%`,
        ])
      })
    }

    if (query.minCost && query.minCost > 0) {
      uniqueQuery = uniqueQuery.where(
        "market_listings.price",
        ">=",
        query.minCost,
      )
    }

    if (query.maxCost) {
      uniqueQuery = uniqueQuery.where(
        "market_listings.price",
        "<=",
        query.maxCost,
      )
    }

    if (query.quantityAvailable && query.quantityAvailable > 0) {
      uniqueQuery = uniqueQuery.where(
        "market_listings.quantity_available",
        ">=",
        query.quantityAvailable,
      )
    }

    // Build query for multiples
    let multiplesQuery = knex("market_multiples").where(
      "market_multiples.user_seller_id",
      query.user_id,
    )

    if (query.statuses && query.statuses.length > 0) {
      multiplesQuery = multiplesQuery.whereIn(
        "market_multiples.status",
        query.statuses,
      )
    }

    // Apply same filters to multiples query
    if (query.sale_type) {
      multiplesQuery = multiplesQuery.where(
        "market_multiples.sale_type",
        query.sale_type,
      )
    }

    if (query.item_type) {
      multiplesQuery = multiplesQuery
        .join(
          "market_listing_details",
          "market_multiples.details_id",
          "market_listing_details.details_id",
        )
        .where("market_listing_details.item_type", query.item_type)
    }

    if (query.query) {
      if (!query.item_type) {
        multiplesQuery = multiplesQuery.join(
          "market_listing_details",
          "market_multiples.details_id",
          "market_listing_details.details_id",
        )
      }
      multiplesQuery = multiplesQuery.where(function () {
        this.whereRaw("market_listing_details.title ILIKE ?", [
          `%${query.query}%`,
        ]).orWhereRaw("market_listing_details.description ILIKE ?", [
          `%${query.query}%`,
        ])
      })
    }

    if (query.minCost && query.minCost > 0) {
      multiplesQuery = multiplesQuery.where(
        "market_multiples.price",
        ">=",
        query.minCost,
      )
    }

    if (query.maxCost) {
      multiplesQuery = multiplesQuery.where(
        "market_multiples.price",
        "<=",
        query.maxCost,
      )
    }

    if (query.quantityAvailable && query.quantityAvailable > 0) {
      multiplesQuery = multiplesQuery.where(
        "market_multiples.quantity_available",
        ">=",
        query.quantityAvailable,
      )
    }

    // Get counts
    const uniqueCount = await uniqueQuery.clone().count("* as count").first()
    const multiplesCount = await multiplesQuery
      .clone()
      .count("* as count")
      .first()
    const total =
      Number(uniqueCount?.count || 0) + Number(multiplesCount?.count || 0)

    // Apply sorting
    const sortColumn =
      query.sort === "title"
        ? "market_listing_details.title"
        : query.sort === "minimum_price"
          ? "market_listings.price"
          : query.sort === "quantity_available"
            ? "market_listings.quantity_available"
            : query.sort === "expiration"
              ? "market_listings.expiration"
              : "market_listings.timestamp"

    uniqueQuery = uniqueQuery.orderBy(
      sortColumn,
      query.reverseSort ? "desc" : "asc",
    )

    // Apply pagination to unique listings
    uniqueQuery = uniqueQuery.limit(query.page_size).offset(query.index)

    const listings = await uniqueQuery
    const multiples = await multiplesQuery

    return {
      listings: listings as (
        | DBUniqueListingComplete
        | DBMultipleListingCompositeComplete
      )[],
      multiples: multiples as DBMultipleComplete[],
      total,
    }
  }

  async getContractorMarketListingsFiltered(
    query: ContractorListingsQuery,
  ): Promise<{
    listings: (DBUniqueListingComplete | DBMultipleListingCompositeComplete)[]
    multiples: DBMultipleComplete[]
    total: number
  }> {
    const knex = this.knex

    // Build base queries for unique listings
    let uniqueQuery = knex("market_unique_listings")
      .join(
        "market_listings",
        "market_unique_listings.listing_id",
        "market_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "market_listing_details.details_id",
      )
      .where("market_listings.contractor_seller_id", query.contractor_id)
      .select(
        "market_unique_listings.*",
        "market_listings.*",
        "market_listing_details.*",
      )

    // Apply filters
    if (query.statuses && query.statuses.length > 0) {
      uniqueQuery = uniqueQuery.whereIn(
        "market_listings.status",
        query.statuses,
      )
    }

    if (query.sale_type) {
      uniqueQuery = uniqueQuery.where(
        "market_listings.sale_type",
        query.sale_type,
      )
    }

    if (query.item_type) {
      uniqueQuery = uniqueQuery.where(
        "market_listing_details.item_type",
        query.item_type,
      )
    }

    if (query.query) {
      uniqueQuery = uniqueQuery.where(function () {
        this.whereRaw("market_listing_details.title ILIKE ?", [
          `%${query.query}%`,
        ]).orWhereRaw("market_listing_details.description ILIKE ?", [
          `%${query.query}%`,
        ])
      })
    }

    if (query.minCost && query.minCost > 0) {
      uniqueQuery = uniqueQuery.where(
        "market_listings.price",
        ">=",
        query.minCost,
      )
    }

    if (query.maxCost) {
      uniqueQuery = uniqueQuery.where(
        "market_listings.price",
        "<=",
        query.maxCost,
      )
    }

    if (query.quantityAvailable && query.quantityAvailable > 0) {
      uniqueQuery = uniqueQuery.where(
        "market_listings.quantity_available",
        ">=",
        query.quantityAvailable,
      )
    }

    // Build query for multiples
    let multiplesQuery = knex("market_multiples").where(
      "market_multiples.contractor_seller_id",
      query.contractor_id,
    )

    if (query.statuses && query.statuses.length > 0) {
      multiplesQuery = multiplesQuery.whereIn(
        "market_multiples.status",
        query.statuses,
      )
    }

    // Apply same filters to multiples query
    if (query.sale_type) {
      multiplesQuery = multiplesQuery.where(
        "market_multiples.sale_type",
        query.sale_type,
      )
    }

    if (query.item_type) {
      multiplesQuery = multiplesQuery
        .join(
          "market_listing_details",
          "market_multiples.details_id",
          "market_listing_details.details_id",
        )
        .where("market_listing_details.item_type", query.item_type)
    }

    if (query.query) {
      if (!query.item_type) {
        multiplesQuery = multiplesQuery.join(
          "market_listing_details",
          "market_multiples.details_id",
          "market_listing_details.details_id",
        )
      }
      multiplesQuery = multiplesQuery.where(function () {
        this.whereRaw("market_listing_details.title ILIKE ?", [
          `%${query.query}%`,
        ]).orWhereRaw("market_listing_details.description ILIKE ?", [
          `%${query.query}%`,
        ])
      })
    }

    if (query.minCost && query.minCost > 0) {
      multiplesQuery = multiplesQuery.where(
        "market_multiples.price",
        ">=",
        query.minCost,
      )
    }

    if (query.maxCost) {
      multiplesQuery = multiplesQuery.where(
        "market_multiples.price",
        "<=",
        query.maxCost,
      )
    }

    if (query.quantityAvailable && query.quantityAvailable > 0) {
      multiplesQuery = multiplesQuery.where(
        "market_multiples.quantity_available",
        ">=",
        query.quantityAvailable,
      )
    }

    // Get counts
    const uniqueCount = await uniqueQuery.clone().count("* as count").first()
    const multiplesCount = await multiplesQuery
      .clone()
      .count("* as count")
      .first()
    const total =
      Number(uniqueCount?.count || 0) + Number(multiplesCount?.count || 0)

    // Apply sorting
    const sortColumn =
      query.sort === "title"
        ? "market_listing_details.title"
        : query.sort === "minimum_price"
          ? "market_listings.price"
          : query.sort === "quantity_available"
            ? "market_listings.quantity_available"
            : query.sort === "expiration"
              ? "market_listings.expiration"
              : "market_listings.timestamp"

    uniqueQuery = uniqueQuery.orderBy(
      sortColumn,
      query.reverseSort ? "desc" : "asc",
    )

    // Apply pagination to unique listings
    uniqueQuery = uniqueQuery.limit(query.page_size).offset(query.index)

    const listings = await uniqueQuery
    const multiples = await multiplesQuery

    return {
      listings: listings as (
        | DBUniqueListingComplete
        | DBMultipleListingCompositeComplete
      )[],
      multiples: multiples as DBMultipleComplete[],
      total,
    }
  }

  async searchMarket(searchQuery: MarketSearchQuery, andWhere?: any) {
    // ['rating', 'name', 'activity', 'all-time']
    const knex = this.knex
    let query = this.knex<DBMarketSearchResult>(
      "market_search_materialized",
    )
      .leftJoin("user_badges_materialized", function () {
        this.on(function () {
          this.on(
            "market_search_materialized.user_seller_id",
            "=",
            "user_badges_materialized.user_id",
          ).andOn(
            "user_badges_materialized.entity_type",
            "=",
            knex.raw("'user'"),
          )
        }).orOn(function () {
          this.on(
            "market_search_materialized.contractor_seller_id",
            "=",
            "user_badges_materialized.contractor_id",
          ).andOn(
            "user_badges_materialized.entity_type",
            "=",
            knex.raw("'contractor'"),
          )
        })
      })
      .select(
        knex.raw("market_search_materialized.*"),
        knex.raw(
          "COALESCE(user_badges_materialized.badge_ids, ARRAY[]::text[]) as badge_ids",
        ),
        knex.raw("count(*) OVER() AS full_count"),
      )
      .orderBy(
        `market_search_materialized.${searchQuery.sort}`,
        searchQuery.reverseSort ? "asc" : "desc",
      )

    if (searchQuery.sale_type) {
      query = query.where(
        "market_search_materialized.sale_type",
        searchQuery.sale_type || undefined,
      )
    }

    if (searchQuery.item_type) {
      query = query.andWhere(
        knex.raw(
          "to_tsquery('simple', COALESCE(websearch_to_tsquery('english', ?)::text, ':*'))",
          searchQuery.item_type,
        ),
        "@@",
        knex.raw("market_search_materialized.item_type_ts"),
      )
    }

    if (searchQuery.minCost) {
      query = query.andWhere(
        "market_search_materialized.minimum_price",
        ">=",
        searchQuery.minCost,
      )
    }

    if (searchQuery.maxCost) {
      query = query.andWhere(
        "market_search_materialized.maximum_price",
        "<=",
        searchQuery.maxCost,
      )
    }

    if (searchQuery.quantityAvailable) {
      query = query.andWhere(
        "market_search_materialized.quantity_available",
        ">=",
        searchQuery.quantityAvailable,
      )
    }

    if (searchQuery.rating) {
      query = query.andWhere(
        "market_search_materialized.avg_rating",
        ">",
        searchQuery.seller_rating,
      )
    }

    if (searchQuery.query) {
      // to_tsquery('simple', websearch_to_tsquery('english', ?)::text || ':*')
      query = query
        .andWhere(
          knex.raw("websearch_to_tsquery('english', ?)", searchQuery.query),
          "@@",
          knex.raw("market_search_materialized.textsearch"),
        )
        .orderBy(
          // @ts-ignore
          knex.raw(
            "ts_rank_cd(market_search_materialized.textsearch, websearch_to_tsquery('english', ?))",
            searchQuery.query,
          ),
          "desc",
        )
    }

    if (searchQuery.listing_type) {
      if (searchQuery.listing_type === "not-aggregate") {
        query = query.andWhere(
          "market_search_materialized.listing_type",
          "!=",
          "aggregate",
        )
      } else {
        query = query.andWhere(
          "market_search_materialized.listing_type",
          searchQuery.listing_type,
        )
      }
    }

    if (searchQuery.user_seller_id) {
      query = query.andWhere(
        "market_search_materialized.user_seller_id",
        searchQuery.user_seller_id,
      )
    }

    if (searchQuery.contractor_seller_id) {
      query = query.andWhere(
        "market_search_materialized.contractor_seller_id",
        searchQuery.contractor_seller_id,
      )
    }

    query = query.andWhere((qb) => {
      qb.whereNull("market_search_materialized.contractor_seller_id").orWhereIn(
        "market_search_materialized.contractor_seller_id",
        this.knex("contractors")
          .select("contractor_id")
          .where({ archived: false }),
      )
    })

    if (searchQuery.statuses && searchQuery.statuses.length > 0) {
      query = query.andWhere(
        "market_search_materialized.status",
        "in",
        searchQuery.statuses,
      )
    }

    if (andWhere) {
      query = query.andWhere(andWhere)
    }

    if (searchQuery.page_size) {
      query = query
        .limit(searchQuery.page_size)
        .offset(searchQuery.page_size * searchQuery.index)
    }

    const results = await query
    return results.map((r: any) => ({
      ...r,
      badges: r.badge_ids && r.badge_ids.length > 0
        ? {
            badge_ids: r.badge_ids,
          }
        : null,
    })) as DBMarketSearchResult[]
  }

  async searchMarketUnmaterialized(
    searchQuery: MarketSearchQuery,
    andWhere?: any,
  ) {
    // Query underlying tables directly to get all statuses, not just active
    const knex = this.knex

    // Build a query that mimics the market_search_complete view but includes all statuses
    let query = knex
      .select([
        "market_listings.listing_id",
        "market_listings.sale_type",
        "market_listings.price",
        "market_listings.price as minimum_price",
        "market_listings.price as maximum_price",
        "market_listings.quantity_available",
        "market_listings.timestamp",
        "market_listings.expiration",
        "market_listings.status",
        "market_listings.internal",
        "market_listings.user_seller_id",
        "market_listings.contractor_seller_id",
        "market_listing_details.details_id",
        "market_listing_details.title",
        "market_listing_details.item_type",
        "market_listing_details.game_item_id",
        knex.raw("'unique' as listing_type"),
        knex.raw(
          "to_tsvector('english', market_listing_details.title || ' ' || market_listing_details.description) as textsearch",
        ),
        knex.raw(
          "to_tsvector('english', market_listing_details.item_type) as item_type_ts",
        ),
        knex.raw("0 as total_rating"),
        knex.raw("0 as avg_rating"),
        knex.raw("0 as rating_count"),
        knex.raw("0 as rating_streak"),
        knex.raw("0 as total_orders"),
        knex.raw("0 as total_assignments"),
        knex.raw("0 as response_rate"),
        knex.raw("null as photo_details"),
        knex.raw("null as photo"),
        knex.raw("null as item_name"),
        knex.raw("null as auction_end_time"),
        knex.raw("null as user_seller"),
        knex.raw("null as contractor_seller"),
      ])
      .from("market_listings")
      .join(
        "market_unique_listings",
        "market_listings.listing_id",
        "market_unique_listings.listing_id",
      )
      .join(
        "market_listing_details",
        "market_unique_listings.details_id",
        "market_listing_details.details_id",
      )
      .orderBy(searchQuery.sort, searchQuery.reverseSort ? "asc" : "desc")

    // Apply filters
    if (searchQuery.sale_type) {
      query = query.where("market_listings.sale_type", searchQuery.sale_type)
    }

    if (searchQuery.item_type) {
      query = query.where(
        "market_listing_details.item_type",
        searchQuery.item_type,
      )
    }

    if (searchQuery.minCost) {
      query = query.where("market_listings.price", ">=", searchQuery.minCost)
    }

    if (searchQuery.maxCost) {
      query = query.where("market_listings.price", "<=", searchQuery.maxCost)
    }

    if (searchQuery.quantityAvailable) {
      query = query.where(
        "market_listings.quantity_available",
        ">=",
        searchQuery.quantityAvailable,
      )
    }

    if (searchQuery.query) {
      query = query.where(function () {
        this.whereRaw("market_listing_details.title ILIKE ?", [
          `%${searchQuery.query}%`,
        ]).orWhereRaw("market_listing_details.description ILIKE ?", [
          `%${searchQuery.query}%`,
        ])
      })
    }

    if (searchQuery.user_seller_id) {
      query = query.where(
        "market_listings.user_seller_id",
        searchQuery.user_seller_id,
      )
    }

    if (searchQuery.contractor_seller_id) {
      query = query.where(
        "market_listings.contractor_seller_id",
        searchQuery.contractor_seller_id,
      )
    }

    query = query.where((qb) => {
      qb.whereNull("market_listings.contractor_seller_id").orWhereIn(
        "market_listings.contractor_seller_id",
        this.knex("contractors")
          .select("contractor_id")
          .where({ archived: false }),
      )
    })

    if (searchQuery.statuses && searchQuery.statuses.length > 0) {
      query = query.whereIn("market_listings.status", searchQuery.statuses)
    }

    if (andWhere) {
      query = query.andWhere(andWhere)
    }

    if (searchQuery.page_size) {
      query = query
        .limit(searchQuery.page_size)
        .offset(searchQuery.page_size * searchQuery.index)
    }

    return query.select(knex.raw("count(*) OVER() AS full_count"))
  }

  async getOrderStats() {
    const order_stats = await this.knex<OrderStats>("order_stats").first()

    const order_week_stats = await this.knex<{
      week_orders: number
      week_order_value: number
    }>("order_week_stats").first()

    return {
      ...order_stats,
      ...order_week_stats,
    }
  }

  async upsertDailyActivity(user_id: string) {
    try {
      await this.knex.raw("CALL upsert_daily_activity(?)", [user_id])
    } catch (e) {
      console.error(e)
    }
  }

  async getDailyActivity(options?: { startTime?: number; endTime?: number }) {
    let query = this.knex<{ date: Date; count: number }>("daily_activity")

    if (options?.startTime) {
      query = query.where("date", ">=", new Date(options.startTime * 1000))
    }
    if (options?.endTime) {
      query = query.where("date", "<=", new Date(options.endTime * 1000))
    }

    return query.orderBy("date", "ASC").select()
  }

  async getWeeklyActivity(options?: { startTime?: number; endTime?: number }) {
    let query = this.knex<{ date: Date; count: number }>("weekly_activity")

    if (options?.startTime) {
      query = query.where("date", ">=", new Date(options.startTime * 1000))
    }
    if (options?.endTime) {
      query = query.where("date", "<=", new Date(options.endTime * 1000))
    }

    return query.orderBy("date", "ASC").select()
  }

  async getMonthlyActivity(options?: { startTime?: number; endTime?: number }) {
    let query = this.knex<{ date: Date; count: number }>("monthly_activity")

    if (options?.startTime) {
      query = query.where("date", ">=", new Date(options.startTime * 1000))
    }
    if (options?.endTime) {
      query = query.where("date", "<=", new Date(options.endTime * 1000))
    }

    return query.orderBy("date", "ASC").select()
  }

  async getMarketItemsByCategory(category: string): Promise<DBMarketItem[]> {
    return this.knex<DBMarketItem>("game_items")
      .join(
        "game_item_categories",
        "game_item_categories.subcategory",
        "game_items.type",
      )
      .where("category", category)
      .orderBy("name")
      .select("name", "type")
  }

  async getMarketItemsBySubcategory(
    subcategory: string,
  ): Promise<DBMarketItem[]> {
    return this.knex<DBMarketItem>("game_items")
      .where("type", subcategory)
      .orderBy("name")
      .select("name", "type", "id")
  }

  async getMarketCategories(): Promise<DBMarketCategory[]> {
    return this.knex<DBMarketCategory>("game_item_categories")
      .orderBy("category")
      .orderBy("game_item_categories")
      .select()
  }

  async getGameItem(where: Partial<DBMarketItem>) {
    return this.knex<DBMarketItem>("game_items").where(where).first()
  }

  async getMostRecentOrderOffer(id: string): Promise<DBOffer> {
    const res = await this.knex<DBOffer>("order_offers")
      .where({ session_id: id })
      .orderBy("timestamp", "desc")
      .first()

    return res!
  }

  async getOrderOffers(where: Partial<DBOffer>): Promise<DBOffer[]> {
    return this.knex<DBOffer>("order_offers")
      .where(where)
      .orderBy("timestamp", "desc")
      .select()
  }

  async getPublicContract(
    where: Partial<DBPublicContract>,
  ): Promise<DBPublicContract[]> {
    return this.knex<DBPublicContract>("public_contracts").where(where).select()
  }

  async deletePublicContract(
    where: Partial<DBPublicContract>,
  ): Promise<DBPublicContract[]> {
    return this.knex<DBPublicContract>("public_contracts")
      .where(where)
      .delete()
      .returning("*")
  }

  async updatePublicContract(
    where: Partial<DBPublicContract>,
    data: Partial<DBPublicContract>,
  ): Promise<DBPublicContract[]> {
    return this.knex<DBPublicContract>("public_contracts")
      .where(where)
      .update(data)
      .returning("*")
  }

  async insertPublicContract(
    data: Partial<DBPublicContract> | Partial<DBPublicContract>[],
  ) {
    return this.knex<DBPublicContract>("public_contracts")
      .insert(data)
      .returning("*")
  }

  async getContractOffers(
    where: Partial<DBContractOffer>,
  ): Promise<DBContractOffer[]> {
    return this.knex<DBContractOffer>("public_contract_offers")
      .where(where)
      .select()
  }

  async deleteContractOffers(
    where: Partial<DBContractOffer>,
  ): Promise<DBContractOffer[]> {
    return this.knex<DBContractOffer>("public_contract_offers")
      .where(where)
      .delete()
      .returning("*")
  }

  async updateContractOffers(
    where: Partial<DBContractOffer>,
    data: Partial<DBContractOffer>,
  ): Promise<DBContractOffer[]> {
    return this.knex<DBContractOffer>("public_contract_offers")
      .where(where)
      .update(data)
      .returning("*")
  }

  async insertContractOffers(
    data: Partial<DBContractOffer> | Partial<DBContractOffer>[],
  ) {
    return this.knex<DBContractOffer>("public_contract_offers")
      .insert(data)
      .returning("*")
  }

  // Content Reports
  async insertContentReport(
    data: Partial<DBContentReport>,
  ): Promise<DBContentReport[]> {
    return this.knex<DBContentReport>("content_reports")
      .insert(data)
      .returning("*")
  }

  async getContentReports(
    where: Partial<DBContentReport>,
  ): Promise<DBContentReport[]> {
    return this.knex<DBContentReport>("content_reports")
      .where(where)
      .orderBy("created_at", "desc")
      .select()
  }

  async updateContentReport(
    where: Partial<DBContentReport>,
    data: Partial<DBContentReport>,
  ): Promise<DBContentReport[]> {
    return this.knex<DBContentReport>("content_reports")
      .where(where)
      .update(data)
      .returning("*")
  }

  async deleteContentReport(
    where: Partial<DBContentReport>,
  ): Promise<DBContentReport[]> {
    return this.knex<DBContentReport>("content_reports")
      .where(where)
      .delete()
      .returning("*")
  }

  // Notification deduplication functions
  async getNotificationObjectByEntityAndAction(
    entity_id: string,
    action_type_id: string,
  ): Promise<DBNotificationObject | undefined> {
    const result = await this.knex<DBNotificationObject>("notification_object")
      .select("*")
      .where("entity_id", entity_id)
      .where("action_type_id", action_type_id)
      .first()

    return result
  }

  async updateNotificationObjectTimestamp(
    notification_object_id: string,
  ): Promise<DBNotificationObject[]> {
    return this.knex<DBNotificationObject>("notification_object")
      .where("notification_object_id", notification_object_id)
      .update({ timestamp: this.knex.fn.now() })
      .returning("*")
  }

  async getUnreadNotificationByUserAndObject(
    user_id: string,
    notification_object_id: string,
  ): Promise<DBNotification | undefined> {
    const result = await this.knex<DBNotification>("notification")
      .select("*")
      .where("notifier_id", user_id)
      .where("notification_object_id", notification_object_id)
      .where("read", false)
      .first()

    return result
  }

  // Listing view tracking methods
  async trackListingView(data: {
    listing_type: "market" | "service"
    listing_id: string
    viewer_id?: string | null
    viewer_ip?: string
    user_agent?: string
    referrer?: string
    session_id?: string | null
  }): Promise<void> {
    // Don't track views from the seller themselves
    if (data.viewer_id) {
      if (data.listing_type === "market") {
        const listing = await this.knex("market_listings")
          .where("listing_id", data.listing_id)
          .first()

        if (
          listing &&
          (listing.user_seller_id === data.viewer_id ||
            listing.contractor_seller_id === data.viewer_id)
        ) {
          return // Don't track seller's own views
        }
      } else if (data.listing_type === "service") {
        const service = await this.knex("services")
          .where("service_id", data.listing_id)
          .first()

        if (
          service &&
          (service.user_id === data.viewer_id ||
            service.contractor_id === data.viewer_id)
        ) {
          return // Don't track seller's own views
        }
      }
    }

    // Check if this is a unique view (same user/session hasn't viewed in last 24 hours)
    // Only check for existing views if we have a session_id
    let existingView = null
    if (data.session_id) {
      existingView = await this.knex("listing_views")
        .where({
          listing_type: data.listing_type,
          listing_id: data.listing_id,
          session_id: data.session_id,
        })
        .where("timestamp", ">", new Date(Date.now() - 24 * 60 * 60 * 1000))
        .first()
    }

    if (existingView) {
      // Update existing view timestamp but don't count as new view
      await this.knex("listing_views")
        .where({ view_id: existingView.view_id })
        .update({
          timestamp: new Date(),
          is_unique: false,
        })
    } else {
      // Insert new view
      await this.knex("listing_views").insert({
        listing_type: data.listing_type,
        listing_id: data.listing_id,
        viewer_id: data.viewer_id,
        viewer_ip: data.viewer_ip,
        user_agent: data.user_agent,
        referrer: data.referrer,
        session_id: data.session_id || null,
        is_unique: true,
      })
    }
  }

  async getListingViewStats(
    listing_type: "market" | "service",
    listing_id: string,
  ) {
    return this.knex<{
      total_views: string
      listing_type: string
      listing_id: string
    }>("listing_view_stats")
      .where({ listing_type, listing_id })
      .first()
  }

  async getSellerListingAnalytics(data: {
    user_id?: string
    contractor_id?: string
    time_period?: string
  }) {
    const { user_id, contractor_id, time_period = "30d" } = data

    let timeFilter
    switch (time_period) {
      case "7d":
        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        break
      case "30d":
        timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        break
      case "90d":
        timeFilter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }

    // Get market listing analytics
    const marketListings = await this.knex("market_listings")
      .select("listing_id")
      .where("timestamp", ">=", timeFilter)
      .modify((queryBuilder) => {
        if (user_id) {
          queryBuilder.where("user_seller_id", user_id)
        }
        if (contractor_id) {
          queryBuilder.where("contractor_seller_id", contractor_id)
        }
      })

    const marketListingIds = marketListings.map((l: any) => l.listing_id)

    // Get service analytics
    const services = await this.knex("services")
      .select("service_id")
      .where("timestamp", ">=", timeFilter)
      .modify((queryBuilder) => {
        if (user_id) {
          queryBuilder.where("user_id", user_id)
        }
        if (contractor_id) {
          queryBuilder.where("contractor_id", contractor_id)
        }
      })

    const serviceIds = services.map((s: any) => s.service_id)

    // Get view statistics for all listings
    const marketViews = await this.knex("listing_views")
      .where("listing_type", "market")
      .whereIn("listing_id", marketListingIds)
      .where("timestamp", ">=", timeFilter)
      .count("* as view_count")

    const serviceViews = await this.knex("listing_views")
      .where("listing_type", "service")
      .whereIn("listing_id", serviceIds)
      .where("timestamp", ">=", timeFilter)
      .count("* as view_count")

    return {
      market_listings: marketListingIds.length,
      services: serviceIds.length,
      total_market_views: marketViews[0]?.view_count || 0,
      total_service_views: serviceViews[0]?.view_count || 0,
      time_period: time_period,
    }
  }

  async getMembershipAnalytics(options?: {
    startTime?: number
    endTime?: number
  }) {
    // Build time filter query builder
    const buildTimeFilter = (query: any) => {
      if (options?.startTime && options?.endTime) {
        return query
          .where("created_at", ">=", new Date(options.startTime * 1000))
          .where("created_at", "<=", new Date(options.endTime * 1000))
      } else if (options?.startTime) {
        return query.where(
          "created_at",
          ">=",
          new Date(options.startTime * 1000),
        )
      } else if (options?.endTime) {
        return query.where("created_at", "<=", new Date(options.endTime * 1000))
      }
      return query
    }

    // Get daily new members
    // If no time range provided, default to last 30 days for backward compatibility
    let dailyQuery = this.knex("accounts")
      .select(
        this.knex.raw("DATE(created_at) as date"),
        this.knex.raw("COUNT(*) as new_members"),
        this.knex.raw(
          "COUNT(CASE WHEN rsi_confirmed = true THEN 1 END) as new_members_rsi_verified",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN rsi_confirmed = false THEN 1 END) as new_members_rsi_unverified",
        ),
        this.knex.raw(
          "SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) as cumulative_members",
        ),
        this.knex.raw(
          "SUM(COUNT(CASE WHEN rsi_confirmed = true THEN 1 END)) OVER (ORDER BY DATE(created_at)) as cumulative_members_rsi_verified",
        ),
        this.knex.raw(
          "SUM(COUNT(CASE WHEN rsi_confirmed = false THEN 1 END)) OVER (ORDER BY DATE(created_at)) as cumulative_members_rsi_unverified",
        ),
      )
      .groupBy(this.knex.raw("DATE(created_at)"))
      .orderBy("date", "asc")

    if (!options?.startTime && !options?.endTime) {
      dailyQuery = dailyQuery.where(
        "created_at",
        ">=",
        this.knex.raw("NOW() - INTERVAL '30 days'"),
      )
    } else {
      dailyQuery = buildTimeFilter(dailyQuery)
    }
    const dailyMembers = await dailyQuery

    // Get weekly new members
    // If no time range provided, default to last 12 weeks for backward compatibility
    let weeklyQuery = this.knex("accounts")
      .select(
        this.knex.raw("DATE_TRUNC('week', created_at) as date"),
        this.knex.raw("COUNT(*) as new_members"),
        this.knex.raw(
          "COUNT(CASE WHEN rsi_confirmed = true THEN 1 END) as new_members_rsi_verified",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN rsi_confirmed = false THEN 1 END) as new_members_rsi_unverified",
        ),
        this.knex.raw(
          "SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('week', created_at)) as cumulative_members",
        ),
        this.knex.raw(
          "SUM(COUNT(CASE WHEN rsi_confirmed = true THEN 1 END)) OVER (ORDER BY DATE_TRUNC('week', created_at)) as cumulative_members_rsi_verified",
        ),
        this.knex.raw(
          "SUM(COUNT(CASE WHEN rsi_confirmed = false THEN 1 END)) OVER (ORDER BY DATE_TRUNC('week', created_at)) as cumulative_members_rsi_unverified",
        ),
      )
      .groupBy(this.knex.raw("DATE_TRUNC('week', created_at)"))
      .orderBy("date", "asc")

    if (!options?.startTime && !options?.endTime) {
      weeklyQuery = weeklyQuery.where(
        "created_at",
        ">=",
        this.knex.raw("NOW() - INTERVAL '12 weeks'"),
      )
    } else {
      weeklyQuery = buildTimeFilter(weeklyQuery)
    }
    const weeklyMembers = await weeklyQuery

    // Get monthly new members
    // If no time range provided, default to last 12 months for backward compatibility
    let monthlyQuery = this.knex("accounts")
      .select(
        this.knex.raw("DATE_TRUNC('month', created_at) as date"),
        this.knex.raw("COUNT(*) as new_members"),
        this.knex.raw(
          "COUNT(CASE WHEN rsi_confirmed = true THEN 1 END) as new_members_rsi_verified",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN rsi_confirmed = false THEN 1 END) as new_members_rsi_unverified",
        ),
        this.knex.raw(
          "SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as cumulative_members",
        ),
        this.knex.raw(
          "SUM(COUNT(CASE WHEN rsi_confirmed = true THEN 1 END)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as cumulative_members_rsi_verified",
        ),
        this.knex.raw(
          "SUM(COUNT(CASE WHEN rsi_confirmed = false THEN 1 END)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as cumulative_members_rsi_unverified",
        ),
      )
      .groupBy(this.knex.raw("DATE_TRUNC('month', created_at)"))
      .orderBy("date", "asc")

    if (!options?.startTime && !options?.endTime) {
      monthlyQuery = monthlyQuery.where(
        "created_at",
        ">=",
        this.knex.raw("NOW() - INTERVAL '12 months'"),
      )
    } else {
      monthlyQuery = buildTimeFilter(monthlyQuery)
    }
    const monthlyMembers = await monthlyQuery

    // Get overall membership statistics
    const totalMembers = await this.knex("accounts")
      .select(
        this.knex.raw("COUNT(*) as total_members"),
        this.knex.raw(
          "COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_members",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN role = 'user' THEN 1 END) as regular_members",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN rsi_confirmed = true THEN 1 END) as rsi_confirmed_members",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN banned = true THEN 1 END) as banned_members",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_members_30d",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_members_7d",
        ),
      )
      .first()

    return {
      daily_totals: dailyMembers || [],
      weekly_totals: weeklyMembers || [],
      monthly_totals: monthlyMembers || [],
      summary: totalMembers || {},
    }
  }

  async getOrderAnalytics(options?: { startTime?: number; endTime?: number }) {
    // Build time filter query builder
    const buildTimeFilter = (query: any) => {
      if (options?.startTime && options?.endTime) {
        return query
          .where("timestamp", ">=", new Date(options.startTime * 1000))
          .where("timestamp", "<=", new Date(options.endTime * 1000))
      } else if (options?.startTime) {
        return query.where(
          "timestamp",
          ">=",
          new Date(options.startTime * 1000),
        )
      } else if (options?.endTime) {
        return query.where("timestamp", "<=", new Date(options.endTime * 1000))
      }
      return query
    }

    // Get daily totals
    // If no time range provided, default to last 30 days for backward compatibility
    let dailyQuery = this.knex("orders")
      .select(
        this.knex.raw("DATE(timestamp) as date"),
        this.knex.raw("COUNT(*) as total"),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as fulfilled",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'not-started' THEN 1 END) as not_started",
        ),
      )
      .groupBy(this.knex.raw("DATE(timestamp)"))
      .orderBy("date", "asc")

    if (!options?.startTime && !options?.endTime) {
      dailyQuery = dailyQuery.where(
        "timestamp",
        ">=",
        this.knex.raw("NOW() - INTERVAL '30 days'"),
      )
    } else {
      dailyQuery = buildTimeFilter(dailyQuery)
    }
    const dailyTotals = await dailyQuery

    // Get weekly totals
    // If no time range provided, default to last 12 weeks for backward compatibility
    let weeklyQuery = this.knex("orders")
      .select(
        this.knex.raw("DATE_TRUNC('week', timestamp) as date"),
        this.knex.raw("COUNT(*) as total"),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as fulfilled",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'not-started' THEN 1 END) as not_started",
        ),
      )
      .groupBy(this.knex.raw("DATE_TRUNC('week', timestamp)"))
      .orderBy("date", "asc")

    if (!options?.startTime && !options?.endTime) {
      weeklyQuery = weeklyQuery.where(
        "timestamp",
        ">=",
        this.knex.raw("NOW() - INTERVAL '12 weeks'"),
      )
    } else {
      weeklyQuery = buildTimeFilter(weeklyQuery)
    }
    const weeklyTotals = await weeklyQuery

    // Get monthly totals
    // If no time range provided, default to last 12 months for backward compatibility
    let monthlyQuery = this.knex("orders")
      .select(
        this.knex.raw("DATE_TRUNC('month', timestamp) as date"),
        this.knex.raw("COUNT(*) as total"),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as fulfilled",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'not-started' THEN 1 END) as not_started",
        ),
      )
      .groupBy(this.knex.raw("DATE_TRUNC('month', timestamp)"))
      .orderBy("date", "asc")

    if (!options?.startTime && !options?.endTime) {
      monthlyQuery = monthlyQuery.where(
        "timestamp",
        ">=",
        this.knex.raw("NOW() - INTERVAL '12 months'"),
      )
    } else {
      monthlyQuery = buildTimeFilter(monthlyQuery)
    }
    const monthlyTotals = await monthlyQuery

    // Get top contractors by fulfilled orders
    const topContractors = await this.knex("orders as o")
      .join("contractors as c", "o.contractor_id", "c.contractor_id")
      .whereNotNull("o.contractor_id")
      .select(
        "c.name",
        this.knex.raw(
          "COUNT(CASE WHEN o.status = 'fulfilled' THEN 1 END) as fulfilled_orders",
        ),
        this.knex.raw("COUNT(*) as total_orders"),
      )
      .groupBy("c.contractor_id", "c.name")
      .orderBy("fulfilled_orders", "desc")
      .orderBy("total_orders", "desc")
      .limit(10)

    // Get top users by fulfilled orders
    const topUsers = await this.knex("orders as o")
      .join("accounts as a", "o.customer_id", "a.user_id")
      .select(
        "a.username",
        this.knex.raw(
          "COUNT(CASE WHEN o.status = 'fulfilled' THEN 1 END) as fulfilled_orders",
        ),
        this.knex.raw("COUNT(*) as total_orders"),
      )
      .groupBy("a.user_id", "a.username")
      .orderBy("fulfilled_orders", "desc")
      .orderBy("total_orders", "desc")
      .limit(10)

    // Get summary stats
    const summary = await this.knex("orders")
      .select(
        this.knex.raw("COUNT(*) as total_orders"),
        this.knex.raw(
          "COUNT(CASE WHEN status IN ('in-progress', 'not-started') THEN 1 END) as active_orders",
        ),
        this.knex.raw(
          "COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as completed_orders",
        ),
        this.knex.raw(
          "COALESCE(SUM(CASE WHEN status = 'fulfilled' THEN cost ELSE 0 END), 0) as total_value",
        ),
      )
      .first()

    return {
      daily_totals: dailyTotals.map((row: any) => ({
        date: row.date.toISOString().split("T")[0],
        total: parseInt(row.total),
        in_progress: parseInt(row.in_progress),
        fulfilled: parseInt(row.fulfilled),
        cancelled: parseInt(row.cancelled),
        not_started: parseInt(row.not_started),
      })),
      weekly_totals: weeklyTotals.map((row: any) => ({
        date: row.date.toISOString().split("T")[0],
        total: parseInt(row.total),
        in_progress: parseInt(row.in_progress),
        fulfilled: parseInt(row.fulfilled),
        cancelled: parseInt(row.cancelled),
        not_started: parseInt(row.not_started),
      })),
      monthly_totals: monthlyTotals.map((row: any) => ({
        date: row.date.toISOString().split("T")[0],
        total: parseInt(row.total),
        in_progress: parseInt(row.in_progress),
        fulfilled: parseInt(row.fulfilled),
        cancelled: parseInt(row.cancelled),
        not_started: parseInt(row.not_started),
      })),
      top_contractors: topContractors.map((row: any) => ({
        name: row.name,
        fulfilled_orders: parseInt(row.fulfilled_orders),
        total_orders: parseInt(row.total_orders),
      })),
      top_users: topUsers.map((row: any) => ({
        username: row.username,
        fulfilled_orders: parseInt(row.fulfilled_orders),
        total_orders: parseInt(row.total_orders),
      })),
      summary: {
        total_orders: parseInt(summary.total_orders),
        active_orders: parseInt(summary.active_orders),
        completed_orders: parseInt(summary.completed_orders),
        total_value: parseInt(summary.total_value),
      },
    }
  }

  // Admin Alerts Methods
  async createAdminAlert(
    alert: Omit<DBAdminAlert, "alert_id" | "created_at">,
  ): Promise<DBAdminAlert> {
    const [newAlert] = await this.knex<DBAdminAlert>("admin_alerts")
      .insert(alert)
      .returning("*")

    return newAlert
  }

  async getAdminAlerts(where: any = {}): Promise<DBAdminAlert[]> {
    return this.knex<DBAdminAlert>("admin_alerts")
      .select("*")
      .where(where)
      .orderBy("created_at", "desc")
  }

  async getAdminAlertsPaginated(
    page: number = 0,
    pageSize: number = 20,
    where: any = {},
  ): Promise<{ alerts: DBAdminAlert[]; pagination: any }> {
    const offset = page * pageSize

    const alerts = await this.knex<DBAdminAlert>("admin_alerts")
      .select("*")
      .where(where)
      .orderBy("created_at", "desc")
      .offset(offset)
      .limit(pageSize)

    const [{ count }] = await this.knex("admin_alerts")
      .count("* as count")
      .where(where)

    const total = parseInt(count as string)
    const totalPages = Math.ceil(total / pageSize)

    return {
      alerts,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        has_next: page < totalPages - 1,
        has_prev: page > 0,
      },
    }
  }

  async updateAdminAlert(
    alertId: string,
    updates: Partial<DBAdminAlert>,
  ): Promise<DBAdminAlert | null> {
    const [updatedAlert] = await this.knex<DBAdminAlert>("admin_alerts")
      .where({ alert_id: alertId })
      .update(updates)
      .returning("*")

    return updatedAlert || null
  }

  async deleteAdminAlert(alertId: string): Promise<boolean> {
    const deletedCount = await this.knex<DBAdminAlert>("admin_alerts")
      .where({ alert_id: alertId })
      .del()

    return deletedCount > 0
  }

  async getUsersForAlertTarget(
    targetType: string,
    targetContractorId?: string,
  ): Promise<string[]> {
    let query = this.knex("accounts").select("accounts.user_id")

    switch (targetType) {
      case "all_users":
        // All users except banned ones
        query = query.where("banned", false)
        break

      case "org_members":
        // Users who are members of any organization
        query = query
          .join(
            "contractor_members",
            "accounts.user_id",
            "=",
            "contractor_members.user_id",
          )
          .where("accounts.banned", false)
        break

      case "org_owners":
        // Users who own organizations (have Owner role in contractor_member_roles)
        query = query
          .join(
            "contractor_member_roles",
            "accounts.user_id",
            "=",
            "contractor_member_roles.user_id",
          )
          .join(
            "contractor_roles",
            "contractor_member_roles.role_id",
            "=",
            "contractor_roles.role_id",
          )
          .where("contractor_roles.name", "Owner")
          .where("accounts.banned", false)
        break

      case "admins_only":
        // Only admin users
        query = query.where("role", "admin").where("banned", false)
        break

      case "specific_org":
        // Members of a specific organization
        if (!targetContractorId) {
          return []
        }

        query = query
          .join(
            "contractor_members",
            "accounts.user_id",
            "=",
            "contractor_members.user_id",
          )
          .where("contractor_members.contractor_id", targetContractorId)
          .where("accounts.banned", false)
        break

      default:
        return []
    }

    const results = await query
    return results.map((row: any) => row.user_id)
  }

  // Responsive Badge Tracking Functions

  async trackOrderAssignment(
    order_id: string,
    assigned_user_id?: string,
    assigned_contractor_id?: string,
  ) {
    if (!assigned_user_id && !assigned_contractor_id) {
      throw new Error(
        "Either assigned_user_id or assigned_contractor_id must be provided",
      )
    }

    await this.knex("order_response_times").insert({
      order_id,
      assigned_user_id: assigned_user_id || null,
      assigned_contractor_id: assigned_contractor_id || null,
      assigned_at: new Date(),
      is_responded: false,
    })
  }

  async trackOrderResponse(
    order_id: string,
    assigned_user_id?: string,
    assigned_contractor_id?: string,
  ) {
    if (!assigned_user_id && !assigned_contractor_id) {
      throw new Error(
        "Either assigned_user_id or assigned_contractor_id must be provided",
      )
    }

    const whereClause: any = { order_id }
    if (assigned_user_id) {
      whereClause.assigned_user_id = assigned_user_id
    }
    if (assigned_contractor_id) {
      whereClause.assigned_contractor_id = assigned_contractor_id
    }

    const assignment = await this.knex("order_response_times")
      .where(whereClause)
      .first()

    if (assignment && !assignment.is_responded) {
      const responseTimeMinutes = Math.floor(
        (new Date().getTime() - new Date(assignment.assigned_at).getTime()) /
          (1000 * 60),
      )

      await this.knex("order_response_times").where(whereClause).update({
        responded_at: new Date(),
        response_time_minutes: responseTimeMinutes,
        is_responded: true,
      })
    }
  }

  async getUserResponseStats(user_id: string): Promise<{
    total_assignments: number
    responded_within_24h: number
    response_rate: number
  }> {
    const stats = await this.knex("order_response_times")
      .where("assigned_user_id", user_id)
      .select(
        this.knex.raw("COUNT(*) as total_assignments"),
        this.knex.raw(
          "COUNT(CASE WHEN response_time_minutes <= 1440 THEN 1 END) as responded_within_24h",
        ),
      )
      .first()

    const total = parseInt(stats.total_assignments) || 0
    const within24h = parseInt(stats.responded_within_24h) || 0

    return {
      total_assignments: total,
      responded_within_24h: within24h,
      response_rate: total > 0 ? (within24h / total) * 100 : 0,
    }
  }

  async getContractorResponseStats(contractor_id: string): Promise<{
    total_assignments: number
    responded_within_24h: number
    response_rate: number
  }> {
    const stats = await this.knex("order_response_times")
      .where("assigned_contractor_id", contractor_id)
      .select(
        this.knex.raw("COUNT(*) as total_assignments"),
        this.knex.raw(
          "COUNT(CASE WHEN response_time_minutes <= 1440 THEN 1 END) as responded_within_24h",
        ),
      )
      .first()

    const total = parseInt(stats.total_assignments) || 0
    const within24h = parseInt(stats.responded_within_24h) || 0

    return {
      total_assignments: total,
      responded_within_24h: within24h,
      response_rate: total > 0 ? (within24h / total) * 100 : 0,
    }
  }

  async getUserBadges(user_id: string): Promise<{
    badge_ids: string[]
    metadata: any
  } | null> {
    const badge = await this.knex("user_badges_materialized")
      .where("user_id", user_id)
      .where("entity_type", "user")
      .first()

    if (!badge) {
      return null
    }

    return {
      badge_ids: badge.badge_ids || [],
      metadata: badge.badge_metadata || {},
    }
  }

  async getContractorBadges(contractor_id: string): Promise<{
    badge_ids: string[]
    metadata: any
  } | null> {
    const badge = await this.knex("user_badges_materialized")
      .where("contractor_id", contractor_id)
      .where("entity_type", "contractor")
      .first()

    if (!badge) {
      return null
    }

    return {
      badge_ids: badge.badge_ids || [],
      metadata: badge.badge_metadata || {},
    }
  }

  async getBadgesForEntities(
    entities: Array<{ user_id?: string; contractor_id?: string }>,
  ): Promise<Map<string, { badge_ids: string[]; metadata: any }>> {
    const badgeMap = new Map<
      string,
      { badge_ids: string[]; metadata: any }
    >()

    if (entities.length === 0) {
      return badgeMap
    }

    // Build query for all entities
    const userIds = entities
      .filter((e) => e.user_id)
      .map((e) => e.user_id!)
    const contractorIds = entities
      .filter((e) => e.contractor_id)
      .map((e) => e.contractor_id!)

    const badges = await this.knex("user_badges_materialized")
      .where((builder) => {
        if (userIds.length > 0) {
          builder.orWhereIn("user_id", userIds)
        }
        if (contractorIds.length > 0) {
          builder.orWhereIn("contractor_id", contractorIds)
        }
      })
      .select("*")

    for (const badge of badges) {
      const key = badge.user_id || badge.contractor_id
      if (key) {
        badgeMap.set(key, {
          badge_ids: badge.badge_ids || [],
          metadata: badge.badge_metadata || {},
        })
      }
    }

    return badgeMap
  }

  // =============================================================================
  // ORDER SETTINGS METHODS
  // =============================================================================

  async getOrderSettings(
    entityType: "user" | "contractor",
    entityId: string,
  ): Promise<DBOrderSetting[]> {
    return await this.knex<DBOrderSetting>("order_settings")
      .where({ entity_type: entityType, entity_id: entityId })
      .orderBy("setting_type", "asc")
  }

  async getOrderSetting(
    entityType: "user" | "contractor",
    entityId: string,
    settingType: "offer_message" | "order_message" | "require_availability" | "stock_subtraction_timing",
  ): Promise<DBOrderSetting | null> {
    return (
      (await this.knex<DBOrderSetting>("order_settings")
        .where({
          entity_type: entityType,
          entity_id: entityId,
          setting_type: settingType,
        })
        .first()) || null
    )
  }

  async createOrderSetting(
    setting: Omit<DBOrderSetting, "id" | "created_at" | "updated_at">,
  ): Promise<DBOrderSetting> {
    const [created] = await this.knex<DBOrderSetting>("order_settings")
      .insert({
        ...setting,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*")

    return created
  }

  async updateOrderSetting(
    id: string,
    updates: Partial<Pick<DBOrderSetting, "message_content" | "enabled">>,
  ): Promise<DBOrderSetting> {
    const [updated] = await this.knex<DBOrderSetting>("order_settings")
      .where({ id })
      .update({
        ...updates,
        updated_at: new Date(),
      })
      .returning("*")

    return updated
  }

  async deleteOrderSetting(id: string): Promise<void> {
    await this.knex("order_settings").where({ id }).del()
  }

  // =============================================================================
  // AVAILABILITY REQUIREMENT METHODS
  // =============================================================================

  /**
   * Check if availability is required for the given seller(s)
   * Priority: contractor setting > user setting
   * @param contractor_id - Seller contractor ID (if applicable)
   * @param user_id - Seller user ID (if applicable)
   * @returns true if availability is required, false otherwise
   */
  async getAvailabilityRequirement(
    contractor_id: string | null,
    user_id: string | null,
  ): Promise<boolean> {
    // Check contractor setting first (higher priority)
    if (contractor_id) {
      const contractorSetting = await this.getOrderSetting(
        "contractor",
        contractor_id,
        "require_availability",
      )
      if (contractorSetting && contractorSetting.enabled) {
        return true
      }
    }

    // Check user setting if no contractor setting found
    if (user_id) {
      const userSetting = await this.getOrderSetting(
        "user",
        user_id,
        "require_availability",
      )
      if (userSetting && userSetting.enabled) {
        return true
      }
    }

    return false
  }

  /**
   * Check if user has availability set for the given context
   * @param user_id - Buyer user ID
   * @param seller_contractor_id - Seller's contractor ID (for contractor-specific check)
   * @returns true if availability is set, false otherwise
   */
  async hasAvailabilitySet(
    user_id: string,
    seller_contractor_id: string | null,
  ): Promise<boolean> {
    const availability = await this.getUserAvailability(
      user_id,
      seller_contractor_id,
    )
    return availability.length > 0
  }
}

export const database = new KnexDatabase()
