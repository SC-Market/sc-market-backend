/**
 * Public contracts end to end against a real, throwaway Postgres: a customer
 * posts a contract, a seller (personal shop) and an org (org shop) bid on it,
 * the customer accepts a bid, and the order goes to that bidder.
 *
 * Public contracts replaced the old open "public orders" (an order with no
 * shop and no seller that anyone could apply to). Those apply/accept routes
 * are gone, and POST /api/orders refuses an order without a seller. This file
 * checks the replacement still works and that a seller-less order can't be
 * started.
 *
 * Runs in the characterization suite for its schema and transport fakes
 * (vitest.characterization.config.ts; `npm run test:notifications`).
 */
import { describe, expect, it } from "vitest"
import type { Request, Response } from "express"
import * as w from "../../../../test-utils/notif-char/world.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  contracts_get_root,
  contracts_post_contract_id_offers,
  contracts_post_root,
} from "./controller.js"
import { valid_public_contract } from "./middleware.js"
import {
  can_respond_to_offer,
  related_to_offer,
} from "../offers/middleware.js"
import { offer_put_session_id } from "../offers/controller.js"
import { post_root } from "../orders/controller.js"
import { ordersRouter } from "../orders/routes.js"

type Handler = (req: Request, res: Response, next: () => void) => unknown

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(b: unknown) {
      res.body = b
      return res
    },
  }
  return res
}

/** Runs an Express middleware chain the way the router does; stops at the first response. */
async function run(handlers: Handler[], req: Record<string, unknown>) {
  const res = fakeRes()
  const r = { params: {}, query: {}, body: {}, ...req } as unknown as Request
  for (const h of handlers) {
    let called = false
    await h(r, res as unknown as Response, () => {
      called = true
    })
    if (!called) break
  }
  return { res, req: r }
}

const asUser = (u: w.SeededUser) => ({ user_id: u.user_id, username: u.username, role: "user" })

const CONTRACT = {
  title: "Escort to Hurston",
  description: "Two fighters, one hour",
  kind: "Escort",
  cost: "150000",
  collateral: 0,
  payment_type: "one-time",
  departure: null,
  destination: null,
}

async function postContract(customer: w.SeededUser) {
  const { res } = await run([contracts_post_root as Handler], {
    user: asUser(customer),
    body: CONTRACT,
  })
  expect(res.statusCode).toBe(201)
  return res.body.data.contract_id as string
}

async function bid(contract_id: string, bidder: w.SeededUser, body: Record<string, unknown> = {}) {
  return run([valid_public_contract as Handler, contracts_post_contract_id_offers as Handler], {
    user: asUser(bidder),
    params: { contract_id },
    body: { ...CONTRACT, cost: "140000", ...body },
  })
}

async function respond(session_id: string, actor: w.SeededUser, status: string) {
  return run(
    [related_to_offer as Handler, can_respond_to_offer as Handler, offer_put_session_id as Handler],
    { user: asUser(actor), params: { session_id }, body: { status } },
  )
}

describe("public contracts: post, bid, accept, order", () => {
  it("a personal-shop seller's accepted bid becomes an order assigned to that seller", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })

    const contract_id = await postContract(customer)

    const listed = await run([contracts_get_root as Handler], { user: asUser(seller) })
    expect(listed.res.body.data.map((c: { id: string }) => c.id)).toContain(contract_id)

    const { res: bidRes } = await bid(contract_id, seller)
    expect(bidRes.statusCode).toBe(201)
    const session_id = bidRes.body.data.session_id as string

    const db = getKnex()
    const session = await db("offer_sessions").where({ id: session_id }).first()
    expect(session).toMatchObject({
      customer_id: customer.user_id,
      assigned_id: seller.user_id,
      contractor_id: null,
      shop_id: shop.shop_id,
      status: "active",
    })
    expect(await db("public_contract_offers").where({ contract_id, session_id })).toHaveLength(1)

    // The seller made the last move, so it's the customer's turn, not the seller's.
    const early = await respond(session_id, seller, "accepted")
    expect(early.res.statusCode).toBe(403)

    const { res: acceptRes } = await respond(session_id, customer, "accepted")
    expect(acceptRes.statusCode).toBe(200)
    const order_id = acceptRes.body.data.order_id as string

    const order = await db("orders").where({ order_id }).first()
    expect(order).toMatchObject({
      customer_id: customer.user_id,
      assigned_id: seller.user_id,
      contractor_id: null,
      shop_id: shop.shop_id,
      offer_session_id: session_id,
      title: CONTRACT.title,
      kind: "Escort",
    })
    expect(+order.cost).toBe(140000)
    expect((await db("offer_sessions").where({ id: session_id }).first()).status).toBe("closed")
  })

  it("an org's accepted bid becomes an order for the org shop", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    const shop = await w.shop("acme-shop", { org: acme })

    const contract_id = await postContract(customer)
    const { res: bidRes } = await bid(contract_id, boss, { contractor: acme.spectrum_id })
    expect(bidRes.statusCode).toBe(201)
    const session_id = bidRes.body.data.session_id as string

    const { res: acceptRes } = await respond(session_id, customer, "accepted")
    expect(acceptRes.statusCode).toBe(200)

    const order = await getKnex()("orders").where({ order_id: acceptRes.body.data.order_id }).first()
    expect(order).toMatchObject({
      customer_id: customer.user_id,
      contractor_id: acme.contractor_id,
      shop_id: shop.shop_id,
      assigned_id: null,
    })
  })

  it("the customer can't bid on their own contract", async () => {
    const customer = await w.user("customer")
    const contract_id = await postContract(customer)
    const { res } = await bid(contract_id, customer)
    expect(res.statusCode).toBe(400)
    expect(await getKnex()("offer_sessions").count("* as n").first()).toMatchObject({ n: "0" })
  })
})

describe("the open public-order paths are gone", () => {
  it("POST /api/orders with no contractor and no assignee is refused and starts nothing", async () => {
    const customer = await w.user("customer")
    const { res } = await run([post_root as Handler], {
      user: asUser(customer),
      body: { kind: "Escort", cost: "1000", title: "Anyone?", description: "Open order", payment_type: "one-time" },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.error.message).toMatch(/public contract/)
    expect(await getKnex()("offer_sessions").count("* as n").first()).toMatchObject({ n: "0" })
  })

  it("POST /api/orders to a seller still starts an offer", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    const { res } = await run([post_root as Handler], {
      user: asUser(customer),
      body: {
        kind: "Escort",
        cost: "1000",
        title: "Escort",
        description: "To Hurston",
        payment_type: "one-time",
        assigned_to: seller.username,
      },
    })
    expect(res.statusCode).toBe(201)
    const session = await getKnex()("offer_sessions").where({ id: res.body.data.session_id }).first()
    expect(session).toMatchObject({ assigned_id: seller.user_id, shop_id: shop.shop_id })
  })

  it("the orders router has no applicant routes", () => {
    const paths = ordersRouter.stack
      .map((layer: { route?: { path: string } }) => layer.route?.path)
      .filter(Boolean)
    expect(paths).toContain("/:order_id")
    expect(paths.filter((p: string) => p.includes("applicants"))).toEqual([])
  })
})
