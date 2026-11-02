/**
 * Installing the SC Market Discord app through our own OAuth2 flow, so we
 * learn who installed it and where, and link it without /setup.
 *
 *   GET /auth/discord-install           start (api/routes/discord-install-routes.ts)
 *   GET /auth/discord-install/callback  Discord's redirect_uri
 *
 * User install (integration_type=1, scopes applications.commands identify):
 * the callback exchanges the code server-side and reads the Discord user id
 * (GET /users/@me). If the visitor started signed in, that Discord account
 * is linked to their SC Market account under the usual identity rules
 * (identity-links.ts): a Discord account another SC Market account holds is
 * never moved, and an account that already has a different Discord keeps it.
 * The install is recorded (discord_user_installs) for whichever account holds
 * that Discord. Signed out: nothing is linked; they are asked to sign in.
 *
 * Server install (integration_type=0, scopes bot applications.commands):
 * started from a shop's or org's Discord settings, the state names that
 * owner and the user. The callback re-checks the user may manage the owner's
 * Discord integration, exchanges the code and takes the server id from
 * Discord's token response (never from the query string alone), and links
 * it (discord_linked_guilds, linked-guilds.ts). The settings page then offers
 * the server's channels for threads and alerts.
 *
 * State: base64url(JSON payload).base64url(HMAC-SHA256), keyed from
 * SESSION_SECRET with a label of its own. It carries a random nonce, the
 * install type, the user (or null), the owner (or null), the link surface and
 * an expiry 10 minutes out. The nonce is also set in an httpOnly cookie at
 * start and must match on the callback (a callback URL from another browser
 * is refused), and it is used once (discord_install_state_uses). Without a
 * valid state nothing is linked and no code is exchanged.
 *
 * Tokens and codes are never logged or stored: the access token is used for
 * the identify call (user installs) and dropped. It is not revoked, because
 * revoking the authorization would remove the user install.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import {
  discordHolder,
  recordDiscordLinkSkipped,
} from "../accounts/identity-links.js"
import {
  normalizeSource,
  type DiscordInstallSource,
  type DiscordInstallType,
} from "./install-clicks.js"
import { recordUserInstallFor } from "./user-installs.js"
import {
  GUILD_ID,
  linkGuild,
  mayManageOwnerDiscord,
  ownerPathKey,
  resolveLinkedGuildOwner,
  type LinkedGuildOwner,
  type LinkedGuildOwnerType,
} from "./linked-guilds.js"

export const INSTALL_STATE_TTL_MS = 10 * 60 * 1000
/** The cookie holding the state's nonce between start and callback. */
export const INSTALL_STATE_COOKIE = "scmarket.dinstall"
/** Path of the start route; the callback is `${INSTALL_PATH}/callback`. */
export const INSTALL_PATH = "/auth/discord-install"
/** The bot's permissions on a server install (the same as the old invite link). */
export const BOT_PERMISSIONS = "361314126849"

const DISCORD_API = "https://discord.com/api/v10"
const AUTHORIZE_URL = "https://discord.com/oauth2/authorize"
const NONCE_RE = /^[0-9a-f]{32}$/
const CLIENT_ID_RE = /^\d{15,21}$/
const DISCORD_ID_RE = /^\d{15,21}$/
const EXCHANGE_TIMEOUT_MS = 10_000

export interface InstallState {
  /** Nonce: random, single use, also held in the browser's cookie. */
  n: string
  t: DiscordInstallType
  /** The SC Market user who started it, or null when signed out. */
  u: string | null
  /** The shop or org a server install is for, or null. */
  o: LinkedGuildOwner | null
  s: DiscordInstallSource
  /** Expiry, ms since epoch. */
  e: number
}

/** What the website shows after the flow (frontend /discord/install?result=). */
export type InstallResult =
  | "user_linked"
  | "user_installed"
  | "user_sign_in"
  | "user_linked_elsewhere"
  | "user_other_discord"
  | "server_added"
  | "server_sign_in"
  | "server_forbidden"
  | "cancelled"
  | "failed"

