/**
 * The Discord install flow (services/discord/install-oauth.ts): signed,
 * expiring, single-use, browser-bound state; server-side code exchange;
 * linking under the identity rules. The database is knex-mock-client
 * (test-utils/mock-knex-db.ts); Discord is a fake fetch; permissions are
 * mocked. Nothing reaches Discord.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import {
  MockClient,
  createTracker,
  type Tracker,
  type RawQuery,
} from "knex-mock-client"

const h = vi.hoisted(() => ({
  db: null as unknown,
  hasPermission: vi.fn(),
  canManageShop: vi.fn(),
  getShopById: vi.fn(),
}))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../../api/routes/v1/util/permissions.js", () => ({
  has_permission: h.hasPermission,
}))
vi.mock("../shops/shop-permissions.service.js", () => ({
  canManageShop: h.canManageShop,
  getShopById: h.getShopById,
}))
// The real linking queries (setupTests.ts mocks this module globally).
vi.mock(
  "../../api/routes/v1/profiles/database.js",
  async (importOriginal) => await importOriginal(),
)
vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

const logger = (await import("../../logger/logger.js")).default
const oauth = await import("./install-oauth.js")

const SECRET = "test-session-secret"
const USER = "11111111-2222-4333-8444-555555555555"
const OTHER = "99999999-2222-4333-8444-555555555555"
const SHOP = "aaaaaaaa-2222-4333-8444-555555555555"
const DISCORD = "123456789012345678"
const GUILD = "223456789012345678"
const CODE = "the-oauth-code-123"
const TOKEN = "the-access-token-456"
const NOW = 1_800_000_000_000

const CONFIG = {
  clientId: "868709691469987860",
  clientSecret: "client-secret",
  stateSecret: SECRET,
  redirectUri: "https://api.sc-market.space/auth/discord-install/callback",
}

let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
  h.hasPermission.mockReset()
  h.canManageShop.mockReset()
  h.getShopById.mockReset()
  vi.restoreAllMocks()
  // A first use of a nonce.
  tracker.on.delete("discord_install_state_uses").response(0)
  tracker.on.insert("discord_install_state_uses").response([{ nonce: "n" }])
})

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** A fake Discord: the token endpoint and /users/@me. */
function discordFetch(
  token: Record<string, unknown>,
  user: Record<string, unknown> = { id: DISCORD, username: "spacetrader" },
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/oauth2/token")) {
      const body = new URLSearchParams(String(init?.body))
      expect(body.get("code")).toBe(CODE)
      expect(body.get("redirect_uri")).toBe(CONFIG.redirectUri)
      expect(body.get("client_secret")).toBe(CONFIG.clientSecret)
      return json(200, { access_token: TOKEN, token_type: "Bearer", ...token })
    }
    if (url.endsWith("/users/@me")) {
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`,
      )
      return json(200, user)
    }
    throw new Error(`unexpected ${url}`)
  })
}

function state(
  fields: Partial<Parameters<typeof oauth.signInstallState>[0]> = {},
  now = NOW,
) {
  return oauth.signInstallState(
    { t: "user", u: USER, o: null, s: "settings_notifications", ...fields },
    SECRET,
    now,
  )
}

function callback(
  st: { token: string; nonce: string },
  extra: Record<string, unknown> = {},
  userId: string | null = USER,
) {
  return {
    query: { code: CODE, state: st.token, ...extra },
    cookieNonce: st.nonce,
    userId,
  }
}

const isWhereNot = (q: RawQuery) => /not "user_id" = \$\d/.test(q.sql)

describe("install state", () => {
  it("round-trips and carries no more than it should", () => {
    const st = state()
    const v = oauth.verifyInstallState(st.token, SECRET, NOW)
    expect(v).toMatchObject({
      n: st.nonce,
      t: "user",
      u: USER,
      o: null,
      s: "settings_notifications",
    })
    expect(v!.e).toBe(NOW + oauth.INSTALL_STATE_TTL_MS)
  })

  it("rejects a tampered payload, a tampered signature and another secret", () => {
    const st = state({ u: USER })
    const [payload, sig] = st.token.split(".")
    const forged = JSON.parse(Buffer.from(payload, "base64url").toString())
    forged.u = OTHER
    const forgedPayload = Buffer.from(JSON.stringify(forged)).toString(
      "base64url",
    )
    expect(
      oauth.verifyInstallState(`${forgedPayload}.${sig}`, SECRET, NOW),
    ).toBeNull()
    expect(
      oauth.verifyInstallState(`${payload}.${sig.slice(0, -2)}AA`, SECRET, NOW),
    ).toBeNull()
    expect(oauth.verifyInstallState(st.token, "another-secret", NOW)).toBeNull()
    expect(oauth.verifyInstallState(`${payload}`, SECRET, NOW)).toBeNull()
    expect(oauth.verifyInstallState(undefined, SECRET, NOW)).toBeNull()
  })

  it("expires after 10 minutes", () => {
    const st = state()
    expect(
      oauth.verifyInstallState(st.token, SECRET, NOW + 10 * 60 * 1000 - 1),
    ).not.toBeNull()
    expect(
      oauth.verifyInstallState(st.token, SECRET, NOW + 10 * 60 * 1000),
    ).toBeNull()
  })
})

describe("completeInstall: refusals link nothing and exchange no code", () => {
  const noLinkWrites = () =>
    tracker.history.insert.filter(
      (q) => !q.sql.includes("discord_install_state_uses"),
    ).length + tracker.history.update.length

  it("tampered state", async () => {
    const st = state()
    const fetchImpl = discordFetch({})
    const out = await oauth.completeInstall(
      {
        ...callback(st),
        query: { code: CODE, state: st.token.replace(/.$/, "x") },
      },
      CONFIG,
      fetchImpl,
      NOW,
    )
    expect(out).toEqual({ result: "failed", type: null })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(tracker.history.all).toHaveLength(0)
  })

  it("expired state", async () => {
    const st = state({}, NOW - oauth.INSTALL_STATE_TTL_MS - 1)
    const fetchImpl = discordFetch({})
    expect(
      await oauth.completeInstall(callback(st), CONFIG, fetchImpl, NOW),
    ).toEqual({ result: "failed", type: null })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(tracker.history.all).toHaveLength(0)
  })

  it("a state from another browser (cookie missing or different)", async () => {
    const st = state()
    const fetchImpl = discordFetch({})
    for (const cookieNonce of [undefined, "0".repeat(32), state().nonce]) {
      const out = await oauth.completeInstall(
        { ...callback(st), cookieNonce },
        CONFIG,
        fetchImpl,
        NOW,
      )
      expect(out).toEqual({ result: "failed", type: "user" })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(tracker.history.all).toHaveLength(0)
  })

  it("replay: a used nonce", async () => {
    tracker.reset()
    tracker.on.delete("discord_install_state_uses").response(0)
    tracker.on.insert("discord_install_state_uses").response([]) // on conflict do nothing
    const st = state()
    const fetchImpl = discordFetch({})
    expect(
      await oauth.completeInstall(callback(st), CONFIG, fetchImpl, NOW),
    ).toEqual({ result: "failed", type: "user" })
    expect(fetchImpl).not.toHaveBeenCalled()
    const [use] = tracker.history.insert
    expect(use.sql).toMatch(/on conflict \("nonce"\) do nothing/i)
    expect(use.bindings).toContain(st.nonce)
    expect(noLinkWrites()).toBe(0)
  })

  it("the signed-in user changed since the start", async () => {
    const st = state({ u: USER })
    const fetchImpl = discordFetch({})
    for (const now of [OTHER, null]) {
      expect(
        await oauth.completeInstall(
          callback(st, {}, now),
          CONFIG,
          fetchImpl,
          NOW,
        ),
      ).toEqual({
        result: "failed",
        type: "user",
      })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(noLinkWrites()).toBe(0)
  })

  it("not configured", async () => {
    expect(
      await oauth.completeInstall(
        callback(state()),
        null,
        discordFetch({}),
        NOW,
      ),
    ).toEqual({ result: "failed", type: null })
  })

  it("the user declined on Discord", async () => {
    const fetchImpl = discordFetch({})
    const out = await oauth.completeInstall(
      callback(state(), { error: "access_denied", code: undefined }),
      CONFIG,
      fetchImpl,
      NOW,
    )
    expect(out).toEqual({ result: "cancelled", type: "user" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe("user install", () => {
  it("links the Discord account to the signed-in user and records the install; no token stored", async () => {
    tracker.on
      .select((q) => q.sql.includes("account_providers") && !isWhereNot(q))
      .response(undefined) // no own link
    tracker.on
      .select((q) => q.sql.includes("account_providers") && isWhereNot(q))
      .response(undefined) // no holder
    tracker.on
      .select((q) => q.sql.includes('from "accounts"'))
      .response(undefined)
    tracker.on.update("accounts").response([{ user_id: USER }])
    tracker.on.insert("account_providers").response([{ user_id: USER }])
    tracker.on.insert("discord_user_installs").response([])
    const out = await oauth.completeInstall(
      callback(state()),
      CONFIG,
      discordFetch({ scope: "applications.commands identify" }),
      NOW,
    )
    expect(out).toEqual({ result: "user_linked", type: "user" })
    const [provider] = tracker.history.insert.filter((q) =>
      q.sql.includes("account_providers"),
    )
    expect(provider.bindings).toEqual(
      expect.arrayContaining([USER, "discord", DISCORD]),
    )
    expect(provider.bindings).not.toContain(TOKEN)
    expect(
      tracker.history.insert.some(
        (q) =>
          q.sql.includes("discord_user_installs") && q.bindings.includes(USER),
      ),
    ).toBe(true)
  })

  it("an already-linked identity: another account holds this Discord, it is not moved", async () => {
    tracker.on
      .select((q) => q.sql.includes("account_providers") && !isWhereNot(q))
      .response(undefined)
    tracker.on
      .select((q) => q.sql.includes("account_providers") && isWhereNot(q))
      .response({ user_id: OTHER })
    tracker.on
      .select((q) => q.sql.includes('from "accounts"'))
      .response(undefined)
    tracker.on.insert("audit_logs").response([{ audit_log_id: "a1" }])
    const out = await oauth.completeInstall(
      callback(state()),
      CONFIG,
      discordFetch({ scope: "identify applications.commands" }),
      NOW,
    )
    expect(out).toEqual({ result: "user_linked_elsewhere", type: "user" })
    expect(
      tracker.history.insert.filter((q) => q.sql.includes("account_providers")),
    ).toHaveLength(0)
    expect(tracker.history.update).toHaveLength(0)
    // Not recorded for the signed-in user: the install is on someone else's Discord.
    expect(
      tracker.history.insert.filter((q) =>
        q.sql.includes("discord_user_installs"),
      ),
    ).toHaveLength(0)
    const [audit] = tracker.history.insert.filter((q) =>
      q.sql.includes("audit_logs"),
    )
    expect(JSON.stringify(audit.bindings)).toContain("discord_install")
  })

  it("an account with a different Discord keeps it", async () => {
    tracker.on
      .select((q) => q.sql.includes("account_providers") && !isWhereNot(q))
      .response({ provider_id: "323456789012345678" })
    const out = await oauth.completeInstall(
      callback(state()),
      CONFIG,
      discordFetch({ scope: "identify applications.commands" }),
      NOW,
    )
    expect(out).toEqual({ result: "user_other_discord", type: "user" })
    expect(tracker.history.update).toHaveLength(0)
    expect(
      tracker.history.insert.filter(
        (q) => !q.sql.includes("discord_install_state_uses"),
      ),
    ).toHaveLength(0)
  })

  it("signed out: asks to sign in, links nothing, still records the install for the holder", async () => {
    tracker.on.select("account_providers").response({ user_id: OTHER })
    tracker.on.insert("discord_user_installs").response([])
    const out = await oauth.completeInstall(
      callback(state({ u: null }), {}, null),
      CONFIG,
      discordFetch({ scope: "identify applications.commands" }),
      NOW,
    )
    expect(out).toEqual({ result: "user_sign_in", type: "user" })
    expect(
      tracker.history.insert.filter((q) => q.sql.includes("account_providers")),
    ).toHaveLength(0)
    expect(tracker.history.update).toHaveLength(0)
    const [install] = tracker.history.insert.filter((q) =>
      q.sql.includes("discord_user_installs"),
    )
    expect(install.bindings).toContain(OTHER)
  })

  it("never logs the code or the token", async () => {
    const spies = (["info", "warn", "error", "debug"] as const).map((l) =>
      vi.spyOn(logger, l),
    )
    const failing = vi.fn(async () =>
      json(400, { error: "invalid_grant", code: CODE }),
    )
    expect(
      await oauth.completeInstall(callback(state()), CONFIG, failing, NOW),
    ).toEqual({ result: "failed", type: "user" })
    tracker.on.select("account_providers").response({ provider_id: DISCORD })
    tracker.on.insert("discord_user_installs").response([])
    await oauth.completeInstall(
      callback(state()),
      CONFIG,
      discordFetch({ scope: "identify" }),
      NOW,
    )
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls))
    expect(logged).not.toContain(CODE)
    expect(logged).not.toContain(TOKEN)
  })
})

describe("server install", () => {
  const owner = { owner_type: "shop" as const, owner_id: SHOP }

  it("links the server Discord's token response names, then opens the shop's settings", async () => {
    h.getShopById.mockResolvedValue({
      shop_id: SHOP,
      slug: "my-shop",
      owner_user_id: USER,
      owner_contractor_id: null,
    })
    h.canManageShop.mockResolvedValue(true)
    tracker.on.insert("discord_linked_guilds").response([])
    tracker.on.select("shops").response({ key: "my-shop" })
    const st = state({ t: "server", o: owner })
    const out = await oauth.completeInstall(
      callback(st, { guild_id: GUILD }),
      CONFIG,
      discordFetch({ guild: { id: GUILD } }),
      NOW,
    )
    expect(out).toEqual({ linked: { owner_type: "shop", path_key: "my-shop" } })
    const [link] = tracker.history.insert.filter((q) =>
      q.sql.includes("discord_linked_guilds"),
    )
    expect(link.bindings).toEqual(
      expect.arrayContaining(["shop", SHOP, GUILD, USER]),
    )
    expect(oauth.outcomeUrl(out, new URL("https://sc-market.space"))).toBe(
      "https://sc-market.space/shop/my-shop/settings?discord=linked",
    )
  })

  it("missing permission: nothing linked, no code exchanged", async () => {
    h.getShopById.mockResolvedValue({
      shop_id: SHOP,
      slug: "my-shop",
      owner_user_id: OTHER,
      owner_contractor_id: null,
    })
    h.canManageShop.mockResolvedValue(false)
    const fetchImpl = discordFetch({ guild: { id: GUILD } })
    const out = await oauth.completeInstall(
      callback(state({ t: "server", o: owner }), { guild_id: GUILD }),
      CONFIG,
      fetchImpl,
      NOW,
    )
    expect(out).toEqual({ result: "server_forbidden", type: "server" })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(
      tracker.history.insert.filter((q) =>
        q.sql.includes("discord_linked_guilds"),
      ),
    ).toHaveLength(0)
  })

  it("an org needs its Manage Webhooks permission", async () => {
    h.hasPermission.mockResolvedValue(false)
    const org = { owner_type: "org" as const, owner_id: OTHER }
    const out = await oauth.completeInstall(
      callback(state({ t: "server", o: org })),
      CONFIG,
      discordFetch({}),
      NOW,
    )
    expect(out).toEqual({ result: "server_forbidden", type: "server" })
    expect(h.hasPermission).toHaveBeenCalledWith(OTHER, USER, "manage_webhooks")
  })

  it("never trusts a guild_id the token response doesn't confirm", async () => {
    h.getShopById.mockResolvedValue({
      shop_id: SHOP,
      slug: "my-shop",
      owner_user_id: USER,
      owner_contractor_id: null,
    })
    h.canManageShop.mockResolvedValue(true)
    const mismatch = await oauth.completeInstall(
      callback(state({ t: "server", o: owner }), {
        guild_id: "999999999999999999",
      }),
      CONFIG,
      discordFetch({ guild: { id: GUILD } }),
      NOW,
    )
    expect(mismatch).toEqual({ result: "failed", type: "server" })
    const missing = await oauth.completeInstall(
      callback(state({ t: "server", o: owner }), { guild_id: GUILD }),
      CONFIG,
      discordFetch({}),
      NOW,
    )
    expect(missing).toEqual({ result: "failed", type: "server" })
    expect(
      tracker.history.insert.filter((q) =>
        q.sql.includes("discord_linked_guilds"),
      ),
    ).toHaveLength(0)
  })

  it("without a shop or org in the state: the bot is in, nothing is linked or exchanged", async () => {
    const fetchImpl = discordFetch({ guild: { id: GUILD } })
    const out = await oauth.completeInstall(
      callback(state({ t: "server", o: null }), { guild_id: GUILD }),
      CONFIG,
      fetchImpl,
      NOW,
    )
    expect(out).toEqual({ result: "server_added", type: "server" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe("startInstall", () => {
  it("sends a user install to Discord with identify and our redirect URI", async () => {
    const started = await oauth.startInstall(
      {
        query: { type: "user", src: "guide" },
        userId: USER,
        redirectRegistered: true,
      },
      CONFIG,
      NOW,
    )
    expect("discordUrl" in started).toBe(true)
    if (!("discordUrl" in started)) return
    const url = new URL(started.discordUrl)
    expect(url.origin + url.pathname).toBe(
      "https://discord.com/oauth2/authorize",
    )
    expect(url.searchParams.get("integration_type")).toBe("1")
    expect(url.searchParams.get("scope")).toBe("applications.commands identify")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri)
    expect(
      oauth.verifyInstallState(url.searchParams.get("state"), SECRET, NOW),
    ).toMatchObject({ n: started.nonce, u: USER, s: "guide" })
  })

  it("a server install for a shop needs a signed-in user who may manage it", async () => {
    expect(
      await oauth.startInstall(
        {
          query: { type: "server", shop: SHOP },
          userId: null,
          redirectRegistered: true,
        },
        CONFIG,
        NOW,
      ),
    ).toEqual({
      outcome: { result: "server_sign_in", type: "server" },
    })
    h.getShopById.mockResolvedValue({
      shop_id: SHOP,
      slug: "my-shop",
      owner_user_id: OTHER,
      owner_contractor_id: null,
    })
    h.canManageShop.mockResolvedValue(false)
    expect(
      await oauth.startInstall(
        {
          query: { type: "server", shop: SHOP },
          userId: USER,
          redirectRegistered: true,
        },
        CONFIG,
        NOW,
      ),
    ).toEqual({
      outcome: { result: "server_forbidden", type: "server" },
    })
    h.canManageShop.mockResolvedValue(true)
    const started = await oauth.startInstall(
      {
        query: { type: "server", shop: SHOP, src: "shop_settings" },
        userId: USER,
        redirectRegistered: true,
      },
      CONFIG,
      NOW,
    )
    if (!("discordUrl" in started)) throw new Error("expected Discord")
    const url = new URL(started.discordUrl)
    expect(url.searchParams.get("scope")).toBe("bot applications.commands")
    expect(url.searchParams.get("permissions")).toBe(oauth.BOT_PERMISSIONS)
    expect(
      oauth.verifyInstallState(url.searchParams.get("state"), SECRET, NOW)?.o,
    ).toEqual({ owner_type: "shop", owner_id: SHOP })
  })

  it("until the redirect URI is registered: Discord's plain install page, no state", async () => {
    const started = await oauth.startInstall(
      {
        query: { type: "server", shop: SHOP },
        userId: USER,
        redirectRegistered: false,
      },
      CONFIG,
      NOW,
    )
    expect(started).toEqual({
      plainUrl: `https://discord.com/oauth2/authorize?client_id=${CONFIG.clientId}&integration_type=0&scope=bot+applications.commands&permissions=${oauth.BOT_PERMISSIONS}`,
    })
    expect(h.getShopById).not.toHaveBeenCalled()
  })

  it("refuses without the Discord app configured", async () => {
    expect(
      oauth.installConfig(
        { DISCORD_CLIENT_ID: "868709691469987860", SESSION_SECRET: "s" },
        new URL("https://api.sc-market.space"),
      ),
    ).toBeNull()
    expect(
      await oauth.startInstall(
        { query: { type: "user" }, userId: USER, redirectRegistered: true },
        null,
        NOW,
      ),
    ).toEqual({
      outcome: { result: "failed", type: "user" },
    })
  })

  it("registers this redirect URI", () => {
    expect(
      oauth.installRedirectUri(new URL("https://api.sc-market.space")),
    ).toBe("https://api.sc-market.space/auth/discord-install/callback")
  })
})
