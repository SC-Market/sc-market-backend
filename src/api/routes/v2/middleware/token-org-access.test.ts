/**
 * v2 ignored an API token's contractor_ids, so a token granted for one org
 * (or none) could act for every org its user manages.
 */

import { describe, it, expect } from "vitest"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"
import { enforceTokenOrgAccess } from "./token-org-access.js"

const LISTING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORDER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function db() {
  return createFakeKnex({
    contractors: [
      { contractor_id: "org-a", spectrum_id: "ORGA" },
      { contractor_id: "org-b", spectrum_id: "ORGB" },
    ],
    shops: [
      { shop_id: "shop-a", owner_contractor_id: "org-a" },
      { shop_id: "shop-b", owner_contractor_id: "org-b" },
      { shop_id: "shop-me", owner_contractor_id: null, owner_user_id: "me" },
    ],
    listings: [{ listing_id: LISTING, shop_id: "shop-b" }],
    orders: [{ order_id: ORDER, contractor_id: "org-b" }],
    offer_sessions: [],
    // The token's user manages both orgs.
    contractor_members: [
      { contractor_id: "org-a", user_id: "me" },
      { contractor_id: "org-b", user_id: "me" },
    ],
  }) as never
}

const token = (contractor_ids: string[], scopes = ["market:write"]) => ({
  id: "t",
  name: "t",
  scopes,
  contractor_ids,
})

const req = (
  over: Partial<{ path: string; params: object; query: object; body: object }>,
) => ({ path: "/", params: {}, query: {}, body: {}, ...over }) as never

describe("enforceTokenOrgAccess", () => {
  it("refuses a shop owned by an org the token was not granted", async () => {
    await expect(
      enforceTokenOrgAccess(
        db(),
        token(["org-a"]),
        req({ path: "/shops/shop-b", params: { shopId: "shop-b" } }),
        "me",
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it("refuses a listing (by path) in another org's shop", async () => {
    await expect(
      enforceTokenOrgAccess(
        db(),
        token(["org-a"]),
        req({ path: `/listings/${LISTING}` }),
        "me",
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it("refuses spectrum_id and order references outside the grant", async () => {
    await expect(
      enforceTokenOrgAccess(
        db(),
        token([]),
        req({ query: { spectrum_id: "ORGB" } }),
        "me",
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      enforceTokenOrgAccess(
        db(),
        token(["org-a"]),
        req({ path: `/orders/${ORDER}` }),
        "me",
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it("allows the granted org and personal resources", async () => {
    await expect(
      enforceTokenOrgAccess(
        db(),
        token(["org-a"]),
        req({ params: { shopId: "shop-a" } }),
        "me",
      ),
    ).resolves.toBeUndefined()
    await expect(
      enforceTokenOrgAccess(
        db(),
        token([]),
        req({ params: { shopId: "shop-me" } }),
        "me",
      ),
    ).resolves.toBeUndefined()
  })

  it("does not restrict orgs the user is not a member of (acting as a customer)", async () => {
    const outsider = createFakeKnex({
      shops: [{ shop_id: "shop-b", owner_contractor_id: "org-b" }],
      contractor_members: [],
    }) as never
    await expect(
      enforceTokenOrgAccess(
        outsider,
        token([]),
        req({ body: { shop_id: "shop-b" } }),
        "me",
      ),
    ).resolves.toBeUndefined()
  })

  it("does not restrict full/admin tokens or sessions", async () => {
    await expect(
      enforceTokenOrgAccess(
        db(),
        token([], ["full"]),
        req({ params: { shopId: "shop-b" } }),
        "me",
      ),
    ).resolves.toBeUndefined()
    await expect(
      enforceTokenOrgAccess(
        db(),
        undefined,
        req({ params: { shopId: "shop-b" } }),
        "me",
      ),
    ).resolves.toBeUndefined()
  })
})