/** Where the browser goes when the flow ends. */
export type InstallOutcome =
  | { result: InstallResult; type: DiscordInstallType | null }
  | { linked: { owner_type: LinkedGuildOwnerType; path_key: string } }

// ---------------------------------------------------------------------------
// State

function stateKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("scmarket:discord-install-state:v1")
    .digest()
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", stateKey(secret))
    .update(payload)
    .digest("base64url")
}

/** A signed state and its nonce (for the cookie). */
export function signInstallState(
  fields: Omit<InstallState, "n" | "e">,
  secret: string,
  now = Date.now(),
): { token: string; nonce: string } {
  if (!secret) throw new Error("No state secret")
  const state: InstallState = {
    ...fields,
    n: randomBytes(16).toString("hex"),
    e: now + INSTALL_STATE_TTL_MS,
  }
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url")
  return { token: `${payload}.${sign(payload, secret)}`, nonce: state.n }
}

function isOwner(v: unknown): v is LinkedGuildOwner {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return (
    (o.owner_type === "shop" || o.owner_type === "org") &&
    typeof o.owner_id === "string" &&
    !!o.owner_id
  )
}

/** The state if its signature is ours, it hasn't expired and it is well formed; else null. */
export function verifyInstallState(
  token: unknown,
  secret: string,
  now = Date.now(),
): InstallState | null {
  if (!secret || typeof token !== "string" || token.length > 2048) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payload, signature] = parts
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null
  let s: Record<string, unknown>
  try {
    s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!s || typeof s !== "object") return null
  if (typeof s.n !== "string" || !NONCE_RE.test(s.n)) return null
  if (s.t !== "user" && s.t !== "server") return null
  if (s.u !== null && typeof s.u !== "string") return null
  if (s.o !== null && !isOwner(s.o)) return null
  if (typeof s.e !== "number" || s.e <= now) return null
  return {
    n: s.n,
    t: s.t,
    u: (s.u as string | null) || null,
    o: s.o
      ? {
          owner_type: (s.o as LinkedGuildOwner).owner_type,
          owner_id: (s.o as LinkedGuildOwner).owner_id,
        }
      : null,
    s: normalizeSource(s.s),
    e: s.e,
  }
}

/** Constant-time comparison of the cookie's nonce with the state's. */
export function nonceMatches(cookie: unknown, nonce: string): boolean {
  if (typeof cookie !== "string") return false
  const a = Buffer.from(cookie)
  const b = Buffer.from(nonce)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Use the state once. Returns false if it was already used (a replay). Also
 * prunes uses whose state has expired (they can't verify any more).
 */
export async function consumeInstallState(
  state: InstallState,
  db: Knex = getKnex(),
): Promise<boolean> {
  await db("discord_install_state_uses")
    .where("expires_at", "<", db.fn.now())
    .delete()
  const rows = await db("discord_install_state_uses")
    .insert({ nonce: state.n, expires_at: new Date(state.e) })
    .onConflict("nonce")
    .ignore()
    .returning("nonce")
  return Array.isArray(rows) && rows.length === 1
}

// ---------------------------------------------------------------------------
// Discord

export interface InstallConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  stateSecret: string
}

/** The flow's config, or null when the Discord app isn't configured (the flow then refuses). */
export function installConfig(
  env: {
    DISCORD_CLIENT_ID?: string
    DISCORD_CLIENT_SECRET?: string
    SESSION_SECRET?: string
  },
  backendUrl: URL,
): InstallConfig | null {
  const clientId = env.DISCORD_CLIENT_ID ?? ""
  const clientSecret = env.DISCORD_CLIENT_SECRET ?? ""
  const stateSecret = env.SESSION_SECRET ?? ""
  if (!CLIENT_ID_RE.test(clientId) || !clientSecret || !stateSecret) return null
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: installRedirectUri(backendUrl),
  }
}

