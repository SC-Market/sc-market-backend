import refresh from "passport-oauth2-refresh"
import { database } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import { getCitizenIDConfig } from "./auth-helpers.js"
import logger from "../../logger/logger.js"

/**
 * Refresh Discord access token using refresh token
 */
export async function refreshDiscordToken(
  userId: string,
  refreshToken: string,
): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date | null
} | null> {
  try {
    // Get the Discord strategy from database (set during passport setup)
    const strategy = database.getStrategy()
    if (!strategy) {
      logger.warn(
        `[Token Refresh] Discord strategy not available for user ${userId}`,
      )
      return null
    }

    // Use passport-oauth2-refresh to refresh the token
    const newTokens = await new Promise<{
      access_token: string
      refresh_token: string
      expires_in?: number
    }>((resolve, reject) => {
      refresh.requestNewAccessToken(
        "discord",
        refreshToken,
        (
          err: any,
          access_token?: string,
          refresh_token?: string,
          results?: any,
        ) => {
          if (err) {
            reject(
              err instanceof Error
                ? err
                : new Error(`Token refresh failed: ${JSON.stringify(err)}`),
            )
            return
          }
          if (!access_token || !refresh_token) {
            reject(new Error("Token refresh returned undefined tokens"))
            return
          }
          resolve({
            access_token: access_token,
            refresh_token: refresh_token,
            expires_in: results?.expires_in,
          })
        },
      )
    })

    // Calculate expiration time (Discord tokens typically expire in 7 days, but we'll use expires_in if provided)
    const expiresAt = newTokens.expires_in
      ? new Date(Date.now() + newTokens.expires_in * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Default to 7 days if not provided

    // Update tokens in database
    await database.updateProviderTokens(userId, "discord", {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      token_expires_at: expiresAt,
    })

    // Also update legacy columns for backward compatibility
    await database.updateUser(
      { user_id: userId },
      {
        discord_access_token: newTokens.access_token,
        discord_refresh_token: newTokens.refresh_token,
      },
    )

    logger.info(
      `[Token Refresh] Successfully refreshed Discord token for user ${userId}`,
    )

    return {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      expiresAt,
    }
  } catch (error) {
    logger.warn(
      `[Token Refresh] Failed to refresh Discord token for user ${userId}:`,
      error,
    )
    return null
  }
}

/**
 * Refresh Citizen ID access token using refresh token
 */
export async function refreshCitizenIDToken(
  userId: string,
  refreshToken: string,
): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date | null
} | null> {
  try {
    const config = getCitizenIDConfig()

    // Make token refresh request to Citizen ID
    const tokenResponse = await fetch(config.tokenURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: env.CITIZENID_CLIENT_ID!,
        client_secret: env.CITIZENID_CLIENT_SECRET!,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      throw new Error(
        `Citizen ID token refresh failed: ${tokenResponse.status} ${errorText}`,
      )
    }

    const tokenData = await tokenResponse.json()

    // Calculate expiration time
    // OpenID Connect tokens typically include expires_in in seconds
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null // If no expiration info, store as null

    // Update tokens in database
    await database.updateProviderTokens(userId, "citizenid", {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshToken, // Use new refresh token if provided, otherwise keep old one
      token_expires_at: expiresAt,
    })

    logger.info(
      `[Token Refresh] Successfully refreshed Citizen ID token for user ${userId}`,
    )

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken,
      expiresAt,
    }
  } catch (error) {
    logger.warn(
      `[Token Refresh] Failed to refresh Citizen ID token for user ${userId}:`,
      error,
    )
    return null
  }
}

/**
 * Get a valid access token for a provider, refreshing if necessary
 */
/**
 * Get a valid access token for a provider, refreshing if necessary
 * @param userId - User ID to get token for
 * @param providerType - Provider type ("discord" or "citizenid")
 * @returns Valid access token or null if unavailable
 */
export async function getValidAccessToken(
  userId: string,
  providerType: "discord" | "citizenid",
): Promise<string | null> {
  try {
    const provider = await database.getUserProvider(userId, providerType)
    if (!provider || !provider.access_token) {
      return null
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    const now = new Date()
    const expiresSoonThreshold = 5 * 60 * 1000 // 5 minutes in milliseconds

    if (provider.token_expires_at) {
      const expiresAt = new Date(provider.token_expires_at)
      const timeUntilExpiry = expiresAt.getTime() - now.getTime()

      // If expired or expiring soon, refresh it
      if (timeUntilExpiry <= expiresSoonThreshold) {
        if (!provider.refresh_token) {
          logger.warn(
            `[Token Refresh] No refresh token available for ${providerType} provider of user ${userId}, using existing token`,
          )
          return provider.access_token // Return existing token even if expired
        }

        logger.info(
          `[Token Refresh] Token expiring soon or expired for ${providerType} provider of user ${userId}, refreshing...`,
        )

        try {
          const refreshed =
            providerType === "discord"
              ? await refreshDiscordToken(userId, provider.refresh_token)
              : await refreshCitizenIDToken(userId, provider.refresh_token)

          if (refreshed) {
            return refreshed.accessToken
          }

          // If refresh failed, return existing token (will fail on API call, but that's okay)
          // User will need to re-authenticate on next login, but we don't force it now
          logger.warn(
            `[Token Refresh] Refresh failed for ${providerType} provider of user ${userId}, using existing token (may be expired)`,
          )
          return provider.access_token
        } catch (refreshError) {
          // Catch any errors during refresh attempt and fall back to existing token
          logger.warn(
            `[Token Refresh] Error during refresh attempt for ${providerType} provider of user ${userId}:`,
            refreshError,
          )
          logger.warn(
            `[Token Refresh] Falling back to existing token (may be expired)`,
          )
          return provider.access_token
        }
      }
    }

    // Token is still valid (or expiration unknown)
    return provider.access_token
  } catch (error) {
    // If we can't even get the provider, log error but try to return token from user object as last resort
    logger.error(
      `[Token Refresh] Error getting valid access token for ${providerType} provider of user ${userId}:`,
      error,
    )

    // Try to get token from legacy columns as fallback (for Discord only)
    if (providerType === "discord") {
      try {
        const user = await database.getUser({ user_id: userId })
        if (user.discord_access_token) {
          logger.warn(
            `[Token Refresh] Using legacy Discord token as fallback for user ${userId}`,
          )
          return user.discord_access_token
        }
      } catch (fallbackError) {
        // Ignore fallback errors
      }
    }

    return null
  }
}
