/**
 * The one "reachable by Discord DM" rule (services/discord/dm-reachability.ts).
 * The database is mocked (test-utils/mock-knex-db.ts): these check the SQL's
 * rule and the helper's binding and mapping. No DM is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ db: null as unknown, raw: vi.fn() }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

const reach = await import("./dm-reachability.js")

const A = "11111111-2222-4333-8444-555555555555"
const B = "21111111-2222-4333-8444-555555555555"

beforeEach(() => {
  h.raw.mockReset()
  h.db = { raw: h.raw }
})

describe("discordDmStateSql", () => {
  const { sql, bindings } = reach.discordDmStateSql("a.user_id")
  const flat = sql.replace(/\s+/g, " ")

  it("linked, not refused (50007 / 50278), and shares a fresh server with the bot", () => {
    expect(flat).toContain("p.user_id = a.user_id AND p.provider_type = 'discord'")
    expect(flat).toContain("gp.shares_server = true AND gp.checked_at > now() - make_interval(days => ?)")
    expect(flat).toContain("SELECT d.status, d.error_code, d.created_at FROM discord_dm_attempts d")
    expect(flat).toContain("ORDER BY d.created_at DESC, d.attempt_id DESC LIMIT 1")
    expect(flat).toContain(
      "(s.discord_linked AND NOT s.dm_closed AND (s.shares_server OR s.user_installed)) AS dm_reachable",
    )
  })

  it("counts a recorded user install (confirmed live 2026-11-05)", () => {
    expect(flat).toContain("EXISTS (SELECT 1 FROM discord_user_installs ui WHERE ui.user_id = a.user_id) AS user_installed")
    expect(flat).toContain("(s.shares_server OR s.user_installed) AS server_or_app")
  })

  // Evaluate the SQL's own dm_reachable expression over the subquery's flags.
  const expr = /SELECT s\.\*, .*? AS server_or_app, (\(.*?\)) AS dm_reachable/.exec(flat)?.[1] ?? ""
  type Flags = { discord_linked: boolean; dm_closed: boolean; shares_server: boolean; user_installed: boolean }
  const dmReachable = (s: Flags): boolean => {
    const js = expr.replace(/\bAND\b/g, "&&").replace(/\bOR\b/g, "||").replace(/\bNOT\b/g, "!")
    expect(js).toMatch(/^[\s()!&|a-z_.]+$/)
    return new Function("s", `return ${js}`)(s) as boolean
  }
  const linked = { discord_linked: true, dm_closed: false, shares_server: false, user_installed: false }

  it("user install and no shared server: reachable", () => {
    expect(dmReachable({ ...linked, user_installed: true })).toBe(true)
  })

  it("a 50278 is lifted only by an install or a shared-server check after the attempt", () => {
    expect(flat).toContain(
      "EXISTS (SELECT 1 FROM discord_user_installs ui2 WHERE ui2.user_id = a.user_id AND ui2.last_seen_at > ld.created_at)",
    )
    expect(flat).toContain(
      "WHERE gp2.user_id = a.user_id AND gp2.shares_server = true AND gp2.checked_at > ld.created_at",
    )
  })

  // Evaluate the SQL's own dm_closed expression: each EXISTS becomes a flag,
  // each code list its binding (closed codes first, then no-mutual-server codes).
  const closedExpr = /(COALESCE\(ld\.status = 'failed' AND \(.*?\), false\)) AS dm_closed/.exec(flat)?.[1] ?? ""
  type Attempt = { status: "sent" | "failed"; error_code: number | null; created_at: number } | null
  type Later = { install_seen_at?: number; server_checked_at?: number }
  const dmClosed = (ld: Attempt, later: Later = {}): boolean => {
    if (!ld) return false // no attempt: the LATERAL row is NULLs, COALESCE gives false
    let i = 0
    const js = closedExpr
      .replace(/EXISTS \(SELECT 1 FROM discord_user_installs ui2 [^)]*\)/, "x.laterInstall")
      .replace(/EXISTS \( SELECT 1 FROM discord_guild_presence gp2 [^)]*\)/, "x.laterServer")
      .replace(/ld\.error_code = ANY\(\?::int\[\]\)/g, () => `x.codes[${i++}].includes(x.code)`)
      .replace("ld.status = 'failed'", "x.failed")
      .replace(/^COALESCE\((.*), false\)$/, "($1)")
      .replace(/\bAND\b/g, "&&")
      .replace(/\bOR\b/g, "||")
      .replace(/\bNOT\b/g, "!")
    expect(js).toMatch(/^[\s()!&|a-zA-Z_.\[\]0-9]+$/)
    return new Function("x", `return ${js}`)({
      failed: ld.status === "failed",
      code: ld.error_code,
      codes: [bindings[1], bindings[2]],
      laterInstall: (later.install_seen_at ?? -Infinity) > ld.created_at,
      laterServer: (later.server_checked_at ?? -Infinity) > ld.created_at,
    }) as boolean
  }
  const T = 1_000

  it("50278, then a later install: reachable", () => {
    const ld = { status: "failed" as const, error_code: 50278, created_at: T }
    const closed = dmClosed(ld, { install_seen_at: T + 1 })
    expect(closed).toBe(false)
    expect(dmReachable({ ...linked, user_installed: true, dm_closed: closed })).toBe(true)
  })

  it("50278, then a later shared-server check that found one: reachable", () => {
    const ld = { status: "failed" as const, error_code: 50278, created_at: T }
    const closed = dmClosed(ld, { server_checked_at: T + 1 })
    expect(closed).toBe(false)
    expect(dmReachable({ ...linked, shares_server: true, dm_closed: closed })).toBe(true)
  })

  it("50278 with no later install or server: not reachable (an older install does not lift it)", () => {
    const ld = { status: "failed" as const, error_code: 50278, created_at: T }
    expect(dmClosed(ld)).toBe(true)
    const closed = dmClosed(ld, { install_seen_at: T - 1, server_checked_at: T - 1 })
    expect(closed).toBe(true)
    expect(dmReachable({ ...linked, user_installed: true, shares_server: true, dm_closed: closed })).toBe(false)
  })

  it("50007, then an install or a shared server: still not reachable", () => {
    const ld = { status: "failed" as const, error_code: 50007, created_at: T }
    const closed = dmClosed(ld, { install_seen_at: T + 1, server_checked_at: T + 1 })
    expect(closed).toBe(true)
    expect(dmReachable({ ...linked, user_installed: true, shares_server: true, dm_closed: closed })).toBe(false)
  })

  it("never DMed, delivered, or another failure: not closed", () => {
    expect(dmClosed(null)).toBe(false)
    expect(dmClosed({ status: "sent", error_code: null, created_at: T })).toBe(false)
    expect(dmClosed({ status: "failed", error_code: 50013, created_at: T })).toBe(false)
    expect(dmClosed({ status: "failed", error_code: null, created_at: T })).toBe(false)
  })

  it("user install, then a refused DM (50278): not reachable", () => {
    // dm_closed: the last DM failed with 50007, or with 50278 and nothing fixed it since.
    expect(dmReachable({ ...linked, user_installed: true, dm_closed: true })).toBe(false)
    // The refusal also deletes the install record (dm-attempts.ts -> clearUserInstall).
    expect(dmReachable({ ...linked, user_installed: false, dm_closed: true })).toBe(false)
  })

  it("shared server: reachable; neither server nor install, or not linked: not reachable", () => {
    expect(dmReachable({ ...linked, shares_server: true })).toBe(true)
    expect(dmReachable(linked)).toBe(false)
    expect(dmReachable({ ...linked, discord_linked: false, user_installed: true, shares_server: true })).toBe(false)
  })

  it("binds presence days, closed codes, no-mutual-server codes and retention days in statement order", () => {
    expect(bindings).toEqual([3, [50007], [50278], 90])
    expect((flat.match(/\?/g) ?? []).length).toBe(bindings.length)
  })

  it("refuses a column that is not table-qualified", () => {
    expect(() => reach.discordDmStateSql("user_id")).toThrow()
    expect(() => reach.discordDmStateSql("a.user_id; DROP TABLE x")).toThrow()
  })
})

describe("discordDmReachableUsers / isDiscordDmReachable", () => {
  it("one query for the distinct ids; returns the reachable ones", async () => {
    h.raw.mockResolvedValue({ rows: [{ user_id: A }] })
    const set = await reach.discordDmReachableUsers([A, B, A])
    expect([...set]).toEqual([A])
    expect(h.raw).toHaveBeenCalledTimes(1)
    const [sql, bindings] = h.raw.mock.calls[0]
    expect(sql.replace(/\s+/g, " ")).toContain("FROM unnest(?::uuid[]) AS u(user_id) CROSS JOIN LATERAL (")
    expect(sql).toContain("WHERE dm.dm_reachable")
    expect(bindings).toEqual([[A, B], 3, [50007], [50278], 90])
  })

  it("no ids: no query", async () => {
    expect((await reach.discordDmReachableUsers([])).size).toBe(0)
    expect(h.raw).not.toHaveBeenCalled()
  })

  it("one user", async () => {
    h.raw.mockResolvedValue({ rows: [] })
    expect(await reach.isDiscordDmReachable(A)).toBe(false)
    h.raw.mockResolvedValue({ rows: [{ user_id: A }] })
    expect(await reach.isDiscordDmReachable(A)).toBe(true)
  })
})
