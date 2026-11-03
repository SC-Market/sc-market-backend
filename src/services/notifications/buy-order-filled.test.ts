/**
 * notifyBuyOrderFilled: "Your buy order was filled" (event buy_order.filled)
 * to the buyer, through notify() with their Personal preferences. How
 * notify() applies settings is the dispatcher's (dispatcher.char.test.ts);
 * here: the event's catalog entry, who is told, about what, in which
 * language, and that it never fails the order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DBOrder } from "../../clients/database/db-models.js"

const h = vi.hoisted(() => ({ notify: vi.fn() }))
// No database: everything it needs comes from the fill.
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../notify/dispatcher.js", () => ({ notify: h.notify }))
vi.mock("../../logger/logger.js", () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

const { notifyBuyOrderFilled } = await import("./buy-order-filled.js")
const { CATALOG } = await import("../notify/catalog.js")
const { editableChannels } = await import("../notify/preference-matrix.js")
const { EMAIL_LOCALES, buyOrderFilledText } = await import("../email/i18n/index.js")

const ORDER = {
  order_id: "order-1",
  customer_id: "buyer",
  shop_id: "shop-1",
  contractor_id: null,
  assigned_id: "seller",
} as unknown as DBOrder

const fill = (over: Record<string, unknown> = {}) => ({
  order: ORDER,
  buyOrderId: "bo-1",
  sellerId: "seller",
  sellerName: "Seller Shop",
  itemName: "Quantanium",
  quantity: 4,
  total: 12000,
  remaining: 6,
  buyerLocale: "en",
  ...over,
})

beforeEach(() => {
  h.notify.mockReset().mockResolvedValue({ planned: [], delivered: [], failed: [], duplicate: [] })
})

describe("buy_order.filled in the catalog", () => {
  it("is Personal (watchlist, next to buy-order matches): bell always on, push on, email opt-in, Discord DM off", () => {
    const def = CATALOG["buy_order.filled"]
    expect(def.category).toBe("watchlist")
    expect(def.legacyAction).toBe("buy_order_filled")
    expect(def.channels).toEqual(["in_app", "push", "email", "discord_dm"])
    expect(def.defaults).toEqual({ in_app: true, push: true, email: false, discord_dm: false })
    expect(editableChannels("buy_order.filled")).toEqual(["push", "email", "discord_dm"])
  })
})

describe("notifyBuyOrderFilled", () => {
  it("tells the buyer only (Personal), about the order, with the seller as the actor", async () => {
    await notifyBuyOrderFilled(fill())
    expect(h.notify).toHaveBeenCalledTimes(1)
    const [event, recipients, opts] = h.notify.mock.calls[0]
    expect(event).toBe("buy_order.filled")
    expect(recipients).toEqual([{ userId: "buyer", contractorId: null }])
    expect(opts).toMatchObject({ entityId: "order-1", actorId: "seller", dedupeKey: "bo-1:order-1" })
  })

  it("push and email say who filled it, what, for how much and what is still wanted, and link the order", async () => {
    await notifyBuyOrderFilled(fill())
    const { messages } = h.notify.mock.calls[0][2]
    expect(messages.push.title).toBe("Your buy order was filled")
    expect(messages.push.body).toBe(
      "Seller Shop filled your buy order: 4 × Quantanium for 12,000 aUEC. An order has been created for it. " +
        "6 more still wanted: your buy order stays open.",
    )
    expect(messages.push.data).toMatchObject({ entityId: "order-1", action: "buy_order_filled" })
    expect(messages.push.data.url).toMatch(/\/contract\/order-1$/)
    expect(messages.email).toEqual({
      data: {
        buyOrderFill: {
          order_id: "order-1",
          seller: "Seller Shop",
          item: "Quantanium",
          quantity: 4,
          total: 12000,
          remaining: 6,
        },
      },
    })
  })

  it("a complete fill says the buy order is complete", async () => {
    await notifyBuyOrderFilled(fill({ remaining: 0 }))
    expect(h.notify.mock.calls[0][2].messages.push.body).toMatch(/Your buy order is now complete\.$/)
  })

  it("is in the buyer's language", async () => {
    await notifyBuyOrderFilled(fill({ buyerLocale: "de" }))
    const { push } = h.notify.mock.calls[0][2].messages
    expect(push.title).toBe("Dein Kaufauftrag wurde erfüllt")
    expect(push.body).toContain("Seller Shop hat deinen Kaufauftrag erfüllt: 4 × Quantanium für 12.000 aUEC.")
  })

  it("has its text in all 8 languages", () => {
    const facts = { seller: "S", item: "I", quantity: 2, total: 10, remaining: 3 }
    expect(EMAIL_LOCALES).toHaveLength(8)
    const titles = new Set<string>()
    for (const locale of EMAIL_LOCALES) {
      const open = buyOrderFilledText(locale, facts)
      const done = buyOrderFilledText(locale, { ...facts, remaining: 0 })
      titles.add(open.title)
      for (const v of [open.body, open.status]) expect(v, locale).toBeTruthy()
      expect(open.body, locale).toContain("S")
      expect(open.status, locale).toContain("3")
      expect(done.status, locale).not.toBe(open.status)
    }
    expect(titles.size).toBe(8)
  })

  it("never throws: a failed notification doesn't fail the order", async () => {
    h.notify.mockRejectedValue(new Error("db down"))
    await expect(notifyBuyOrderFilled(fill())).resolves.toBeUndefined()
  })
})
