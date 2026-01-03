import { Request } from "express"
import { env } from "../../config/env.js"
import {
  Endpoints,
  getEndpoints,
  Roles,
  RSIClaimKeys,
  DiscordClaimKeys,
  CitizenIDProfile,
} from "passport-citizenid"
import { SUPPORTED_LOCALES } from "../routes/v1/util/i18n.js"

/**
 * Citizen ID authentication error codes
 * These are explicit error codes that the frontend can handle
 */
export const CitizenIDErrorCodes = {
  // OAuth provider errors
  ACCOUNT_NOT_VERIFIED: "citizenid_account_not_verified",
  OAUTH_ERROR: "citizenid_oauth_error",

  // Linking validation errors
  USERNAME_MISMATCH: "citizenid_username_mismatch",
  ALREADY_LINKED: "citizenid_already_linked",
  USERNAME_TAKEN: "citizenid_username_taken", // Username already exists, need to login with Discord first

  // General errors
  AUTH_FAILED: "citizenid_auth_failed",
  LOGIN_FAILED: "citizenid_login_failed",
} as const

/**
 * General authentication error codes
 * Used for both Discord and Citizen ID
 */
export const AuthErrorCodes = {
  ACCOUNT_NOT_FOUND: "account_not_found", // User tried to sign in but account doesn't exist
  ACCOUNT_ALREADY_EXISTS: "account_already_exists", // User tried to sign up but account already exists
} as const

/**
 * Map internal error codes to frontend error codes
 */
export function mapErrorCodeToFrontend(code: string | undefined): string {
  if (!code) return CitizenIDErrorCodes.AUTH_FAILED

  // Direct mapping for explicit codes
  if (code === CitizenIDErrorCodes.ACCOUNT_NOT_VERIFIED)
    return CitizenIDErrorCodes.ACCOUNT_NOT_VERIFIED
  if (code === CitizenIDErrorCodes.USERNAME_MISMATCH)
    return CitizenIDErrorCodes.USERNAME_MISMATCH
  if (code === CitizenIDErrorCodes.ALREADY_LINKED)
    return CitizenIDErrorCodes.ALREADY_LINKED
  if (code === CitizenIDErrorCodes.USERNAME_TAKEN)
    return CitizenIDErrorCodes.USERNAME_TAKEN
  if (code === CitizenIDErrorCodes.AUTH_FAILED)
    return CitizenIDErrorCodes.AUTH_FAILED
  if (code === CitizenIDErrorCodes.LOGIN_FAILED)
    return CitizenIDErrorCodes.LOGIN_FAILED

  // General auth error codes
  if (code === AuthErrorCodes.ACCOUNT_NOT_FOUND)
    return AuthErrorCodes.ACCOUNT_NOT_FOUND
  if (code === AuthErrorCodes.ACCOUNT_ALREADY_EXISTS)
    return AuthErrorCodes.ACCOUNT_ALREADY_EXISTS

  // Legacy code mappings
  if (code === "account_not_verified")
    return CitizenIDErrorCodes.ACCOUNT_NOT_VERIFIED
  if (code === "linking_validation_failed")
    return CitizenIDErrorCodes.USERNAME_MISMATCH
  if (code === "already_linked") return CitizenIDErrorCodes.ALREADY_LINKED
  if (code === "auth_failed") return CitizenIDErrorCodes.AUTH_FAILED
  if (code === "login_failed") return CitizenIDErrorCodes.LOGIN_FAILED
  if (code === "account_not_found") return AuthErrorCodes.ACCOUNT_NOT_FOUND
  if (code === "account_already_exists")
    return AuthErrorCodes.ACCOUNT_ALREADY_EXISTS

  // OAuth provider error mappings
  if (
    code === "access_denied" ||
    code === "Forbidden" ||
    code === "forbidden"
  ) {
    return CitizenIDErrorCodes.ACCOUNT_NOT_VERIFIED
  }

  // Default to generic auth failed
  return CitizenIDErrorCodes.AUTH_FAILED
}

