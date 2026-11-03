/**
 * The "join the Discord server" DM for thread members the bot couldn't add:
 * through notify() (event order.thread_invite, on by default, switchable),
 * worded for orders vs offers and customer vs seller, in the user's language.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  notify: vi.fn(async () => ({ planned: [], delivered: [], failed: [], duplicate: [] })),
  order: { order_id: "o-1", customer_id: "buyer", assigned_id: "seller" } as Record<string, unknown>,
  sessions: [{ id: "s-1", customer_id: "buyer", assigned_id: null }] as Record<string, unknown>[],
  discord: { buyer: "111", seller: "222" } as Record<string, string>,
  locale: { buyer: "fr", seller: null } as Record<string, string | null>,
}))

vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../notify/dispatcher.js", () => ({ notify: h.notify }))
vi.mock("../../api/routes/v1/orders/database.js", () => ({ getOrder: async () => h.order }))
vi.mock("../../api/routes/v1/offers/database.js", () => ({ getOfferSessions: async () => h.sessions }))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUserDiscordId: async (userId: string) => h.discord[userId] ?? null,
  getUser: async ({ user_id }: { user_id: string }) => ({ user_id, locale: h.locale[user_id] }),
}))
vi.mock("../../logger/logger.js", () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const { sendThreadInvites, threadInviteMessage, THREAD_INVITE_EVENT } = await import("./thread-invite.js")
const { CATALOG, CATEGORIES } = await import("../notify/catalog.js")
const { editableChannels } = await import("../notify/preference-matrix.js")

type Opts = { messages: (r: { userId: string }) => { discord_dm: { content: string } }; dedupeKey: string; channels: string[] }

beforeEach(() => h.notify.mockClear())

describe("the event", () => {
  it("is a Personal Discord DM, on by default and switchable", () => {
    expect(CATEGORIES.threads).toEqual({ orgScoped: false, mandatory: false, emailMandatory: false })
    expect(CATALOG[THREAD_INVITE_EVENT]).toMatchObject({
      category: "threads",
      legacyAction: "discord_thread_invite",
      channels: ["discord_dm"],
      defaults: { discord_dm: true },
    })
    expect(editableChannels(THREAD_INVITE_EVENT)).toEqual(["discord_dm"])
  })
})

describe("sendThreadInvites", () => {
  it("an order: each party the bot couldn't add, through notify(), worded for their role and language", async () => {
    await sendThreadInvites({ entityType: "order", entityId: "o-1", threadId: "t-9", discordIds: ["111", "222"], inviteCode: "abc" })
    expect(h.notify).toHaveBeenCalledTimes(1)
    const [event, recipients, opts] = h.notify.mock.calls[0] as unknown as [string, unknown, Opts]
    expect(event).toBe("order.thread_invite")
    expect(recipients).toEqual([
      { userId: "buyer", contractorId: null },
      { userId: "seller", contractorId: null },
    ])
    expect(opts.channels).toEqual(["discord_dm"])
    expect(opts.dedupeKey).toBe("o-1:t-9")
    const buyer = opts.messages({ userId: "buyer" }).discord_dm.content
    expect(buyer).toContain("Tu as passé une commande sur SC Market")
    expect(buyer).toContain("https://discord.gg/abc")
    expect(buyer).toContain("/contract/o-1")
    const seller = opts.messages({ userId: "seller" }).discord_dm.content
    expect(seller).toMatch(/^You have a new order on SC Market\. .*talk to the customer/)
    expect(seller).not.toMatch(/offer/i)
  })

  it("an offer says offer", async () => {
    await sendThreadInvites({ entityType: "offer_session", entityId: "s-1", threadId: "t-1", discordIds: ["111"], inviteCode: "xyz" })
    const [, recipients, opts] = h.notify.mock.calls[0] as unknown as [string, unknown, Opts]
    expect(recipients).toEqual([{ userId: "buyer", contractorId: null }])
    const text = opts.messages({ userId: "buyer" }).discord_dm.content
    expect(text).toContain("Tu as envoyé une offre")
    expect(text).toContain("/offer/s-1")
  })

  it("only the order's customer and assignee; nothing without an invite", async () => {
    await sendThreadInvites({ entityType: "order", entityId: "o-1", threadId: "t", discordIds: ["999"], inviteCode: "abc" })
    await sendThreadInvites({ entityType: "order", entityId: "o-1", threadId: "t", discordIds: ["111"], inviteCode: "" })
    await sendThreadInvites({ entityType: "listing", entityId: "o-1", threadId: "t", discordIds: ["111"], inviteCode: "abc" })
    expect(h.notify).not.toHaveBeenCalled()
  })
})

describe("threadInviteMessage", () => {
  it("never says offer for an order, in any language; no mentions", () => {
    for (const locale of ["en", "de", "es", "fr", "ja", "uk", "zh-CN", "zh-TW"]) {
      const order = threadInviteMessage(locale, "customer", "order", "o", "c").content!
      const offer = threadInviteMessage(locale, "customer", "offer", "o", "c").content!
      expect(order, locale).not.toBe(offer)
      expect(order, locale).toContain("https://discord.gg/c")
      expect(threadInviteMessage(locale, "seller", "order", "o", "c").content, locale).not.toBe(order)
    }
    expect(threadInviteMessage("en", "customer", "order", "o", "c").content).not.toMatch(/offer/i)
    expect(threadInviteMessage("en", "customer", "order", "o", "c").allowed_mentions).toEqual({ parse: [] })
  })
})
