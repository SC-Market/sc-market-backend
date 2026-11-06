/**
 * Seller reachability report (Admin › Market): one aggregate statement,
 * counts only. The database is mocked (test-utils/mock-knex-db.ts): these
 * check the SQL's rules (who is a seller, who is contacted, what counts as
 * reachable per channel), the mapping of its rows to the report, and that the
 * endpoint is admin-only and returns no identities.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  db: null as unknown,
  raw: vi.fn(),
}))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

vi.mock("../discord/install-clicks.js", () => ({
  installClickCounts: vi.fn(async () => [{ install_type: "user", src: "shop_hint", clicks_7d: 2, clicks_30d: 5 }]),
}))

const service = await import("./seller-reachability.service.js")
const { AdminSellerReachabilityController } =
  await import("../../api/routes/v2/admin/AdminSellerReachabilityController.js")

const NOW = new Date("2026-11-01T12:00:00Z")

function row(bucket: string, n: Partial<Record<string, number>>) {
  const base: Record<string, number | string> = {
    bucket,
    sellers: 0,
    listings: 0,
  }
  for (const c of [
    "discord_dm",
    "discord_dm_confirmed",
    "discord_dm_closed",
    "discord_server_or_app",
    "email",
    "email_confirmed",
    "push",
    "any",
    "none",
  ]) {
    base[`${c}_sellers`] = 0
    base[`${c}_listings`] = 0
  }
  return { ...base, ...n } as never
}

beforeEach(() => {
  h.raw.mockReset()
  h.db = { raw: h.raw }
})

describe("reachabilitySql: who counts", () => {
  const { sql, bindings } = service.reachabilitySql()
  const flat = sql.replace(/\s+/g, " ")

  it("sellers are the owners of shops with publicly listed listings (no test shops)", () => {
    expect(flat).toContain("l.status = 'active' AND l.visibility = 'public'")
    expect(flat).toContain("_ts.is_test")
    expect(flat).toContain("s.status = 'active'")
    // A personal shop is its user; an org's shops are one seller.
    expect(flat).toContain(
      "CASE WHEN s.owner_user_id IS NOT NULL THEN 'u:' || s.owner_user_id::text ELSE 'c:' || s.owner_contractor_id::text END AS seller_key",
    )
    expect(flat).toContain("COUNT(DISTINCT listing_id)::integer AS listings")
  })

  it("an org is contacted through its members with manage_orders or manage_market", () => {
    expect(flat).toContain(
      "(cr.manage_orders = true OR cr.manage_market = true)",
    )
    expect(flat).toContain(
      "JOIN contractor_members cm ON cm.contractor_id = se.owner_contractor_id AND cm.user_id = cmr.user_id",
    )
    // ...and is reachable if any of them is.
    expect(flat).toContain(
      "BOOL_OR(uc.email_verified AND NOT uc.email_unsubscribed)",
    )
  })

  it("deleted, tombstoned and banned accounts are no one to reach", () => {
    expect(flat).toContain(
      "a.deleted_at IS NULL AND a.is_tombstone = false AND a.banned IS NOT TRUE",
    )
  })

  it("Discord DM: linked, last DM (any path, discord_dm_attempts, 90 days) not refused (50007 / 50278), and shares a server or installed the app", () => {
    expect(flat).toContain("p.provider_type = 'discord'")
    expect(flat).toContain(
      "LEFT JOIN LATERAL ( SELECT d.status, d.error_code, d.created_at FROM discord_dm_attempts d WHERE d.user_id = a.user_id AND d.created_at > now() - make_interval(days => ?) ORDER BY d.created_at DESC, d.attempt_id DESC LIMIT 1 ) ld ON true",
    )
    expect(flat).not.toContain("notification_deliveries")
    // Never DMed (no attempt) is not "closed": COALESCE keeps it false, not NULL.
    // The shared rule (services/discord/dm-reachability.ts), per contact.
    expect(flat).toContain("CROSS JOIN LATERAL ( SELECT s.*,")
    expect(flat).toContain("COALESCE(ld.status = 'failed' AND ( ld.error_code = ANY(?::int[]) OR (ld.error_code = ANY(?::int[]) AND NOT (")
    // A recorded user install counts (confirmed 2026-11-05); a refusal still wins.
    expect(flat).toContain(
      "(s.discord_linked AND NOT s.dm_closed AND (s.shares_server OR s.user_installed)) AS dm_reachable",
    )
    expect(flat).toContain("COALESCE(BOOL_OR(uc.dm_reachable), false) AS discord_dm,")
    // Delivered: a subset of reachable.
    expect(flat).toContain("BOOL_OR(uc.dm_reachable AND uc.last_dm_status = 'sent')")
    // The old rule (any failure = unreachable, no server check) is gone.
    expect(flat).not.toContain("IS DISTINCT FROM 'failed'")
  })

  it("DM failed (closed): a contact's last DM was refused (50007 / 50278), and no contact is free of that", () => {
    expect(flat).toContain(
      "COALESCE(BOOL_OR(uc.discord_linked AND uc.dm_closed), false) AND NOT COALESCE(BOOL_OR(uc.discord_linked AND NOT uc.dm_closed), false) AS discord_dm_closed",
    )
    expect(bindings[3]).toEqual([50007])
    expect(bindings[4]).toEqual([50278])
  })

  it("shares a server or installed the app: a fresh guild presence result, or a recorded user install", () => {
    expect(flat).toContain(
      "SELECT 1 FROM discord_guild_presence gp WHERE gp.user_id = a.user_id AND gp.shares_server = true AND gp.checked_at > now() - make_interval(days => ?)",
    )
    expect(flat).toContain(
      "EXISTS (SELECT 1 FROM discord_user_installs ui WHERE ui.user_id = a.user_id) AS user_installed",
    )
    expect(flat).toContain("(s.shares_server OR s.user_installed) AS server_or_app")
    expect(flat).toContain("BOOL_OR(uc.discord_linked AND uc.server_or_app), false) AS discord_server_or_app")
    // Not a channel of its own: any / none are unchanged.
    expect(flat).toContain("FILTER (WHERE discord_dm OR email OR push)")
  })

  it("binds its placeholders in statement order", () => {
    expect(bindings).toEqual([90, "admin_alert", 3, [50007], [50278], 90])
    expect((flat.match(/\?/g) ?? []).length).toBe(bindings.length)
  })

  it("email: a verified primary address, not bounced, not unsubscribed from announcement emails", () => {
    expect(flat).toContain(
      "e.is_primary = true AND e.email_verified = true AND e.email_bounced_at IS NULL",
    )
    expect(flat).toContain(
      "ep.contractor_id IS NULL AND na.action = ? AND ep.enabled = false",
    )
    expect(bindings.slice(0, 2)).toEqual([90, "admin_alert"])
  })

  it("email confirmed: reachable by email, and SES confirmed a delivery in the window", () => {
    expect(flat).toContain(
      "e.is_primary = true AND e.last_delivered_at > now() - make_interval(days => ?) ) AS email_delivered",
    )
    expect(flat).toContain(
      "BOOL_OR(uc.email_verified AND NOT uc.email_unsubscribed AND uc.email_delivered)",
    )
    expect(service.EMAIL_DELIVERED_WINDOW_DAYS).toBe(90)
  })

  it("push: at least one subscription", () => {
    expect(flat).toContain(
      "EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = a.user_id) AS push",
    )
  })

  it("buckets use the buyer-facing last-seen cut-offs; an org without contacts is unknown", () => {
    expect(flat).toContain("WHEN ps.last_seen IS NULL THEN 'unknown'")
    expect(flat).toContain(
      "WHEN ps.last_seen > now() - INTERVAL '1 day' THEN 'today'",
    )
    expect(flat).toContain(
      "WHEN ps.last_seen > now() - INTERVAL '7 days' THEN 'this_week'",
    )
    expect(flat).toContain(
      "WHEN ps.last_seen > now() - INTERVAL '30 days' THEN 'this_month'",
    )
    expect(flat).toContain("ELSE 'over_a_month'")
  })

  it("returns aggregates only: no ids, names or addresses leave the database", () => {
    const outer = flat.slice(flat.lastIndexOf("SELECT bucket,"))
    expect(outer.replace("(SELECT MAX(checked_at) FROM discord_guild_presence)", "")).not.toMatch(
      /user_id|contractor_id|e\.email\b|username|seller_key/,
    )
    expect(outer).toContain("GROUP BY bucket")
  })
})

describe("toReport", () => {
  it("lists every bucket in order, zero-filled, and sums the totals", () => {
    const report = service.toReport(
      [
        row("over_a_month", {
          sellers: 10,
          listings: 40,
          discord_dm_sellers: 6,
          discord_dm_listings: 20,
          discord_dm_confirmed_sellers: 2,
          discord_dm_confirmed_listings: 5,
          discord_dm_closed_sellers: 3,
          discord_dm_closed_listings: 11,
          discord_server_or_app_sellers: 5,
          discord_server_or_app_listings: 18,
          email_sellers: 3,
          email_listings: 9,
          email_confirmed_sellers: 1,
          email_confirmed_listings: 4,
          push_sellers: 1,
          push_listings: 2,
          any_sellers: 7,
          any_listings: 25,
          none_sellers: 3,
          none_listings: 15,
        }),
        row("today", {
          sellers: "4" as never,
          listings: 12,
          any_sellers: 4,
          any_listings: 12,
          discord_dm_sellers: 4,
          discord_dm_listings: 12,
        }),
      ],
      NOW,
    )
    expect(report.buckets.map((b) => b.bucket)).toEqual([
      "today",
      "this_week",
      "this_month",
      "over_a_month",
      "unknown",
    ])
    expect(report.buckets[0]).toMatchObject({
      sellers: 4,
      listings: 12,
      any: { sellers: 4, listings: 12 },
    })
    expect(report.buckets[1]).toMatchObject({
      sellers: 0,
      listings: 0,
      none: { sellers: 0, listings: 0 },
    })
    expect(report.buckets[3].discord_dm_confirmed).toEqual({
      sellers: 2,
      listings: 5,
    })
    expect(report.buckets[3].discord_dm_closed).toEqual({ sellers: 3, listings: 11 })
    expect(report.buckets[3].discord_server_or_app).toEqual({ sellers: 5, listings: 18 })
    expect(report.buckets[3].email_confirmed).toEqual({
      sellers: 1,
      listings: 4,
    })
    expect(report.totals).toMatchObject({
      sellers: 14,
      listings: 52,
      discord_dm: { sellers: 10, listings: 32 },
      any: { sellers: 11, listings: 37 },
      none: { sellers: 3, listings: 15 },
    })
    expect(report.totals).not.toHaveProperty("bucket")
    expect(report.generated_at).toBe(NOW.toISOString())
  })

  it("says which channels have a delivery-result signal", () => {
    const report = service.toReport([], NOW)
    expect(report.signals).toEqual({
      discord_dm_delivery_results: true,
      discord_dm_result_retention_days: 90,
      discord_dm_refusal_codes: [50007, 50278],
      discord_shared_server_checked_at: null,
      discord_shared_server_fresh_days: 3,
      discord_user_install_counts_as_dm: true,
      email_delivery_results: true,
      email_delivered_window_days: 90,
      push_delivery_results: false,
    })
    expect(report.email_category).toBe("announcements")
  })

  it("says when server membership was last checked", () => {
    const report = service.toReport(
      [row("today", { presence_checked_at: "2026-11-01T06:00:00Z" as never })],
      NOW,
    )
    expect(report.signals.discord_shared_server_checked_at).toBe("2026-11-01T06:00:00.000Z")
  })

  it("ignores an unexpected bucket instead of inventing one", () => {
    const report = service.toReport(
      [row("someday", { sellers: 5, listings: 5 })],
      NOW,
    )
    expect(report.totals.sellers).toBe(0)
  })
})

describe("GET /admin/seller-reachability", () => {
  const admin = { user_id: "a1", role: "admin" }

  it("runs the one statement and returns the report", async () => {
    h.raw.mockResolvedValue({
      rows: [
        row("this_week", {
          sellers: 2,
          listings: 3,
          push_sellers: 1,
          push_listings: 1,
        }),
      ],
    })
    const controller = new AdminSellerReachabilityController()
    const report = await controller.getSellerReachability({
      user: admin,
    } as never)
    expect(h.raw).toHaveBeenCalledTimes(1)
    expect(h.raw.mock.calls[0][1]).toEqual([90, "admin_alert", 3, [50007], [50278], 90])
    expect(report.buckets[1]).toMatchObject({
      bucket: "this_week",
      sellers: 2,
      push: { sellers: 1, listings: 1 },
    })
    // Install link clicks per surface, counts only.
    expect(report.install_clicks).toEqual([{ install_type: "user", src: "shop_hint", clicks_7d: 2, clicks_30d: 5 }])
    expect(JSON.stringify(report)).not.toMatch(/user_id|a1/)
  })

  it.each([
    ["anonymous", undefined],
    ["a regular user", { user_id: "u1", role: "user" }],
    ["a test admin", { user_id: "t1", role: "admin", is_test: true }],
  ])("refuses %s", async (_label, user) => {
    const controller = new AdminSellerReachabilityController()
    await expect(
      controller.getSellerReachability({ user } as never),
    ).rejects.toThrow()
    expect(h.raw).not.toHaveBeenCalled()
  })
})