/**
 * Check if Citizen ID account is verified
 * Citizen ID has its own verification system (RSI verification status)
 */
export function isCitizenIDVerified(profile: CitizenIDProfile): boolean {
  // Check if profile has RSI verification status
  // Citizen ID provides verification status in roles or metadata
  // Check for STATUS_VERIFIED role or similar indicator
  return profile.roles?.includes(Roles.STATUS_VERIFIED) ?? false
}

/**
 * Helper function to validate locale and fallback to 'en' if not supported
 */
export function getValidLocale(requestedLocale: string): string {
  return SUPPORTED_LOCALES.includes(requestedLocale as any)
    ? requestedLocale
    : "en"
}

/**
 * Extract RSI data from Citizen ID profile
 */
export function extractRSIData(profile: CitizenIDProfile): {
  rsiUsername: string | undefined
  rsiSpectrumId: string | undefined
  rsiAvatar: string | undefined
  discordAccountId: string | undefined
  discordUsername: string | undefined
} {
  // Extract RSI data from typed profile claims (when rsi.profile scope is requested)
  // RSI profile data is available in both ID token and access token
  // RSI username and spectrum ID are REQUIRED - if not available, user cannot sign in
  // Access via claim key since RSIProfileClaims uses index signatures with claim keys
  const rsiUsername = profile.rsi?.[RSIClaimKeys.USERNAME] as string | undefined
  const rsiSpectrumId = profile.rsi?.[RSIClaimKeys.SPECTRUM_ID] as
    | string
    | undefined

  // Extract RSI avatar/profile picture if available
  // Use AVATAR_URL claim key from RSIClaimKeys
  const rsiAvatar = profile.rsi?.[RSIClaimKeys.AVATAR_URL] as string | undefined

  // Extract Discord information if available (optional - for auto-linking)
  const discordAccountId = profile.discord?.[DiscordClaimKeys.ACCOUNT_ID] as
    | string
    | undefined
  const discordUsername = profile.discord?.[DiscordClaimKeys.USERNAME] as
    | string
    | undefined

  return {
    rsiUsername,
    rsiSpectrumId,
    rsiAvatar,
    discordAccountId,
    discordUsername,
  }
}

/**
 * Get Citizen ID configuration
 */
export function getCitizenIDConfig() {
  const backend_url = new URL(env.BACKEND_URL || "http://localhost:7000")

  // Use the actual authority URL (not the redirect)
  // If env provides a custom authority, compute endpoints from it
  const citizenIDAuthority =
    env.CITIZENID_AUTHORITY || Endpoints.PRODUCTION.AUTHORITY
  const citizenIDEndpoints = getEndpoints(citizenIDAuthority)
  const citizenIDAuthorizationURL =
    env.CITIZENID_AUTHORIZATION_URL || citizenIDEndpoints.AUTHORIZATION
  const citizenIDTokenURL = env.CITIZENID_TOKEN_URL || citizenIDEndpoints.TOKEN
  const citizenIDUserInfoURL =
    env.CITIZENID_USERINFO_URL || citizenIDEndpoints.USERINFO

  // Construct callback URLs - separate for login vs linking
  const citizenIDLoginCallbackURL = backend_url.pathname.endsWith("/")
    ? new URL(`auth/citizenid/callback`, backend_url).toString()
    : new URL(`/auth/citizenid/callback`, backend_url).toString()

  const citizenIDLinkCallbackURL = backend_url.pathname.endsWith("/")
    ? new URL(`auth/citizenid/link/callback`, backend_url).toString()
    : new URL(`/auth/citizenid/link/callback`, backend_url).toString()

  return {
    authority: citizenIDAuthority,
    authorizationURL: citizenIDAuthorizationURL,
    tokenURL: citizenIDTokenURL,
    userInfoURL: citizenIDUserInfoURL,
    loginCallbackURL: citizenIDLoginCallbackURL,
    linkCallbackURL: citizenIDLinkCallbackURL,
  }
}
