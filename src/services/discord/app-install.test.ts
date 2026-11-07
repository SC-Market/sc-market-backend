/**
 * User Install availability (services/discord/app-install.ts) and the
 * current user's Discord reachability endpoint. Discord REST is a fake, the
 * database is mocked (test-utils/mock-knex-db.ts). No DM is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ db: null as unknown, raw: vi.fn() }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: { getFileLinkResource: vi.fn() } }))

const install = await import("./app-install.js")
const { rest } = await import("./discord.service.js")
const { NotificationPreferencesV2Controller } = await import(
  "../../api/routes/v2/notification-preferences/NotificationPreferencesV2Controller.js"
)

const USER = "11111111-2222-4333-8444-555555555555"

beforeEach(() => {
  vi.restoreAllMocks()
  install.resetUserInstallCacheForTesting()
  h.raw.mockReset()
  h.db = { raw: h.raw }
})

describe("userInstallAvailable", () => {
  it("only guild install configured (today's app): not available", async () => {
    const get = vi.spyOn(rest, "get").mockResolvedValue({
      integration_types_config: { "0": { oauth2_install_params: { scopes: ["bot", "applications.commands"] } } },
    } as never)
    expect(await install.userInstallAvailable(0)).toBe(false)
    expect(get).toHaveBeenCalledWith("/applications/@me")
  })

  it("User Install enabled: available, cached for an hour", async () => {
    const get = vi.spyOn(rest, "get").mockResolvedValue({ integration_types_config: { "0": {}, "1": {} } } as never)
    expect(await install.userInstallAvailable(0)).toBe(true)
    expect(await install.userInstallAvailable(59 * 60_000)).toBe(true)
    expect(get).toHaveBeenCalledTimes(1)
    await install.userInstallAvailable(61 * 60_000)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("reads the app's redirect URIs from the same cached call", async () => {
    const get = vi.spyOn(rest, "get").mockResolvedValue({
      integration_types_config: { "0": {} },
      redirect_uris: ["https://api.sc-market.space/auth/discord/callback"],
    } as never)
    expect(await install.redirectUriRegistered("https://api.sc-market.space/auth/discord-install/callback", 0)).toBe(false)
    expect(await install.redirectUriRegistered("https://api.sc-market.space/auth/discord/callback", 0)).toBe(true)
    expect(await install.userInstallAvailable(0)).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("a failed read: not available", async () => {
    vi.spyOn(rest, "get").mockRejectedValue(new Error("401"))
    expect(await install.userInstallAvailable(0)).toBe(false)
  })
})

describe("userInstallUrl", () => {
  it("installs to the user's account (integration_type=1, commands scope only)", () => {
    expect(install.userInstallUrl("868709691469987860")).toBe(
      "https://discord.com/oauth2/authorize?client_id=868709691469987860&integration_type=1&scope=applications.commands",
    )
    expect(install.userInstallUrl(undefined)).toBeNull()
    expect(install.userInstallUrl("wumpus")).toBeNull()
  })
})

describe("GET /notification-preferences/discord-reachability", () => {
  it("the caller's own state, with the shared rule", async () => {
    vi.spyOn(rest, "get").mockResolvedValue({ integration_types_config: { "0": {} } } as never)
    h.raw.mockResolvedValue({
      // Installed on their account, no shared server: reachable (confirmed 2026-11-05).
      rows: [{ discord_linked: true, dm_reachable: true, shares_server: false, user_installed: true }],
    })
    const controller = new NotificationPreferencesV2Controller()
    const res = await controller.getDiscordReachability({ user: { user_id: USER } } as never)
    expect(res).toEqual({
      discord_linked: true,
      dm_reachable: true,
      shares_server: false,
      user_installed: true,
      user_install_available: false,
      user_install_url: null,
    })
    const [sql, bindings] = h.raw.mock.calls[0]
    expect(sql).toContain("dm.dm_reachable")
    expect(sql.replace(/\s+/g, " ")).toContain("NOT s.dm_closed AND (s.shares_server OR s.user_installed)) AS dm_reachable")
    expect(bindings[0]).toBe(USER)
  })
})