/** The redirect URI registered in the Discord Developer Portal (OAuth2 › Redirects). */
export function installRedirectUri(backendUrl: URL): string {
  return new URL(`${INSTALL_PATH.slice(1)}/callback`, backendUrl).toString()
}

/** Discord's authorize URL for this install. */
export function authorizeUrl(
  type: DiscordInstallType,
  config: InstallConfig,
  state: string,
): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("state", state)
  if (type === "user") {
    url.searchParams.set("integration_type", "1")
    url.searchParams.set("scope", "applications.commands identify")
  } else {
    url.searchParams.set("integration_type", "0")
    url.searchParams.set("scope", "bot applications.commands")
    url.searchParams.set("permissions", BOT_PERMISSIONS)
  }
  return url.toString()
}

/** Discord's own install page, without our redirect: installs, links nothing. */
export function plainInstallUrl(
  type: DiscordInstallType,
  clientId: string,
): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set("client_id", clientId)
  if (type === "user") {
    url.searchParams.set("integration_type", "1")
    url.searchParams.set("scope", "applications.commands")
  } else {
    url.searchParams.set("integration_type", "0")
    url.searchParams.set("scope", "bot applications.commands")
    url.searchParams.set("permissions", BOT_PERMISSIONS)
  }
  return url.toString()
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export class InstallExchangeError extends Error {}

/**
 * Exchange the code (server-side). Returns the access token and, for a bot
 * install, the server Discord says the bot was added to. Errors carry only
 * the HTTP status, never the code or a token.
 */
export async function exchangeCode(
  code: string,
  config: InstallConfig,
  fetchImpl: FetchLike = fetch,
): Promise<{ accessToken: string; scopes: string[]; guildId: string | null }> {
  const res = await fetchImpl(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
  })
  if (!res.ok)
    throw new InstallExchangeError(
      `Discord code exchange failed (HTTP ${res.status})`,
    )
  const body = (await res.json()) as {
    access_token?: unknown
    scope?: unknown
    guild?: { id?: unknown }
  }
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new InstallExchangeError(
      "Discord code exchange returned no access token",
    )
  }
  const guildId =
    typeof body.guild?.id === "string" && GUILD_ID.test(body.guild.id)
      ? body.guild.id
      : null
  const scopes =
    typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : []
  return { accessToken: body.access_token, scopes, guildId }
}

