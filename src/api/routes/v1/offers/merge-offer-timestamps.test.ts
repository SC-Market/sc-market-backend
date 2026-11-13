/**
 * Merging offer sessions (POST /api/offers/merge) must not backdate the new
 * offer REVISION.
 *
 * The merged session keeps the oldest source session's timestamp (the customer
 * keeps the date they first ordered). The revision in order_offers, however, is
 * made now, and its timestamp is the clock the pending-offer reminders read
 * (services/offer-reminders: `offer_at <= now() - 72 hours` => the final
 * stale-offer reminder, "has waited 3 days for a reply", to the whole seller
 * side). Backdating it made a freshly merged offer instantly 3 days overdue, so
 * every org member with manage_orders got the stale-offer Discord DM within one
 * 30-minute task run of the merge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))

const SESSION_OLD = "11111111-0000-4000-8000-000000000001"
const SESSION_NEW = "11111111-0000-4000-8000-000000000002"
const CUSTOMER = "bbbbbbbb-0000-4000-8000-000000000001"
const ORG = "cccccccc-0000-4000-8000-000000000001"

/** Both source sessions and their revisions are days old. */
const OLDEST_SESSION_AT = new Date("2026-11-08T09:00:00Z")

const SESSIONS: Record<string, Record<string, unknown>> = {
  [SESSION_OLD]: {
    id: SESSION_OLD,
    customer_id: CUSTOMER,
    contractor_id: ORG,
    assigned_id: null,
    shop_id: null,
    status: "active",
    timestamp: OLDEST_SESSION_AT,
  },
  [SESSION_NEW]: {
    id: SESSION_NEW,
    customer_id: CUSTOMER,
    contractor_id: ORG,
    assigned_id: null,
    shop_id: null,
    status: "active",
    timestamp: new Date("2026-11-10T09:00:00Z"),
  },
}

vi.mock("./database.js", () => ({
  getOfferSessions: vi.fn(async ({ id }: { id: string }) => [SESSIONS[id]]),
  getMostRecentOrderOffer: vi.fn(async (id: string) => ({
    id: `offer-${id}`,
    session_id: id,
    kind: "Delivery",
    cost: "1000",
    collateral: "0",
    payment_type: "one-time",
    status: "active",
    service_id: null,
    description: "d",
    timestamp: SESSIONS[id].timestamp,
  })),
}))
vi.mock("../market/database.js", () => ({
  getOfferMarketListings: vi.fn(async () => []),
  insertOfferMarketListing: vi.fn(),
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async () => true),
  is_member: vi.fn(),
}))
vi.mock("../../../../services/allocation/v2-offer-holds.service.js", () => ({
  releaseOfferHolds: vi.fn(),
}))
vi.mock("../../../../clients/database/transaction.js", () => ({
  // The merge's closing transaction only updates statuses; a no-op trx that
  // answers every builder call is enough for this assertion.
  withTransaction: vi.fn(async () => undefined),
}))

const createOffer = vi.fn(async () => ({
  session: { id: "merged-session" },
  offer: { id: "merged-offer" },
}))
vi.mock("../orders/helpers.js", () => ({ createOffer }))

const { mergeOfferSessions } = await import("./helpers.js")

describe("mergeOfferSessions timestamps", () => {
  beforeEach(() => {
    createOffer.mockClear()
  })

  it("keeps the oldest session timestamp but never backdates the offer revision", async () => {
    await mergeOfferSessions([SESSION_OLD, SESSION_NEW], CUSTOMER, "buyer")

    expect(createOffer).toHaveBeenCalledTimes(1)
    const [sessionDetails, offerDetails] = createOffer.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]

    // The merged session inherits the first order's date.
    expect(new Date(sessionDetails.timestamp as string).getTime()).toBe(
      OLDEST_SESSION_AT.getTime(),
    )

    // The revision is made now: no timestamp is passed, so the column default
    // (now()) applies and the reminder clock starts at the merge.
    expect(offerDetails).not.toHaveProperty("timestamp")
  })
})
