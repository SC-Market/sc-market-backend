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
import type { Knex } from "knex"
import { database, getKnex } from "../../clients/database/knex-db.js"
import {
  discordHolder,
  freeUsername,
  recordDiscordLinkSkipped,
} from "../../services/accounts/identity-links.js"
import { notifyIdentityChanged } from "../../services/identity-admin/notify.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import { cdn } from "../../clients/cdn/cdn.js"
import { env } from "../../config/env.js"
import {
  isCitizenIDVerified,
  getValidLocale,
  extractRSIData,
  CitizenIDErrorCodes,
  getCitizenIDConfig,
  AuthErrorCodes,
} from "./auth-helpers.js"
import logger from "../../logger/logger.js"

/**
 * Narrow an unknown thrown value to a Postgres error carrying a SQLSTATE code
 * and the violated constraint name (as surfaced by `pg` through Knex).
 */
function isPostgresConstraintError(
  error: unknown,
): error is { code: string; constraint: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { constraint?: unknown }).constraint === "string"
  )
}

/** Citizen ID sign-up: the RSI handle is another account's username. */
function usernameTakenError(username: string): Error & { code: string } {
  const error = new Error(
    `Username "${username}" is already registered. Please log in with Discord first, then link your Citizen ID account in settings.`,
  ) as Error & { code: string }
  error.code = CitizenIDErrorCodes.USERNAME_TAKEN
  return error
}

/** Citizen ID sign-up: the Spectrum ID belongs to another account. */
function spectrumTakenError(spectrumId: string): Error & { code: string } {
  const error = new Error(
    `This Spectrum ID (${spectrumId}) is already associated with another account. Please log in with that account first, then link your Citizen ID account in settings.`,
  ) as Error & { code: string }
  error.code = CitizenIDErrorCodes.ALREADY_LINKED
  return error
}

/**
 * Auto-link the Discord account Citizen ID reports. An account that already
 * has a Discord keeps it. If ANOTHER account holds this Discord (provider or
 * legacy column), it is never moved: the link is skipped and recorded, and
 * the returned audit id is what the user is notified about.
 */
async function linkDiscordFromCitizenID(
  trx: Knex,
  userId: string,
  discordAccountId: string,
  discordUsername: string | undefined,
  via: "citizenid_signup" | "citizenid_link",
): Promise<string | null> {
  const own = await trx("account_providers")
    .where({ user_id: userId, provider_type: "discord" })
    .first("provider_id")
  if (own) return null
  if (await discordHolder(trx, discordAccountId, userId)) {
    logger.info("[CitizenID] Discord already linked to another account; not linked", { userId, via })
    return recordDiscordLinkSkipped(trx, userId, discordAccountId, via)
  }
  await profileDb.updateUser({ user_id: userId }, { discord_id: discordAccountId }, trx)
  await profileDb.linkProvider(
    userId,
    {
      provider_type: "discord",
      provider_id: discordAccountId,
      access_token: null, // No tokens from Citizen ID - user can authenticate with Discord later to get tokens
      refresh_token: null,
      metadata: {
        username: discordUsername,
        linkedViaCitizenID: true, // Flag to indicate this was auto-linked
      },
      is_primary: false,
    },
    trx,
  )
  return null
}