/** The Discord user the access token belongs to (identify scope). */
export async function fetchDiscordUser(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ id: string; username: string | null }> {
  const res = await fetchImpl(`${DISCORD_API}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
  })
  if (!res.ok)
    throw new InstallExchangeError(
      `Discord identify failed (HTTP ${res.status})`,
    )
  const body = (await res.json()) as { id?: unknown; username?: unknown }
  if (typeof body.id !== "string" || !DISCORD_ID_RE.test(body.id)) {
    throw new InstallExchangeError("Discord identify returned no user id")
  }
  return {
    id: body.id,
    username: typeof body.username === "string" ? body.username : null,
  }
}

// ---------------------------------------------------------------------------
// Linking

export type DiscordLinkResult =
  | "linked"
  | "already_linked"
  | "linked_elsewhere"
  | "other_discord"

/**
 * Link the installer's Discord account to their SC Market account, under the
 * identity rules: never moved from another account (recorded as skipped),
 * never replacing a different Discord the account already has. No OAuth
 * tokens are stored.
 */
export async function linkInstallerDiscord(
  userId: string,
  discord: { id: string; username: string | null },
  db: Knex = getKnex(),
): Promise<DiscordLinkResult> {
  return db.transaction(async (trx) => {
    const own = await trx("account_providers")
      .where({ user_id: userId, provider_type: "discord" })
      .first("provider_id")
    if (own)
      return String(own.provider_id) === discord.id
        ? "already_linked"
        : "other_discord"
    const account = await trx("accounts")
      .where({ user_id: userId })
      .first("discord_id")
    if (account?.discord_id && String(account.discord_id) !== discord.id)
      return "other_discord"
    if (await discordHolder(trx, discord.id, userId)) {
      await recordDiscordLinkSkipped(trx, userId, discord.id, "discord_install")
      return "linked_elsewhere"
    }
    await profileDb.updateUser(
      { user_id: userId },
      { discord_id: discord.id },
      trx,
    )
    await profileDb.linkProvider(
      userId,
      {
        provider_type: "discord",
        provider_id: discord.id,
        access_token: null,
        refresh_token: null,
        metadata: { username: discord.username, linkedViaInstall: true },
        is_primary: false,
      },
      trx,
    )
    return "linked"
  })
}

// ---------------------------------------------------------------------------
// Start and callback

export interface StartInput {
  query: Record<string, unknown>
  /** The signed-in SC Market user, if any. */
  userId: string | null
  /** Whether our redirect URI is registered with the Discord app (app-install.ts). */
  redirectRegistered: boolean
}

/**
 * Start an install. Returns where to send the browser and, when it goes to
 * Discord, the nonce to set in the cookie.
 */
export async function startInstall(
  input: StartInput,
  config: InstallConfig | null,
  now = Date.now(),
): Promise<
  | { outcome: InstallOutcome }
  | { discordUrl: string; nonce: string }
  | { plainUrl: string }
> {
  const type = input.query.type
  if (type !== "user" && type !== "server")
    return { outcome: { result: "failed", type: null } }
  if (!config) return { outcome: { result: "failed", type } }
  // Discord refuses an unregistered redirect_uri: until the owner adds it,
  // send the browser to the plain install page, which links nothing.
  if (!input.redirectRegistered)
    return { plainUrl: plainInstallUrl(type, config.clientId) }
  const src = normalizeSource(input.query.src)

  let owner: LinkedGuildOwner | null = null
  if (
    type === "server" &&
    (input.query.shop !== undefined || input.query.org !== undefined)
  ) {
    if (!input.userId) return { outcome: { result: "server_sign_in", type } }
    const resolved = await resolveLinkedGuildOwner({
      shop: input.query.shop,
      org: input.query.org,
    })
    if (!resolved) return { outcome: { result: "failed", type } }
    if (!(await mayManageOwnerDiscord(resolved, input.userId))) {
      return { outcome: { result: "server_forbidden", type } }
    }
    owner = { owner_type: resolved.owner_type, owner_id: resolved.owner_id }
  }

  const { token, nonce } = signInstallState(
    { t: type, u: input.userId, o: owner, s: src },
    config.stateSecret,
    now,
  )
  return { discordUrl: authorizeUrl(type, config, token), nonce }
}

export interface CallbackInput {
  query: Record<string, unknown>
  /** The nonce cookie set at start. */
  cookieNonce: unknown
  /** The signed-in SC Market user now, if any. */
  userId: string | null
}

const fail = (type: DiscordInstallType | null, why: string): InstallOutcome => {
  logger.info("Discord install callback refused", { why, type })
  return { result: "failed", type }
}

/** Finish an install: verify the state, exchange the code, link what may be linked. */
export async function completeInstall(
  input: CallbackInput,
  config: InstallConfig | null,
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
): Promise<InstallOutcome> {
  if (!config) return fail(null, "not configured")
  const state = verifyInstallState(input.query.state, config.stateSecret, now)
  if (!state) return fail(null, "invalid or expired state")
  if (!nonceMatches(input.cookieNonce, state.n))
    return fail(state.t, "state from another browser")
  // Started signed in: still the same user. A different (or no) user now
  // links nothing.
  if (state.u && state.u !== input.userId)
    return fail(state.t, "signed-in user changed")
  if (!(await consumeInstallState(state)))
    return fail(state.t, "state already used")

  if (typeof input.query.error === "string")
    return { result: "cancelled", type: state.t }
  const code = input.query.code
  if (typeof code !== "string" || !code || code.length > 512)
    return fail(state.t, "no code")

  try {
    return state.t === "user"
      ? await completeUserInstall(state, code, config, fetchImpl)
      : await completeServerInstall(state, input.query, code, config, fetchImpl)
  } catch (err) {
    logger.warn("Discord install callback failed", {
      type: state.t,
      error:
        err instanceof InstallExchangeError
          ? err.message
          : err instanceof Error
            ? err.name
            : "error",
    })
    return { result: "failed", type: state.t }
  }
}

async function completeUserInstall(
  state: InstallState,
  code: string,
  config: InstallConfig,
  fetchImpl: FetchLike,
): Promise<InstallOutcome> {
  const { accessToken, scopes } = await exchangeCode(code, config, fetchImpl)
  if (!scopes.includes("identify"))
    throw new InstallExchangeError("identify scope not granted")
  const discord = await fetchDiscordUser(accessToken, fetchImpl)

  if (!state.u) {
    // Signed out: link nothing. The install still counts for the account
    // that already holds this Discord, if any.
    const holder = await getKnex()("account_providers")
      .where({ provider_type: "discord", provider_id: discord.id })
      .first("user_id")
    if (holder?.user_id) await recordUserInstallFor(String(holder.user_id))
    return { result: "user_sign_in", type: "user" }
  }

  const linked = await linkInstallerDiscord(state.u, discord)
  if (linked === "linked" || linked === "already_linked")
    await recordUserInstallFor(state.u)
  const result: Record<DiscordLinkResult, InstallResult> = {
    linked: "user_linked",
    already_linked: "user_installed",
    linked_elsewhere: "user_linked_elsewhere",
    other_discord: "user_other_discord",
  }
  logger.info("Discord user install completed", {
    userId: state.u,
    result: linked,
  })
  return { result: result[linked], type: "user" }
}

async function completeServerInstall(
  state: InstallState,
  query: Record<string, unknown>,
  code: string,
  config: InstallConfig,
  fetchImpl: FetchLike,
): Promise<InstallOutcome> {
  // Not started from a shop's or org's settings: the bot is in, nothing to link.
  if (!state.o) return { result: "server_added", type: "server" }
  if (!state.u) return fail("server", "owner without user")
  if (!(await mayManageOwnerDiscord(state.o, state.u)))
    return { result: "server_forbidden", type: "server" }

  const { guildId } = await exchangeCode(code, config, fetchImpl)
  if (!guildId) throw new InstallExchangeError("no server in the code exchange")
  if (query.guild_id !== undefined && query.guild_id !== guildId)
    return fail("server", "guild_id mismatch")

  await linkGuild(state.o, guildId, state.u)
  logger.info("Discord server linked by install", {
    owner_type: state.o.owner_type,
    owner_id: state.o.owner_id,
    guild_id: guildId,
  })
  const pathKey = await ownerPathKey(state.o)
  if (!pathKey) return { result: "server_added", type: "server" }
  return { linked: { owner_type: state.o.owner_type, path_key: pathKey } }
}

/** The website URL an outcome sends the browser to. */
export function outcomeUrl(outcome: InstallOutcome, frontendUrl: URL): string {
  if ("linked" in outcome) {
    const key = encodeURIComponent(outcome.linked.path_key)
    const path =
      outcome.linked.owner_type === "shop"
        ? `/shop/${key}/settings`
        : `/org/${key}/manage/discord`
    const url = new URL(path, frontendUrl)
    url.searchParams.set("discord", "linked")
    return url.toString()
  }
  const url = new URL("/discord/install", frontendUrl)
  url.searchParams.set("result", outcome.result)
  if (outcome.type) url.searchParams.set("type", outcome.type)
  return url.toString()
}
