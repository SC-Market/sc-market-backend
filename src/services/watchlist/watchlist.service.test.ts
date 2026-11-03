import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"

/**
 * Watchlist price alerts.
 *
 * The SQL builders are compiled with a connection-less pg knex and checked
 * clause by clause (visibility, placeholder price, item/phrase matching,
 * cooldown). The orchestration (checkWatchlistMatches) runs against a fake db
 * that hands back canned rows per table, so it shows what is (not) sent for a
 * given database answer.
 */

type Rows = Record<string, unknown>[]
const fake = vi.hoisted(() => ({
  results: {} as Record<string, Rows[]>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}))

vi.mock("../../clients/database/knex-db.js", () => {
  const db = (tableExpr: string) => {
    const table = tableExpr.split(" ")[0]
    const builder: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const rows = fake.results[table]?.shift() ?? []
            return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              Promise.resolve(rows).then(resolve, reject)
          }
          return (...args: unknown[]) => {
            fake.calls.push({ table, method: prop, args })
            return builder
          }
        },
      },
    )
    return builder
  }
  db.raw = (...args: unknown[]) => ({ raw: args })
  return { getKnex: () => db }
})

vi.mock("../notify/dispatcher.js", () => ({
  notify: vi.fn(async () => ({
    planned: [],
    delivered: [{ userId: "u-1", contractorId: null, channel: "in_app" }],
    failed: [],
    duplicate: [],
  })),
}))
vi.mock("../push-notifications/push-notification.service.js", () => ({
  pushNotificationService: { sendPushNotification: vi.fn() },
}))
vi.mock("../discord/discord.service.js", () => ({ discordService: { sendDirectMessage: vi.fn() } }))
vi.mock("../email/email.service.js", () => ({ emailService: { sendNotificationEmail: vi.fn() } }))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({ getUserDiscordId: vi.fn() }))
vi.mock("../../api/routes/v1/notifications/database.js", () => ({}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import {
  NOTIFICATION_COOLDOWN_MS,
  PRICE_ALERT_ACTION,
  alertableListingQuery,
  checkWatchlistMatches,
  lowestAtOrAbove,
  matchingWatchesQuery,
  type AlertableListing,
} from "./watchlist.service.js"
import { notify } from "../notify/dispatcher.js"
import { PLACEHOLDER_PRICE_MAX } from "../../api/routes/v2/util/placeholder-price.js"

// SQL is only compiled, never run: no connection is needed for toSQL().
const pg = knexFactory({ client: "pg" })

const LISTING: AlertableListing = {
  listing_id: "l-1",
  title: "Medical Supplies x100",
  price: 20000,
  quantity: 100,
  game_item_id: "gi-medical",
  seller_name: "Shop",
  photo: null,
}

beforeEach(() => {
  fake.results = {}
  fake.calls = []
  vi.mocked(notify).mockClear()
})

describe("which listings may alert", () => {
  const q = alertableListingQuery(pg, "l-1").toSQL()

  it("requires an active listing", () => {
    expect(q.sql).toContain('"ls"."status" = ?')
    expect(q.bindings).toContain("active")
  })

  it("never alerts on internal (org-private) or unlisted listings", () => {
    // Same rule as the anonymous market grid: visibility = 'public', so
    // org-private and link-only 'unlisted' listings stay quiet.
    expect(q.sql).toContain('"ls"."visibility" = ?')
    expect(q.bindings).toContain("public")
    expect(q.bindings).not.toContain("private")
    expect(q.bindings).not.toContain("unlisted")
    // Anonymous rule: no org-member exception.
    expect(q.sql).not.toContain("contractor_members")
  })

  it("ignores 1 aUEC WTB placeholder prices", () => {
    expect(q.sql).toContain('"ls"."price_min" > ?')
    expect(q.bindings).toContain(PLACEHOLDER_PRICE_MAX)
    expect(PLACEHOLDER_PRICE_MAX).toBe(1)
  })
})

describe("which watchlist items match", () => {
  const now = new Date("2026-10-25T12:00:00Z")

  it("matches item watches on the exact game_item_id", () => {
    const q = matchingWatchesQuery(pg, LISTING, now).toSQL()
    expect(q.sql).toContain('or "w"."game_item_id" = ?')
    expect(q.bindings).toContain("gi-medical")
  })

  it("does not let item watches match by title", () => {
    const q = matchingWatchesQuery(pg, LISTING, now).toSQL()
    // The title match is reserved for text watches (no game item).
    expect(q.sql).toContain(
      `("w"."game_item_id" is null and to_tsvector('english', ?) @@ phraseto_tsquery('english', w.query))`,
    )
  })

  it("only text watches can match a listing without a game item", () => {
    const q = matchingWatchesQuery(pg, { ...LISTING, game_item_id: null }, now).toSQL()
    expect(q.sql).not.toContain('"w"."game_item_id" = ?')
    expect(q.sql).toContain('"w"."game_item_id" is null')
  })

  it("requires the query as a phrase, not just every word somewhere", () => {
    const q = matchingWatchesQuery(pg, LISTING, now).toSQL()
    expect(q.sql).toContain("phraseto_tsquery")
    expect(q.sql).not.toContain("plainto_tsquery")
  })

  it("requires the price at or below the target", () => {
    const q = matchingWatchesQuery(pg, LISTING, now).toSQL()
    expect(q.sql).toContain('"w"."max_price" >= ?')
    expect(q.bindings[0]).toBe(20000)
  })

  it("skips items alerted within the cooldown", () => {
    const q = matchingWatchesQuery(pg, LISTING, now).toSQL()
    expect(q.sql).toContain('("w"."last_notified_at" is null or "w"."last_notified_at" < ?)')
    expect(q.bindings).toContainEqual(new Date(now.getTime() - NOTIFICATION_COOLDOWN_MS))
    expect(NOTIFICATION_COOLDOWN_MS).toBe(60 * 60 * 1000)
  })
})

describe("paused and quality watches", () => {
  const now = new Date("2026-10-25T12:00:00Z")

  it("never matches a paused watch", () => {
    const q = matchingWatchesQuery(pg, LISTING, now).toSQL()
    expect(q.sql).toContain('"w"."paused_at" is null')
  })

  it("without quality lots, only watches with no minimum quality match", () => {
    const q = matchingWatchesQuery(pg, LISTING, now).toSQL()
    expect(q.sql).toContain('("w"."min_quality_tier" is null and "w"."max_price" >= ?)')
    expect(q.sql).not.toContain('"w"."min_quality_tier" = ?')
  })

  it("matches a quality watch at the price of the lots at or above its tier", () => {
    // Tier 2 lots at 18,000, tier 4 lots at 30,000.
    const tiers = new Map([
      [2, 18000],
      [4, 30000],
    ])
    const q = matchingWatchesQuery(pg, LISTING, now, tiers).toSQL()
    const clause =
      '("w"."min_quality_tier" = ? and "w"."game_item_id" = ? and "w"."max_price" >= ?)'
    expect(q.sql.split(clause).length - 1).toBe(4) // tiers 1-4; nothing is tier 5
    const b = q.bindings
    const at = (tier: number) => b[b.indexOf(tier, 1) + 2]
    expect(at(1)).toBe(18000)
    expect(at(2)).toBe(18000)
    expect(at(3)).toBe(30000)
    expect(at(4)).toBe(30000)
  })

  it("quality watches never match a listing without a game item", () => {
    const q = matchingWatchesQuery(
      pg,
      { ...LISTING, game_item_id: null },
      now,
      new Map([[3, 100]]),
    ).toSQL()
    expect(q.sql).not.toContain('"w"."min_quality_tier" = ?')
  })

  it("lowestAtOrAbove picks the cheapest good-enough tier", () => {
    const tiers = new Map([
      [1, 5000],
      [3, 9000],
      [5, 7000],
    ])
    expect(lowestAtOrAbove(tiers, 1)).toBe(5000)
    expect(lowestAtOrAbove(tiers, 2)).toBe(7000)
    expect(lowestAtOrAbove(tiers, 5)).toBe(7000)
    expect(lowestAtOrAbove(new Map(), 1)).toBeUndefined()
  })
})

describe("checkWatchlistMatches", () => {
  const match = { watchlist_id: "w-1", user_id: "u-1", query: "Medical Supplies", max_price: 25000 }

  it("sends nothing when the listing is not publicly listed or is a placeholder", async () => {
    fake.results.listing_search = [[]]

    await checkWatchlistMatches("l-private")

    expect(fake.calls.some((c) => c.table === "watchlist_items")).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })

  it("alerts each match through one dispatch call and starts its cooldown", async () => {
    fake.results.listing_search = [[{ ...LISTING, price: "20000", quantity: "100" }]]
    fake.results.watchlist_items = [[match], []]

    await checkWatchlistMatches("l-1")

    expect(notify).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notify).mock.calls[0][0]).toBe("watchlist.price_alert")
    expect(vi.mocked(notify).mock.calls[0][1]).toEqual([{ userId: "u-1" }])
    const update = fake.calls.find((c) => c.table === "watchlist_items" && c.method === "update")
    expect(update?.args[0]).toEqual({ last_notified_at: expect.any(Date) })
    const whereIn = fake.calls.find((c) => c.table === "watchlist_items" && c.method === "whereIn")
    expect(whereIn?.args).toEqual(["id", ["w-1"]])
  })

  it("alerts a watch once for a bundle, at its cheapest matching row", async () => {
    fake.results.listing_search = [
      [
        { ...LISTING, item_id: "a", price: 22000 },
        { ...LISTING, item_id: "b", price: 21000 },
      ],
    ]
    fake.results.watchlist_items = [[match], [match], []]

    await checkWatchlistMatches("l-1")

    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("does not start the cooldown when nothing matched", async () => {
    fake.results.listing_search = [[LISTING]]
    fake.results.watchlist_items = [[]]

    await checkWatchlistMatches("l-1")

    expect(notify).not.toHaveBeenCalled()
    expect(fake.calls.some((c) => c.method === "update")).toBe(false)
  })

  it("hands notify() the push, email and Discord messages; email keeps the price_alert template data", async () => {
    fake.results.listing_search = [[LISTING]]
    fake.results.watchlist_items = [[match], []]

    await checkWatchlistMatches("l-1")

    const opts = vi.mocked(notify).mock.calls[0][2]
    const messages = opts.messages as Exclude<typeof opts.messages, (...a: never) => unknown>
    expect(messages.email).toEqual({
      data: {
        listing: {
          listing_id: "l-1",
          title: "Medical Supplies x100",
          price: 20000,
          quantity: 100,
          seller_name: "Shop",
        },
        watch: { query: "Medical Supplies", max_price: 25000 },
      },
    })
    expect(messages.push?.data?.type).toBe(PRICE_ALERT_ACTION)
    expect(messages.discord_dm?.embeds?.[0].title).toBe("Price Alert: Medical Supplies x100")
    expect(opts.entityId).toBe("l-1")
  })

  it("alerts a quality watch at the price of its tier's lots", async () => {
    fake.results.listing_search = [
      [{ ...LISTING, item_id: "li-1", price: 12000 }],
      // Lot tiers of this listing row: tier 1 at 12,000, tier 4 at 30,000.
      [
        { tier: 1, price: "12000" },
        { tier: 4, price: "30000" },
      ],
    ]
    fake.results.watchlist_items = [[{ ...match, max_price: 35000, min_quality_tier: 3 }], []]

    await checkWatchlistMatches("l-1")

    expect(notify).toHaveBeenCalledTimes(1)
    const opts = vi.mocked(notify).mock.calls[0][2]
    const messages = opts.messages as Exclude<typeof opts.messages, (...a: never) => unknown>
    expect(messages.push?.body).toBe(
      "Medical Supplies x100 is listed at 30,000 aUEC (your target: 35,000 aUEC, quality 3+)",
    )
  })

  it("does not start the cooldown when no channel delivered", async () => {
    vi.mocked(notify).mockResolvedValueOnce({ planned: [], delivered: [], failed: [], duplicate: [] })
    fake.results.listing_search = [[LISTING]]
    fake.results.watchlist_items = [[match]]

    await checkWatchlistMatches("l-1")

    expect(fake.calls.some((c) => c.table === "watchlist_items" && c.method === "update")).toBe(false)
  })
})
