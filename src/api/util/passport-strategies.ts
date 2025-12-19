import { Request } from "express"
import passport from "passport"
import { Profile, Strategy, StrategyOptionsWithRequest } from "passport-discord"
import refresh from "passport-oauth2-refresh"
import * as oauth2 from "passport-oauth2"
import {
  Strategy as CitizenIDStrategy,
  Scopes,
  CitizenIDVerifyFunctionWithRequest,
  CitizenIDProfile,
  PassportDoneCallback,
} from "passport-citizenid"
import { User } from "../routes/v1/api-models.js"
import { database } from "../../clients/database/knex-db.js"
import { cdn } from "../../clients/cdn/cdn.js"
import { env } from "../../config/env.js"
import {
  isCitizenIDVerified,
  getValidLocale,
  extractRSIData,
  CitizenIDErrorCodes,
  getCitizenIDConfig,
} from "./auth-helpers.js"

/**
 * Get Discord passport configuration
 */
export function getDiscordConfig(backendUrl: URL): StrategyOptionsWithRequest {
  return {
    // The Client Id for your discord application (See "Discord Application Setup")
    clientID: env.DISCORD_CLIENT_ID || "wumpus",

    // The Client Secret for your discord application (See "Discord Application Setup")
    clientSecret: env.DISCORD_CLIENT_SECRET || "supmuw",

    // The callback URL - Your app should be accessible on this domain. You can use
    // localhost for testing, just makes sure it's set as a Redirect URL (See "Discord Application Setup")
    callbackURL: new URL("auth/discord/callback", backendUrl).toString(),

    /* Optional items: */

    // The scope for your OAuth request - You can use strings or Scope values
    // The default scope is Scope.IDENTIFY which gives basic profile information
    scope: ["identify"], // 'email', 'guilds'
    passReqToCallback: true,
  }
}

/**
 * Create Discord passport strategy
 */
export function createDiscordStrategy(
  backendUrl: URL,
): Strategy {
  const passportConfig = getDiscordConfig(backendUrl)

  const strategy = new Strategy(
    passportConfig,
    async (
      req: Request,
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      cb: oauth2.VerifyCallback,
    ) => {
      try {
        // Check if user is logged in (linking scenario)
        if (req.isAuthenticated()) {
          const currentUser = req.user as User

          // Link Discord to existing account
          // Discord tokens typically expire in 7 days (604800 seconds)
          const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          await database.linkProvider(currentUser.user_id, {
            provider_type: "discord",
            provider_id: profile.id,
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expires_at: discordExpiresAt,
            metadata: {
              username: profile.username,
              discriminator: profile.discriminator,
            },
            is_primary: false, // Don't override existing primary
          })

          // Refresh user data
          const updatedUser = await database.getUser({
            user_id: currentUser.user_id,
          })
          return cb(null, updatedUser)
        }

        // New login - find or create user
        let user = await database.getUserByProvider("discord", profile.id)

        if (!user) {
          // Create new user using new provider system
          // Discord tokens typically expire in 7 days (604800 seconds)
          const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          // Generate username in format: new_user{discord_id}
          const generatedUsername = `new_user${profile.id}`
          user = await database.createUserWithProvider(
            {
              provider_type: "discord",
              provider_id: profile.id,
              access_token: accessToken,
              refresh_token: refreshToken,
              token_expires_at: discordExpiresAt,
              metadata: {
                username: generatedUsername,
                displayName: generatedUsername,
                discriminator: profile.discriminator,
              },
              is_primary: true,
            },
            getValidLocale(req.language),
          )

          // Also set discord_id for backward compatibility
          // (createUserWithProvider sets it to null, but Discord users should have it)
          await database.updateUser(
            { user_id: user.user_id },
            { discord_id: profile.id },
          )
          // Refresh user to get updated discord_id
          user = await database.getUser({ user_id: user.user_id })
        } else {
          // Update tokens for existing user
          // Discord tokens typically expire in 7 days
          const discordExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          await database.updateProviderTokens(user.user_id, "discord", {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expires_at: discordExpiresAt,
          })

          // Ensure discord_id is set for backward compatibility
          const discordProvider = await database.getUserProvider(
            user.user_id,
            "discord",
          )
          if (!discordProvider) {
            await database.updateUser(
              { user_id: user.user_id },
              { discord_id: profile.id },
            )
            user = await database.getUser({ user_id: user.user_id })
          }
        }

        return cb(null, user)
      } catch (error) {
        return cb(error as Error)
      }
    },
  )

  return strategy
}

/**
 * Create Citizen ID verify callback
 */
