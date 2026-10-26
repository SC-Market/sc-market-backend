/**
 * "New public contract" (owner-approved new event): the site-wide webhook and
 * Discord channel feeds, and the opt-in in-app + push alert with its kind
 * filter. Never the contract's own customer; nothing for test accounts.
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import { notifyPublicContractCreated } from "../../contracts/public-contract-alerts.js"
import * as contractDb from "../../../api/routes/v1/contracts/database.js"

async function contract(customer: w.SeededUser, kind = "Escort") {
  const [c] = await contractDb.insertPublicContract({
    title: "Escort a Hull C to Pyro",
    description: "Two fighters needed",
    kind,
    cost: "150000",
    payment_type: "one-time",
    collateral: "0",
    customer_id: customer.user_id,
  } as never)
  w.nameId(c.id, "contract:c1")
  return c
}

async function subscribe(u: w.SeededUser, o: { org?: w.SeededOrg; kinds?: string[] } = {}) {
  await getKnex()("contract_alert_subscriptions").insert({
    user_id: u.user_id,
    contractor_id: o.org?.contractor_id ?? null,
    kinds: o.kinds ?? null,
  })
}

describe("contract.public_created", () => {
  it("feeds (webhooks + Discord channels) and opt-in alerts with kind filters", async () => {
    const customer = await w.user("customer")
    const pilot = await w.user("pilot")
    const boss = await w.user("boss")
    const hauler = await w.user("hauler")
    const tester = await w.user("tester", { isTest: true })
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    const shop = await w.shop("acme-shop", { org: acme })
    await w.webhook("contract-feed", shop, ["public_contract_create"])
    await w.webhook("orders-only", shop, ["order_create"])
    await w.discordSetup({ owner: { org: acme }, channel: "900000000000000401", alerts: true })
    await getKnex()("discord_channel_setups").where({ channel_id: "900000000000000401" }).update({ contracts: true })
    await subscribe(pilot) // every kind, personal
    await subscribe(boss, { org: acme, kinds: ["Escort", "Transport"] })
    await subscribe(hauler, { kinds: ["Transport"] }) // filtered out
    await subscribe(customer) // never their own contract
    await subscribe(tester) // test accounts are never fanned out to

    await notifyPublicContractCreated(await contract(customer))

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:pilot public_contract_create (contract:c1)",
        "in_app  user:boss public_contract_create (contract:c1)",
        "push    push:boss [public_contract_create] New public contract",
        "push    push:pilot [public_contract_create] New public contract",
        "discord POST /channels/900000000000000401/messages",
        "webhook contract-feed SC Market - New Public Contract",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("a contract opened by a test account reaches nobody", async () => {
    const tester = await w.user("tester", { isTest: true })
    const pilot = await w.user("pilot")
    const acme = await w.org("acme", [{ user: pilot, perms: "owner" }])
    const shop = await w.shop("acme-shop", { org: acme })
    await w.webhook("contract-feed", shop, ["public_contract_create"])
    await subscribe(pilot)

    await notifyPublicContractCreated(await contract(tester))

    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`[]`)
  })

  it("push can be switched off for the category; the alert stays in-app", async () => {
    const customer = await w.user("customer")
    const pilot = await w.user("pilot")
    await subscribe(pilot)
    await w.pushPref(pilot, "public_contract_create", false)

    await notifyPublicContractCreated(await contract(customer))

    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:pilot public_contract_create (contract:c1)",
      ]
    `)
  })
})
