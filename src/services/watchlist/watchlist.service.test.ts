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
  return { getKnex: () => db }
})

vi.mock("../notifications/channel-preferences.js", () => ({
  dispatchNotification: vi.fn(async () => ["site"]),
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
  matchingWatchesQuery,
  type AlertableListing,
} from "./watchlist.service.js"
import { dispatchNotification } from "../notifications/channel-preferences.js"
import { emailService } from "../email/email.service.js"
import { pushNotificationService } from "../push-notifications/push-notification.service.js"
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
  vi.mocked(dispatchNotification).mockClear()
})

describe("which listings may alert", () => {
  const q = alertableListingQuery(pg, "l-1").toSQL()

  it("requires an active listing", () => {
    expect(q.sql).toContain('"ls"."status" = ?')
    expect(q.bindings).toContain("active")
  })

  it("never alerts on internal (org-private) or unlisted listings", () => {
    // Same rule as the anonymous market grid (visibility != 'private'), plus
    // visibility = 'public' so link-only 'unlisted' listings stay quiet too.
    expect(q.sql).toContain('"ls"."visibility" != ?')
    expect(q.sql).toContain('"ls"."visibility" = ?')
    expect(q.bindings).toContain("private")
    expect(q.bindings).toContain("public")
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

describe("checkWatchlistMatches", () => {
  const match = { watchlist_id: "w-1", user_id: "u-1", query: "Medical Supplies", max_price: 25000 }

  it("sends nothing when the listing is not publicly listed or is a placeholder", async () => {
    fake.results.listing_search = [[]]

    await checkWatchlistMatches("l-private")

    expect(fake.calls.some((c) => c.table === "watchlist_items")).toBe(false)
    expect(dispatchNotification).not.toHaveBeenCalled()
  })

  it("alerts each match through one dispatch call and starts its cooldown", async () => {
    fake.results.listing_search = [[{ ...LISTING, price: "20000", quantity: "100" }]]
    fake.results.watchlist_items = [[match], []]

    await checkWatchlistMatches("l-1")

    expect(dispatchNotification).toHaveBeenCalledTimes(1)
    expect(vi.mocked(dispatchNotification).mock.calls[0][0]).toBe("u-1")
    expect(vi.mocked(dispatchNotification).mock.calls[0][1]).toBe(PRICE_ALERT_ACTION)
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

    expect(dispatchNotification).toHaveBeenCalledTimes(1)
  })

  it("does not start the cooldown when nothing matched", async () => {
    fake.results.listing_search = [[LISTING]]
    fake.results.watchlist_items = [[]]

    await checkWatchlistMatches("l-1")

    expect(dispatchNotification).not.toHaveBeenCalled()
    expect(fake.calls.some((c) => c.method === "update")).toBe(false)
  })

  it("email and push senders use the price_alert type, so their own preference checks apply", async () => {
    vi.mocked(dispatchNotification).mockImplementationOnce(async (_user, _action, send) => {
      await send.email()
      await send.push()
      return ["email", "push"]
    })
    fake.results.listing_search = [[LISTING]]
    fake.results.watchlist_items = [[match], []]

    await checkWatchlistMatches("l-1")

    expect(emailService.sendNotificationEmail).toHaveBeenCalledWith("u-1", "price_alert", {
      listing: {
        listing_id: "l-1",
        title: "Medical Supplies x100",
        price: 20000,
        quantity: 100,
        seller_name: "Shop",
      },
      watch: { query: "Medical Supplies", max_price: 25000 },
    })
    expect(vi.mocked(pushNotificationService.sendPushNotification).mock.calls[0][2]).toBe("price_alert")
  })
})
