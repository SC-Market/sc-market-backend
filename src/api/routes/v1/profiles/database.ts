/**
 * Profile/user-related database operations.
 * This module contains all database queries specific to users, providers, integrations, and user settings.
 */

import { getKnex, database } from "../../../../clients/database/knex-db.js"
import { getUserTransactions as getUserTransactionsFromTransactions } from "../transactions/database.js"
import { User } from "../api-models.js"
import {
  DBUser,
  DBAccountProvider,
  DBAccountIntegration,
  DBAccountSettings,
  DBAvailabilityEntry,
  DBBlocklist,
  DBReview,
  MinimalUser,
  AvailabilitySpan,
} from "../../../../clients/database/db-models.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { getUserRating } from "../util/formatting.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Cached Discord user interface (for insertUser methods)
 */
export interface CachedDiscordUser {
  id: string
  username: string
  discriminator: string
}

/**
 * Insert user raw data.
 */
export async function insertUserRaw(data: Partial<DBUser> | Partial<DBUser>[]) {
  return (await knex()<DBUser>("accounts").insert(data).returning("*"))[0]
}

/**
 * Insert user with Discord provider.
 */
export async function insertUser(
  profile: CachedDiscordUser,
  access_token: string,
  refresh_token: string,
): Promise<User> {
  // Check if user exists by Discord provider
  let user = await getUserByProvider("discord", profile.id)

  if (user == null) {
    // Create new user with Discord provider
    // Discord tokens typically expire in 7 days
    const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    // Generate username in format: new_user{discord_id}
    const generatedUsername = `new_user${profile.id}`
    user = await createUserWithProvider(
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
    await knex()<DBUser>("accounts").where("user_id", user.user_id).update({
      discord_id: profile.id,
      discord_access_token: access_token,
      discord_refresh_token: refresh_token,
    })

    // Refresh user to get updated discord_id
    user = await getUser({ user_id: user.user_id })

    // Account settings are created by createUserWithProvider, so no need to insert again
  } else {
    // Update tokens for existing user
    // Discord tokens typically expire in 7 days
    const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await updateProviderTokens(user.user_id, "discord", {
      access_token: access_token,
      refresh_token: refresh_token,
      token_expires_at: discordExpiresAt,
    })

    // Also update legacy columns for backward compatibility
    await updateUser(
      { user_id: user.user_id },
      {
        discord_access_token: access_token,
        discord_refresh_token: refresh_token,
      },
    )

    // Refresh user
    user = await getUser({ user_id: user.user_id })
  }

  return user
}

/**
 * Insert user with locale preference.
 */
export async function insertUserWithLocale(
  profile: CachedDiscordUser,
  access_token: string,
  refresh_token: string,
  preferredLocale: string,
): Promise<User> {
  // Check if user exists by Discord provider
  let user = await getUserByProvider("discord", profile.id)

  if (user == null) {
    // Create new user with Discord provider
    // Discord tokens typically expire in 7 days
    const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    user = await createUserWithProvider(
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
    await knex()<DBUser>("accounts").where("user_id", user.user_id).update({
      discord_id: profile.id,
      discord_access_token: access_token,
      discord_refresh_token: refresh_token,
    })

    // Refresh user to get updated discord_id
    user = await getUser({ user_id: user.user_id })
  } else {
    // Update tokens and locale for existing user
    // Discord tokens typically expire in 7 days
    const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await updateProviderTokens(user.user_id, "discord", {
      access_token: access_token,
      refresh_token: refresh_token,
      token_expires_at: discordExpiresAt,
    })

    // Also update legacy columns for backward compatibility
    await updateUser(
      { user_id: user.user_id },
      {
        discord_access_token: access_token,
        discord_refresh_token: refresh_token,
        locale: preferredLocale,
      },
    )

    // Refresh user
    user = await getUser({ user_id: user.user_id })
  }

  return user
}

/**
 * Get user by provider (replaces direct discord_id lookup)
 */
export async function getUserByProvider(
  providerType: string,
  providerId: string,
): Promise<User | null> {
  const provider = await knex()<DBAccountProvider>("account_providers")
    .where("provider_type", providerType)
    .where("provider_id", providerId)
    .first()

  if (!provider) {
    return null
  }

  return getUser({ user_id: provider.user_id })
}

/**
 * Get a specific provider for a user
 */
export async function getUserProvider(
  userId: string,
  providerType: string,
): Promise<DBAccountProvider | null> {
  const provider = await knex()<DBAccountProvider>("account_providers")
    .where("user_id", userId)
    .where("provider_type", providerType)
    .first()
  return provider || null
}

/**
 * Get Discord provider ID for a user
 * Returns null if Discord is not linked
 */
export async function getUserDiscordId(userId: string): Promise<string | null> {
  const provider = await getUserProvider(userId, "discord")
  return provider?.provider_id || null
}

/**
 * Get user by Discord ID
 */
export async function getUserByDiscordId(
  discordId: string,
): Promise<User | null> {
  return await getUserByProvider("discord", discordId)
}

/**
 * Get all providers for a user
 */
export async function getUserProviders(
  userId: string,
): Promise<DBAccountProvider[]> {
  return knex()<DBAccountProvider>("account_providers")
    .where("user_id", userId)
    .select("*")
}

/**
 * Get primary provider for a user
 */
export async function getPrimaryProvider(
  userId: string,
): Promise<DBAccountProvider | null> {
  const result = await knex()<DBAccountProvider>("account_providers")
    .where("user_id", userId)
    .where("is_primary", true)
    .first()
  return result || null
}

/**
 * Link a provider to a user account
 * Note: For Citizen ID, validation should be done before calling this
 */
export async function linkProvider(
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
  const existingProvider = await knex()<DBAccountProvider>("account_providers")
    .where("provider_type", providerData.provider_type)
    .where("provider_id", providerData.provider_id)
    .first()

  if (existingProvider && existingProvider.user_id !== userId) {
    throw new Error(
      `This ${providerData.provider_type} account is already linked to another user`,
    )
  }

  const [provider] = await knex()<DBAccountProvider>("account_providers")
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
export async function unlinkProvider(
  userId: string,
  providerType: string,
): Promise<void> {
  // Prevent unlinking if it's the only primary provider
  const providers = await getUserProviders(userId)
  const primaryProviders = providers.filter((p) => p.is_primary)

  if (
    primaryProviders.length === 1 &&
    primaryProviders[0].provider_type === providerType
  ) {
    throw new Error("Cannot unlink the only primary authentication provider")
  }

  await knex()<DBAccountProvider>("account_providers")
    .where("user_id", userId)
    .where("provider_type", providerType)
    .delete()
}

/**
 * Update provider tokens
 */
export async function updateProviderTokens(
  userId: string,
  providerType: string,
  tokens: {
    access_token?: string
    refresh_token?: string
    token_expires_at?: Date | null
  },
): Promise<void> {
  await knex()<DBAccountProvider>("account_providers")
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
export async function setPrimaryProvider(
  userId: string,
  providerType: string,
): Promise<void> {
  // First, unset all primary providers
  await knex()<DBAccountProvider>("account_providers")
    .where("user_id", userId)
    .update({ is_primary: false })

  // Then set the new primary
  await knex()<DBAccountProvider>("account_providers")
    .where("user_id", userId)
    .where("provider_type", providerType)
    .update({ is_primary: true })
}

/**
 * Create user with provider (replaces insertUserWithLocale for new providers)
 * Note: For Citizen ID, verification must be checked before calling this
 */
export async function createUserWithProvider(
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
  const existingProvider = await knex()<DBAccountProvider>("account_providers")
    .where("provider_type", providerData.provider_type)
    .where("provider_id", providerData.provider_id)
    .first()

  if (existingProvider) {
    // Update tokens and return existing user
    await updateProviderTokens(
      existingProvider.user_id,
      providerData.provider_type,
      {
        access_token: providerData.access_token || undefined,
        refresh_token: providerData.refresh_token || undefined,
        token_expires_at: providerData.token_expires_at || undefined,
      },
    )
    return getUser({ user_id: existingProvider.user_id })
  }

  // Create new user
  const username =
    providerData.metadata?.username ||
    `user_${providerData.provider_id.substring(0, 8)}`
  const displayName =
    providerData.metadata?.displayName ||
    providerData.metadata?.username ||
    username

  // For Citizen ID, set rsi_confirmed to true and spectrum_user_id during creation
  // since verification is checked before calling this function
  const isCitizenID = providerData.provider_type === "citizenid"
  const rsiSpectrumId = providerData.metadata?.rsiSpectrumId

  const [user] = await knex()<DBUser>("accounts")
    .insert({
      username: username,
      display_name: displayName,
      locale: locale,
      rsi_confirmed: isCitizenID ? true : false, // Citizen ID users are verified before creation
      spectrum_user_id: isCitizenID && rsiSpectrumId ? rsiSpectrumId : null,
      discord_id: null, // Can be null now
    })
    .returning("*")

  // Link provider
  await linkProvider(user.user_id, {
    ...providerData,
    is_primary: providerData.is_primary ?? true, // First provider is always primary
  })

  // Create account settings
  await knex()<DBAccountSettings>("account_settings").insert({
    user_id: user.user_id,
  })

  return getUser({ user_id: user.user_id })
}

/**
 * Validate if Citizen ID can be linked to an existing account
 * Rules:
 * - Account must be unverified (rsi_confirmed = false), OR
 * - Account must be verified AND usernames must match
 */
export async function validateCitizenIDLinking(
  userId: string,
  citizenIDSpectrumId: string,
): Promise<{
  canLink: boolean
  reason?: string
  accountSpectrumId?: string
  citizenIDSpectrumId?: string
}> {
  const user = await getUser({ user_id: userId })

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

/**
 * Get integration settings for a user
 */
export async function getUserIntegration(
  userId: string,
  integrationType: string,
): Promise<DBAccountIntegration | null> {
  const result = await knex()<DBAccountIntegration>("account_integrations")
    .where("user_id", userId)
    .where("integration_type", integrationType)
    .first()
  return result || null
}

/**
 * Upsert integration settings for a user
 */
export async function upsertIntegration(
  userId: string,
  integration: {
    integration_type: string
    settings: Record<string, any>
    enabled?: boolean
  },
): Promise<void> {
  await knex()<DBAccountIntegration>("account_integrations")
    .insert({
      user_id: userId,
      integration_type: integration.integration_type,
      settings: integration.settings,
      enabled: integration.enabled ?? true,
      configured_at: new Date(),
    })
    .onConflict(["user_id", "integration_type"])
    .merge({
      settings: knex().raw("account_integrations.settings || ?::jsonb", [
        JSON.stringify(integration.settings),
      ]),
      enabled: integration.enabled ?? true,
      last_used_at: new Date(),
    })
}

/**
 * Get all integrations for a user
 */
export async function getUserIntegrations(
  userId: string,
): Promise<DBAccountIntegration[]> {
  return knex()<DBAccountIntegration>("account_integrations")
    .where("user_id", userId)
    .select("*")
}

/**
 * Get Discord integration settings with fallback to old columns
 * This provides backward compatibility during migration
 */
export async function getDiscordIntegrationSettings(userId: string): Promise<{
  official_server_id: string | null
  discord_thread_channel_id: string | null
}> {
  // Try new integration table first
  const integration = await getUserIntegration(userId, "discord")
  if (integration && integration.settings) {
    return {
      official_server_id:
        integration.settings.official_server_id?.toString() || null,
      discord_thread_channel_id:
        integration.settings.discord_thread_channel_id?.toString() || null,
    }
  }

  // Fallback to old columns
  const user = await getUser({ user_id: userId })
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

/**
 * Get user by where clause.
 * @throws Error if user not found
 */
export async function getUser(
  where: any,
  options: {
    noBalance: boolean
  } = { noBalance: false },
): Promise<User> {
  const user = await knex()<DBUser>("accounts").where(where).first()

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

/**
 * Find user by where clause (returns null if not found).
 */
export async function findUser(
  where: any,
  options: {
    noBalance: boolean
  } = { noBalance: false },
): Promise<User | null> {
  const user = await knex()<DBUser>("accounts").where(where).first()

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

/**
 * Get login user (without sensitive fields).
 */
export async function getLogin(where: any): Promise<User> {
  const user = await knex()<DBUser>("accounts").where(where).first()

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

/**
 * Get minimal user information.
 */
export async function getMinimalUser(
  where: any,
  options: {
    noBalance: boolean
  } = { noBalance: false },
): Promise<MinimalUser> {
  const user = await knex()<DBUser>("accounts").where(where).first("accounts.*")

  if (!user) {
    throw new Error("Invalid user!")
  }

  return {
    username: user.username,
    avatar: (await cdn.getFileLinkResource(user.avatar))!,
    display_name: user.display_name,
    rating: await getUserRating(user.user_id),
    badges: await getUserBadges(user.user_id),
  }
}

/**
 * Get all minimal users.
 */
export async function getAllMinimalUsers(
  options: {
    noBalance: boolean
  } = { noBalance: false },
): Promise<MinimalUser[]> {
  const users = await knex()<DBUser>("accounts").select()

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

/**
 * Increment user balance.
 */
export async function incrementUserBalance(
  user_id: string,
  amount: number,
): Promise<void> {
  await knex()("accounts")
    .where({ user_id: user_id })
    .increment("balance", amount)
}

/**
 * Decrement user balance.
 */
export async function decrementUserBalance(
  user_id: string,
  amount: number,
): Promise<void> {
  await knex()("accounts")
    .where({ user_id: user_id })
    .decrement("balance", amount)
}

/**
 * Update user by where clause.
 */
export async function updateUser(where: any, values: Partial<DBUser>) {
  return knex()<DBUser>("accounts").where(where).update(values).returning("*")
}

/**
 * Get all users.
 */
export async function getUsers() {
  return knex()<DBUser>("accounts").select()
}

/**
 * Get users by where clause.
 */
export async function getUsersWhere(where: any = {}) {
  return knex()<DBUser>("accounts").where(where).select()
}

/**
 * Get users with pagination.
 */
export async function getUsersPaginated(
  page: number,
  pageSize: number,
  where: any = {},
  sortBy: string = "created_at",
  sortOrder: "asc" | "desc" = "desc",
) {
  const offset = (page - 1) * pageSize

  // Get total count
  const totalCount = await knex()<DBUser>("accounts")
    .where(where)
    .count("* as count")
    .first()
  const total = totalCount ? parseInt((totalCount as any).count) : 0

  // Get paginated users
  const users = await knex()<DBUser>("accounts")
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

/**
 * Get user transactions (both sent and received).
 */
export async function getUserTransactions(user_id: string) {
  return getUserTransactionsFromTransactions(user_id)
}

/**
 * Get user blocklist.
 */
export async function getUserBlocklist(
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

  return knex()<DBBlocklist>("blocklist")
    .where(whereClause)
    .orderBy("created_at", "desc")
}

/**
 * Get user settings.
 */
export async function getUserSettings(user_id: string) {
  let settings = await knex()<DBAccountSettings>("account_settings")
    .where({ user_id })
    .first()

  if (!settings) {
    settings = (
      await knex()<DBAccountSettings>("account_settings")
        .insert({ user_id })
        .returning("*")
    )[0]
  }

  return settings
}

/**
 * Get user availability.
 */
export async function getUserAvailability(
  user_id: string,
  contractor_id: string | null,
) {
  const availability = await knex()<DBAvailabilityEntry>("user_availability")
    .where({ user_id })
    .andWhere("contractor_id", contractor_id)
    .select()

  if (!availability) {
    return []
  }

  return availability
}

/**
 * Update user availability.
 */
export async function updateUserAvailability(
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

  await knex()<DBAvailabilityEntry>("user_availability")
    .where({ user_id, contractor_id })
    .delete()

  // Only insert if there are entries to insert (allows clearing availability)
  if (entries.length > 0) {
    return knex()<DBAvailabilityEntry>("user_availability").insert(entries)
  }
  return []
}

/**
 * Update user settings.
 */
export async function updateUserSettings(user_id: string, settings: any) {
  return knex()<DBAccountSettings>("account_settings")
    .where({ user_id })
    .update(settings)
    .returning("*")
}

/**
 * Get user response stats for responsive badge.
 */
export async function getUserResponseStats(user_id: string): Promise<{
  total_assignments: number
  responded_within_24h: number
  response_rate: number
}> {
  const stats = await knex()("order_response_times")
    .where("assigned_user_id", user_id)
    .select(
      knex().raw("COUNT(*) as total_assignments"),
      knex().raw(
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

/**
 * Get user badges.
 */
export async function getUserBadges(user_id: string): Promise<{
  badge_ids: string[]
  metadata: any
} | null> {
  const badge = await knex()("user_badges_materialized")
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

/**
 * Get user reviews.
 */

/**
 * Get users who have blocked this user.
 */
export async function getBlockedByUsers(
  user_id: string,
): Promise<DBBlocklist[]> {
  return knex()<DBBlocklist>("blocklist")
    .where("blocked_id", user_id)
    .orderBy("created_at", "desc")
}

/**
 * Check if user is blocked for a specific order.
 */
export async function checkIfBlockedForOrder(
  customer_id: string,
  contractor_id: string | null,
  assigned_id: string | null,
  user_id: string,
): Promise<boolean> {
  if (customer_id) {
    const isBlockedByCustomer = await isUserBlocked(
      customer_id,
      user_id,
      "user",
    )
    if (isBlockedByCustomer) {
      return true
    }
  }

  if (contractor_id) {
    const isBlockedByContractor = await isUserBlocked(
      contractor_id,
      user_id,
      "contractor",
    )
    if (isBlockedByContractor) {
      return true
    }
  }

  if (assigned_id) {
    const isBlockedByAssigned = await isUserBlocked(
      assigned_id,
      user_id,
      "user",
    )
    if (isBlockedByAssigned) {
      return true
    }
  }

  return false
}

/**
 * Block a user.
 */
export async function blockUser(
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

  const [blocklist] = await knex()<DBBlocklist>("blocklist")
    .insert(insertData)
    .returning("*")
  return blocklist
}

/**
 * Unblock a user.
 */
export async function unblockUser(
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

  await knex()("blocklist").where(whereClause).delete()
}

/**
 * Check if a user is blocked.
 */
export async function isUserBlocked(
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

  const block = await knex()<DBBlocklist>("blocklist")
    .where(whereClause)
    .first()
  return !!block
}

export async function getUserReviews(user_id: string): Promise<DBReview[]> {
  return knex()<DBReview>("order_reviews")
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

/**
 * Search users by username or display name.
 */
export async function searchUsers(query: string): Promise<DBUser[]> {
  return knex()<DBUser>("accounts")
    .where("username", "ilike", `%${query}%`)
    .or.where("display_name", "ilike", `%${query}%`)
    .limit(25)
    .select()
}

/**
 * Get user's supported languages.
 * Returns array of language codes, defaults to ['en'] if none specified.
 */
export async function getUserLanguages(user_id: string): Promise<string[]> {
  const user = await knex()<DBUser>("accounts")
    .where({ user_id })
    .select("supported_languages")
    .first()

  if (
    !user ||
    !user.supported_languages ||
    user.supported_languages.length === 0
  ) {
    return ["en"] // Default to English
  }

  return user.supported_languages
}

/**
 * Set user's supported languages.
 * Stores as PostgreSQL array. English is default but not required.
 */
export async function setUserLanguages(
  user_id: string,
  language_codes: string[],
): Promise<void> {
  // Deduplicate
  const uniqueCodes = [...new Set(language_codes)]

  await knex()<DBUser>("accounts")
    .where({ user_id })
    .update({ supported_languages: uniqueCodes })
}
