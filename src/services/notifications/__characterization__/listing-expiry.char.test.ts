/**
 * Listing expiry (services/listing-expiry): expiry assignment at rollout,
 * the "Still selling?" notice (in-app + Discord DM, batched per shop, one DM
 * per user per day), pausing only after a day's notice, and renew.
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import { processListingExpiry as run } from "../../listing-expiry/listing-expiry.service.js"

const processListingExpiry = () => run({ cutover: new Date(0), enabled: true })

const db = () => getKnex()
const dmSends = (o: w.Observed) =>
  (o.discord as { route: string }[]).filter((d) => /\/channels\/.+\/messages$/.test(d.route)).length

async function scene() {
  const seller = await w.user("seller")
  const shop = await w.shop("lara", { user: seller })
  const a = await w.listing("a", { shop, seller: { user: seller }, title: "Laranite", price: 4000 })
  const b = await w.listing("b", { shop, seller: { user: seller }, title: "Agricium", price: 9000 })
  return { seller, shop, a, b }
}
const expireIn = (listingId: string, hours: number) =>
  db()("listings").where({ listing_id: listingId }).update({ expires_at: db().raw(`now() + INTERVAL '${hours} hours'`) })

describe("listing expiry", () => {
  it("off by default (LISTING_EXPIRY_ENABLED unset): nothing is assigned, noticed or paused", async () => {
    await scene()
    const stats = await run({ cutover: new Date(0) })
    const withExpiry = await db()("listings").whereNotNull("expires_at").count("* as n").first()
    expect({ stats, withExpiry: Number(withExpiry?.n) }).toEqual({
      stats: { assigned: 0, noticed_listings: 0, notice_batches: 0, capped_shops: 0, dm_sent: 0, dm_failed: 0, paused: 0 },
      withExpiry: 0,
    })
  })

  it("rollout: active listings without an expiry get a full month or more; nothing is noticed or paused", async () => {
    const { a } = await scene()
    await db()("listings").where({ listing_id: a.listing_id }).update({ created_at: db().raw("now() - INTERVAL '200 days'") })
    const stats = await processListingExpiry()
    const rows = await db()("listings").select(db().raw("expires_at > now() + INTERVAL '29 days' AS month_or_more"))
    expect({ assigned: stats.assigned, noticed: stats.noticed_listings, paused: stats.paused, rows }).toEqual({
      assigned: 2,
      noticed: 0,
      paused: 0,
      rows: [{ month_or_more: true }, { month_or_more: true }],
    })
  })

  it("3 days before: one batched notice per shop (in-app + DM), once", async () => {
    const { a, b } = await scene()
    await processListingExpiry()
    await expireIn(a.listing_id, 60)
    await expireIn(b.listing_id, 70)
    const first = await processListingExpiry()
    const second = await processListingExpiry()
    const obs = await w.observe()
    const inApp = (obs.in_app as { action: string }[]).filter((r) => r.action === "listing_expiring").length
    expect({ first: [first.notice_batches, first.noticed_listings], second: second.noticed_listings, inApp, dms: dmSends(obs) })
      .toEqual({ first: [1, 2], second: 0, inApp: 1, dms: 1 })
  })

  it("pauses only after the notice has been out for a day; renew reactivates", async () => {
    const { a } = await scene()
    await processListingExpiry()
    await expireIn(a.listing_id, -1) // already past its date: noticed now, not paused yet
    const noticed = await processListingExpiry()
    const notYet = (await db()("listings").where({ listing_id: a.listing_id }).first("status")).status
    await db()("listing_expiry_notices").update({ notified_at: db().raw("now() - INTERVAL '25 hours'") })
    const paused = await processListingExpiry()
    const after = (await db()("listings").where({ listing_id: a.listing_id }).first("status")).status
    const notice = await db()("listing_expiry_notices").where({ listing_id: a.listing_id }).first("paused_at")
    expect({ noticed: noticed.noticed_listings, notYet, paused: paused.paused, after, recorded: !!notice.paused_at }).toEqual({
      noticed: 1,
      notYet: "active",
      paused: 1,
      after: "expired",
      recorded: true,
    })
  })

  it("at most one listing.expiring DM per user per day; in-app still arrives", async () => {
    const seller = await w.user("seller")
    const s1 = await w.shop("one", { user: seller })
    const s2 = await w.shop("two", { user: seller })
    const a = await w.listing("a", { shop: s1, seller: { user: seller }, title: "A", price: 1 })
    const b = await w.listing("b", { shop: s2, seller: { user: seller }, title: "B", price: 1 })
    await processListingExpiry()
    await expireIn(a.listing_id, 60)
    await expireIn(b.listing_id, 60)
    await processListingExpiry()
    const obs = await w.observe()
    const inApp = (obs.in_app as { action: string }[]).filter((r) => r.action === "listing_expiring").length
    expect({ inApp, dms: dmSends(obs) }).toEqual({ inApp: 2, dms: 1 })
  })

  it("kill switch: DISCORD_DM_DISABLED_EVENTS=listing.expiring sends in-app only", async () => {
    const { a } = await scene()
    await processListingExpiry()
    await expireIn(a.listing_id, 60)
    process.env.DISCORD_DM_DISABLED_EVENTS = "listing.expiring"
    try {
      await processListingExpiry()
    } finally {
      delete process.env.DISCORD_DM_DISABLED_EVENTS
    }
    const obs = await w.observe()
    expect({
      inApp: (obs.in_app as { action: string }[]).filter((r) => r.action === "listing_expiring").length,
      dms: dmSends(obs),
    }).toEqual({ inApp: 1, dms: 0 })
  })
})