/** Tell the user their Discord wasn't linked, after the sign-up/link committed. */
async function notifyDiscordLinkSkipped(userId: string, auditLogId: string): Promise<void> {
  await notifyIdentityChanged(userId, null, {
    audit_log_id: auditLogId,
    kind: "discord_link_skipped",
    notice: {},
  })
}

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
export function createDiscordStrategy(backendUrl: URL): Strategy {
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
        // The intent comes from the browser-bound state (auth-routes sets it
        // from the verified state on the callback). Read and clear it first.
        const intent = req.session?.discord_auth_action || "signin"
        if (req.session) {
          delete req.session.discord_auth_action
        }

        // Linking needs BOTH an explicit "link" intent and a logged-in user.
        // Being logged in alone is not enough: that let a replayed callback
        // attach someone else's Discord to the victim's account.
        if (intent === "link") {
          const currentUser = req.user as User | undefined
          if (!currentUser) {
            const error = new Error(
              "You must be logged in to link your Discord account",
            ) as Error & { code?: string }
            error.code = AuthErrorCodes.ACCOUNT_NOT_FOUND
            return cb(error)
          }

          // Link Discord to existing account
          // Discord tokens typically expire in 7 days (604800 seconds)
          const discordExpiresAt = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          )
          await profileDb.linkProvider(currentUser.user_id, {
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
          const updatedUser = await profileDb.getUser({
            user_id: currentUser.user_id,
          })
          return cb(null, updatedUser)
        }

        const action: "signup" | "signin" = intent === "signup" ? "signup" : "signin"

        // New login/signup - find or create user based on action
        let user = await profileDb.getUserByProvider("discord", profile.id)

        if (!user) {
          // User doesn't exist
          if (action === "signin") {
            // Sign in requested but account doesn't exist - error
            const error = new Error(
              "No account found with this Discord account. Please sign up first.",
            ) as Error & { code?: string }
            error.code = AuthErrorCodes.ACCOUNT_NOT_FOUND
            return cb(error)
          }

          // Sign up - create new user
          // Discord tokens typically expire in 7 days (604800 seconds)
          const discordExpiresAt = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          )
          // One transaction: the account, its Discord link, settings and
          // the legacy discord_id column, or nothing.
          user = await getKnex().transaction(async (trx) => {
            // new_user{discord_id}, or a free placeholder when an older
            // account (e.g. one that unlinked this Discord) already has it.
            const generatedUsername = await freeUsername(trx, `new_user${profile.id}`)
            const created = await profileDb.createUserWithProvider(
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
              trx,
            )
            // Also set the legacy discord_id column, unless another account
            // still holds it (a stale value: it is never moved).
            if (!(await discordHolder(trx, profile.id, created.user_id))) {
              await profileDb.updateUser({ user_id: created.user_id }, { discord_id: profile.id }, trx)
            }
            return profileDb.getUser({ user_id: created.user_id }, undefined, trx)
          })
        } else {
          // User exists - update tokens and sign in (works for both signup and signin)
          // Sign up with existing account just signs them in
          // Discord tokens typically expire in 7 days
          const discordExpiresAt = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          )
          await profileDb.updateProviderTokens(user.user_id, "discord", {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expires_at: discordExpiresAt,
          })

          // Ensure discord_id is set for backward compatibility
          const discordProvider = await profileDb.getUserProvider(
            user.user_id,
            "discord",
          )
          if (!discordProvider) {
            await profileDb.updateUser(
              { user_id: user.user_id },
              { discord_id: profile.id },
            )
            user = await profileDb.getUser({ user_id: user.user_id })
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
      const {
        rsiUsername,
        rsiSpectrumId,
        rsiAvatar,
        discordAccountId,
        discordUsername,
      } = extractRSIData(profile)

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
        const validation = await profileDb.validateCitizenIDLinking(
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
        const existingUser = await profileDb.getUserByProvider(
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
        const userWithSpectrumId = await profileDb.findUser({
          spectrum_user_id: rsiSpectrumId,
        })
        if (
          userWithSpectrumId &&
          userWithSpectrumId.user_id !== currentUser.user_id
        ) {
          const error = new Error(
            `This Spectrum ID (${rsiSpectrumId}) is already associated with another account. Please use a different Citizen ID account or contact support if you believe this is an error.`,
          ) as Error & { code?: string }
          error.code = CitizenIDErrorCodes.ALREADY_LINKED
          return done(error, undefined)
        }

        // Link Citizen ID to the existing account, with its RSI fields and
        // Discord auto-link, in one transaction.
        // Token expiration will be set when we refresh (we don't have expires_in in callback)
        const discordSkippedAudit = await getKnex().transaction(async (trx) => {
          await profileDb.linkProvider(
            currentUser.user_id,
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
                discordAccountId: discordAccountId,
                displayName: displayName,
                roles: profile.roles,
              },
              is_primary: false,
            },
            trx,
          )
          await profileDb.updateUser(
            { user_id: currentUser.user_id },
            { rsi_confirmed: true, spectrum_user_id: rsiSpectrumId },
            trx,
          )
          return discordAccountId
            ? linkDiscordFromCitizenID(
                trx,
                currentUser.user_id,
                discordAccountId,
                discordUsername,
                "citizenid_link",
              )
            : null
        })
        if (discordSkippedAudit) {
          await notifyDiscordLinkSkipped(currentUser.user_id, discordSkippedAudit)
        }

        const updatedUser = await profileDb.getUser({
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

      // STEP 4: New login/signup - find or create user based on action
      // Get action from session (set by route handler)
      const action: "signup" | "signin" =
        req.session?.citizenid_auth_action || "signin"

      // Clear action from session after reading
      if (req.session) {
        delete req.session.citizenid_auth_action
      }

      let user = await profileDb.getUserByProvider("citizenid", profile.id)

      if (!user) {
        // User doesn't exist with this Citizen ID
        if (action === "signin") {
          // Sign in requested but account doesn't exist
          const error = new Error(
            "No account found with this Citizen ID. If you don't have an account yet, please use the Sign Up button above to Sign up for SC Market",
          ) as Error & { code?: string }
          error.code = AuthErrorCodes.ACCOUNT_NOT_FOUND
          return done(error, undefined)
        }

        // Sign up - check for conflicts before creating
        // Check if username already exists (might be registered with Discord).
        // Any holder blocks the insert (accounts_username_key), verified or
        // not, so any holder is USERNAME_TAKEN: log in with that account and
        // link Citizen ID there, or ask an admin to release the name.
        const existingUser = await profileDb.findUser({
          username: citizenIDUsername,
        })

        if (existingUser) {
          return done(usernameTakenError(citizenIDUsername), undefined)
        }

        // Check if Spectrum ID is already in use by another account
        // This prevents duplicate key violations when creating a new user
        const userWithSpectrumId = await profileDb.findUser({
          spectrum_user_id: rsiSpectrumId,
        })
        if (userWithSpectrumId) {
          return done(spectrumTakenError(rsiSpectrumId), undefined)
        }

        // Create new user (Citizen ID is verified, so we can create), in ONE
        // transaction with its RSI fields and Discord link: a failure leaves
        // no half-made account. Token expiration will be set when we refresh
        // (we don't have expires_in in callback).
        let discordSkippedAudit: string | null = null
        try {
          const created = await getKnex().transaction(async (trx) => {
            const newUser = await profileDb.createUserWithProvider(
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
              trx,
            )
            await profileDb.updateUser(
              { user_id: newUser.user_id },
              { rsi_confirmed: true, spectrum_user_id: rsiSpectrumId },
              trx,
            )
            if (discordAccountId) {
              discordSkippedAudit = await linkDiscordFromCitizenID(
                trx,
                newUser.user_id,
                discordAccountId,
                discordUsername,
                "citizenid_signup",
              )
            }
            return newUser
          })
          user = await profileDb.getUser({ user_id: created.user_id })
        } catch (createError: unknown) {
          // Another sign-up took the username or Spectrum ID between the
          // checks above and the insert: the same handled errors, never the
          // raw Postgres error.
          if (
            isPostgresConstraintError(createError) &&
            createError.code === "23505"
          ) {
            if (createError.constraint === "accounts_username_key") {
              return done(usernameTakenError(citizenIDUsername), undefined)
            }
            if (createError.constraint === "accounts_spectrum_user_id_unique") {
              return done(spectrumTakenError(rsiSpectrumId), undefined)
            }
          }
          throw createError
        }

        // Set avatar from RSI if available (outside the transaction: an
        // external fetch, and optional).
        if (rsiAvatar) {
          try {
            const avatarResource = await cdn.createExternalResource(
              rsiAvatar,
              `${user.user_id}_rsi_avatar`,
            )
            await profileDb.updateUser(
              { user_id: user.user_id },
              { avatar: avatarResource.resource_id },
            )
            // Refresh user to get updated avatar
            user = await profileDb.getUser({ user_id: user.user_id })
          } catch (error) {
            // If external resource creation fails (e.g., URL not whitelisted), log and continue
            logger.warn(
              `[CitizenID] Failed to create external resource for RSI avatar`,
              { error },
            )
          }
        }

        if (discordSkippedAudit) {
          await notifyDiscordLinkSkipped(user.user_id, discordSkippedAudit)
        }
      } else {
        // User exists - update tokens and sign in (works for both signup and signin)
        // Sign up with existing account just signs them in
        // Token expiration will be updated on next refresh
        await profileDb.updateProviderTokens(user.user_id, "citizenid", {
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
            await profileDb.updateUser(
              { user_id: user.user_id },
              { avatar: avatarResource.resource_id },
            )
            // Refresh user to get updated avatar
            user = await profileDb.getUser({ user_id: user.user_id })
          } catch (error) {
            // If external resource creation fails (e.g., URL not whitelisted), log and continue
            logger.warn(
              `[CitizenID] Failed to create external resource for RSI avatar`,
              { error },
            )
          }
        }
      }

      logger.info("[Auth] Citizen ID login successful", {
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
      })
      return done(null, user)
    } catch (error) {
      logger.error("[CitizenID verify callback] Error", {
        error,
        errorMessage: (error as Error)?.message,
        errorStack: (error as Error)?.stack,
      })
      logger.error("[Auth] Citizen ID verify callback error", { error })
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