export function createCitizenIDVerifyCallback(
  isLinking: boolean,
): CitizenIDVerifyFunctionWithRequest<User, unknown, Request> {
  return async (
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: CitizenIDProfile,
    done: PassportDoneCallback<User, unknown>,
  ): Promise<void> => {
    try {
      // Extract RSI data from profile
      const { rsiUsername, rsiSpectrumId, rsiAvatar, discordAccountId, discordUsername } =
        extractRSIData(profile)

      // RSI username and spectrum ID are required - no fallback
      // If RSI data is not available, the user is not properly verified/linked to RSI
      if (!rsiUsername || !rsiSpectrumId) {
        const error = new Error(
          "Citizen ID account must have RSI profile linked to sign in",
        ) as Error & { code?: string }
        error.code = CitizenIDErrorCodes.ACCOUNT_NOT_VERIFIED
        return done(error, undefined)
      }

      // Use RSI username for both username and display name
      const citizenIDUsername = rsiUsername
      const displayName = rsiUsername

      // STEP 1: Verify Citizen ID account is verified (required for all operations)
      const verified = isCitizenIDVerified(profile)

      if (!verified) {
        const error = new Error(
          "Citizen ID account must be verified to sign up or log in",
        ) as Error & { code?: string }
        error.code = CitizenIDErrorCodes.ACCOUNT_NOT_VERIFIED
        return done(error, undefined)
      }

      // STEP 2: Handle linking vs login based on callback URL
      if (isLinking) {
        // Linking scenario - user is already authenticated (enforced by route middleware)
        const currentUser = req.user as User

        if (!currentUser) {
          const error = new Error(
            "You must be logged in to link your Citizen ID account",
          ) as Error & { code?: string }
          error.code = CitizenIDErrorCodes.AUTH_FAILED
          return done(error, undefined)
        }

        // STEP 3: Validate linking rules
        // - Account must be unverified OR
        // - Account must be verified AND spectrum IDs must match
        const validation = await database.validateCitizenIDLinking(
          currentUser.user_id,
          rsiSpectrumId,
        )

        if (!validation.canLink) {
          // Build detailed error message with spectrum IDs
          let errorMessage =
            validation.reason ||
            "Cannot link: Account is verified but spectrum IDs do not match"
          if (validation.accountSpectrumId && validation.citizenIDSpectrumId) {
            errorMessage = `Cannot link: Your account spectrum ID "${validation.accountSpectrumId}" does not match your Citizen ID spectrum ID "${validation.citizenIDSpectrumId}". Please use matching spectrum IDs to link accounts.`
          }

          const error = new Error(errorMessage) as Error & {
            code?: string
            accountSpectrumId?: string
            citizenIDSpectrumId?: string
          }
          error.code = CitizenIDErrorCodes.USERNAME_MISMATCH
          error.accountSpectrumId = validation.accountSpectrumId
          error.citizenIDSpectrumId = validation.citizenIDSpectrumId
          return done(error, undefined)
        }

        // Check if Citizen ID already linked to another account
        const existingUser = await database.getUserByProvider(
          "citizenid",
          profile.id,
        )

        if (existingUser && existingUser.user_id !== currentUser.user_id) {
          const error = new Error(
            "This Citizen ID account is already linked to another user",
          ) as Error & { code?: string }
          error.code = CitizenIDErrorCodes.ALREADY_LINKED
          return done(error, undefined)
        }

        // Check if Spectrum ID is already in use by another account
        // This prevents duplicate key violations when updating spectrum_user_id
        const userWithSpectrumId = await database.findUser({
          spectrum_user_id: rsiSpectrumId,
        })
        if (userWithSpectrumId && userWithSpectrumId.user_id !== currentUser.user_id) {
          const error = new Error(
            `This Spectrum ID (${rsiSpectrumId}) is already associated with another account. Please use a different Citizen ID account or contact support if you believe this is an error.`,
          ) as Error & { code?: string }
          error.code = CitizenIDErrorCodes.ALREADY_LINKED
          return done(error, undefined)
        }

        // Link Citizen ID to existing account
        // Token expiration will be set when we refresh (we don't have expires_in in callback)
        await database.linkProvider(currentUser.user_id, {
          provider_type: "citizenid",
          provider_id: profile.id,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: null, // Will be updated on first refresh
          metadata: {
            username: citizenIDUsername,
            rsiUsername: rsiUsername,
            rsiSpectrumId: rsiSpectrumId,
            discordAccountId: discordAccountId,
            displayName: displayName,
            roles: profile.roles,
          },
          is_primary: false,
        })

        // Update RSI verification status, spectrum_user_id, and discord_id from Citizen ID
        const updateData: {
          rsi_confirmed: boolean
          spectrum_user_id: string
          discord_id?: string
        } = {
          rsi_confirmed: true,
          spectrum_user_id: rsiSpectrumId,
        }
        // Only update discord_id if available and not already set
        const discordProvider = await database.getUserProvider(
          currentUser.user_id,
          "discord",
        )
        if (discordAccountId && !discordProvider) {
          updateData.discord_id = discordAccountId
        }
        await database.updateUser(
          { user_id: currentUser.user_id },
          updateData,
        )

        // Auto-link Discord as a provider if available and not already linked
        if (discordAccountId) {
          const providers = await database.getUserProviders(currentUser.user_id)
          const existingDiscordProvider = providers.find(
            (p) => p.provider_type === "discord",
          )

          if (!existingDiscordProvider) {
            await database.linkProvider(currentUser.user_id, {
              provider_type: "discord",
              provider_id: discordAccountId,
              access_token: null, // No tokens from Citizen ID - user can authenticate with Discord later to get tokens
              refresh_token: null,
              metadata: {
                username: discordUsername,
                linkedViaCitizenID: true, // Flag to indicate this was auto-linked
              },
              is_primary: false,
            })
          }
        }

        const updatedUser = await database.getUser({
          user_id: currentUser.user_id,
        })

        if (!updatedUser) {
          return done(
            new Error("Failed to retrieve updated user after linking"),
            undefined,
          )
        }

        return done(null, updatedUser)
      }

      // STEP 4: New login - find or create user
      let user = await database.getUserByProvider("citizenid", profile.id)

      if (!user) {
        // Check if username already exists (might be registered with Discord)
        const existingUser = await database.findUser({ username: citizenIDUsername })

        // If username exists and account is verified, user needs to login with Discord first
        if (existingUser && existingUser.rsi_confirmed) {
          const error = new Error(
            `Username "${citizenIDUsername}" is already registered. Please log in with Discord first, then link your Citizen ID account in settings.`,
          ) as Error & { code?: string }
          error.code = CitizenIDErrorCodes.USERNAME_TAKEN
          return done(error, undefined)
        }

        // Check if Spectrum ID is already in use by another account
        // This prevents duplicate key violations when creating a new user
        const userWithSpectrumId = await database.findUser({
          spectrum_user_id: rsiSpectrumId,
        })
        if (userWithSpectrumId) {
          const error = new Error(
            `This Spectrum ID (${rsiSpectrumId}) is already associated with another account. Please log in with that account first, then link your Citizen ID account in settings.`,
          ) as Error & { code?: string }
          error.code = CitizenIDErrorCodes.ALREADY_LINKED
          return done(error, undefined)
        }

        // Create new user (Citizen ID is verified, so we can create)
        // Token expiration will be set when we refresh (we don't have expires_in in callback)
        try {
          user = await database.createUserWithProvider(
            {
              provider_type: "citizenid",
              provider_id: profile.id,
              access_token: accessToken,
              refresh_token: refreshToken,
              token_expires_at: null, // Will be updated on first refresh
              metadata: {
                username: citizenIDUsername,
                rsiUsername: rsiUsername,
                rsiSpectrumId: rsiSpectrumId,
                displayName: displayName,
                roles: profile.roles,
              },
              is_primary: true,
            },
            getValidLocale(req.language),
          )

          // Set avatar from RSI if available
          if (rsiAvatar) {
            try {
              const avatarResource = await cdn.createExternalResource(
                rsiAvatar,
                `${user.user_id}_rsi_avatar`,
              )
              await database.updateUser(
                { user_id: user.user_id },
                { avatar: avatarResource.resource_id },
              )
              // Refresh user to get updated avatar
              user = await database.getUser({ user_id: user.user_id })
            } catch (error) {
              // If external resource creation fails (e.g., URL not whitelisted), log and continue
              console.warn(
                `[CitizenID] Failed to create external resource for RSI avatar:`,
                error,
              )
            }
          }
        } catch (createError: any) {
          // Handle duplicate username constraint error
          if (
            createError?.code === "23505" &&
            createError?.constraint === "accounts_username_key"
          ) {
            // Username was taken between check and create
            // Check if it's a verified account
            try {
              const conflictingUser = await database.getUser({
                username: citizenIDUsername,
              })
              if (conflictingUser && conflictingUser.rsi_confirmed) {
                const error = new Error(
                  `Username "${citizenIDUsername}" is already registered. Please log in with Discord first, then link your Citizen ID account in settings.`,
                ) as Error & { code?: string }
                error.code = CitizenIDErrorCodes.USERNAME_TAKEN
                return done(error, undefined)
              }
            } catch (lookupError) {
              // If we can't look up the user, just pass through the original error
            }
          }
          // Re-throw if it's not a duplicate username error
          throw createError
        }

        // Set RSI verification status, spectrum_user_id, and discord_id from Citizen ID
        const updateData: {
          rsi_confirmed: boolean
          spectrum_user_id: string
          discord_id?: string
        } = {
          rsi_confirmed: true,
          spectrum_user_id: rsiSpectrumId,
        }
        // Populate discord_id from Citizen ID if available
        if (discordAccountId) {
          updateData.discord_id = discordAccountId
        }
        await database.updateUser({ user_id: user.user_id }, updateData)

        // Auto-link Discord as a provider if available
        if (discordAccountId) {
          const providers = await database.getUserProviders(user.user_id)
          const existingDiscordProvider = providers.find(
            (p) => p.provider_type === "discord",
          )

          if (!existingDiscordProvider) {
            await database.linkProvider(user.user_id, {
              provider_type: "discord",
              provider_id: discordAccountId,
              access_token: null, // No tokens from Citizen ID - user can authenticate with Discord later to get tokens
              refresh_token: null,
              metadata: {
                username: discordUsername,
                linkedViaCitizenID: true, // Flag to indicate this was auto-linked
              },
              is_primary: false,
            })
          }
        }
      } else {
        // Update tokens for existing user
        // Token expiration will be updated on next refresh
        await database.updateProviderTokens(user.user_id, "citizenid", {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: null, // Will be updated on next refresh
        })

        // Update avatar from RSI if available and user doesn't have one
        if (rsiAvatar && !user.avatar) {
          try {
            const avatarResource = await cdn.createExternalResource(
              rsiAvatar,
              `${user.user_id}_rsi_avatar`,
            )
            await database.updateUser(
              { user_id: user.user_id },
              { avatar: avatarResource.resource_id },
            )
            // Refresh user to get updated avatar
            user = await database.getUser({ user_id: user.user_id })
          } catch (error) {
            // If external resource creation fails (e.g., URL not whitelisted), log and continue
            console.warn(
              `[CitizenID] Failed to create external resource for RSI avatar:`,
              error,
            )
          }
        }
      }

      console.log("Citizen ID login successful", {
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
      })
      return done(null, user)
    } catch (error) {
      console.error("[CitizenID verify callback] Error:", {
        error,
        errorMessage: (error as Error)?.message,
        errorStack: (error as Error)?.stack,
      })
      console.error("Citizen ID verify callback error:", error)
      return done(error as Error)
    }
  }
}

/**
 * Create Citizen ID passport strategies
 */
export function createCitizenIDStrategies(): {
  loginStrategy: CitizenIDStrategy
  linkStrategy: CitizenIDStrategy
} {
  const config = getCitizenIDConfig()

  // Base config for Citizen ID strategy
  const createCitizenIDConfig = (callbackURL: string) => ({
    clientID: env.CITIZENID_CLIENT_ID!,
    clientSecret: env.CITIZENID_CLIENT_SECRET!,
    callbackURL: callbackURL,
    authority: config.authority,
    scope: [
      Scopes.OPENID,
      Scopes.PROFILE,
      Scopes.ROLES,
      Scopes.RSI_PROFILE,
      Scopes.DISCORD_PROFILE,
      Scopes.OFFLINE_ACCESS,
    ],
    passReqToCallback: true,
    pkce: true, // Keep PKCE enabled for security
    state: true, // Let PKCE handle state management
  })

  const citizenIDLoginConfig = createCitizenIDConfig(config.loginCallbackURL)
  const citizenIDLinkConfig = createCitizenIDConfig(config.linkCallbackURL)

  // Create separate strategies for login and linking
  const citizenIDLoginStrategy = new CitizenIDStrategy(
    citizenIDLoginConfig,
    createCitizenIDVerifyCallback(false), // isLinking = false
  )

  const citizenIDLinkStrategy = new CitizenIDStrategy(
    citizenIDLinkConfig,
    createCitizenIDVerifyCallback(true), // isLinking = true
  )

  return {
    loginStrategy: citizenIDLoginStrategy,
    linkStrategy: citizenIDLinkStrategy,
  }
}

/**
 * Setup all passport strategies
 */
export function setupPassportStrategies(backendUrl: URL): {
  discordStrategy: Strategy
  citizenIDLoginStrategy: CitizenIDStrategy
  citizenIDLinkStrategy: CitizenIDStrategy
} {
  // Create Discord strategy
  const discordStrategy = createDiscordStrategy(backendUrl)
  database.setStrategy(discordStrategy)
  passport.use(discordStrategy)
  refresh.use(discordStrategy)

  // Create Citizen ID strategies
  const { loginStrategy, linkStrategy } = createCitizenIDStrategies()
  passport.use("citizenid", loginStrategy)
  passport.use("citizenid-link", linkStrategy)

  return {
    discordStrategy,
    citizenIDLoginStrategy: loginStrategy,
    citizenIDLinkStrategy: linkStrategy,
  }
}
