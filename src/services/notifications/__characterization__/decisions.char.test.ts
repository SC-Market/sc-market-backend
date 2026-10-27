/**
 * Owner decisions wired on notify(): offers accepted/rejected/withdrawn tell
 * the other party; an offer on a public contract tells its customer; Discord
 * DM is available on every event group (off by default) for linked users.
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import { notifyOfferDecision } from "../../notify/offer-decisions.js"
import { notifyContractOfferReceived } from "../../contracts/public-contract-alerts.js"
import { notificationService } from "../notification.service.js"

describe("offer.accepted / offer.rejected", () => {
  it("seller accepts: the customer hears", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.emailOptIn(customer, ["offer_accepted"])
    const session = await w.offerSession("a", { customer, assigned: seller })
    await notifyOfferDecision(session, "accepted", seller.user_id)
    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:customer offer_accepted (session:a)",
        "push    push:customer [offer] Offer accepted",
        "email   customer@example.test Offer Accepted",
      ]
    `)
  })

  it("customer withdraws an org offer nobody claimed: the org's order managers hear", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const member = await w.user("member")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: member, perms: [] },
    ])
    const session = await w.offerSession("b", { customer, org: acme })
    await notifyOfferDecision(session, "withdrawn", customer.user_id)
    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:boss offer_rejected (session:b)",
        "push    push:boss [offer] Offer withdrawn",
      ]
    `)
  })

  it("seller rejects; the customer turned push off", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.pushPref(customer, "offer_rejected", false)
    const session = await w.offerSession("c", { customer, assigned: seller })
    await notifyOfferDecision(session, "rejected", seller.user_id)
    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:customer offer_rejected (session:c)",
      ]
    `)
  })
})

describe("contract.offer_received (was order_contractor_applied)", () => {
  it("the contract's customer hears; the action row kept its id", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const session = await w.offerSession("contract-offer", { customer, assigned: seller })
    await notifyContractOfferReceived(
      { id: "00000000-0000-4000-8999-0000000000aa", title: "Escort to Pyro", customer_id: customer.user_id } as never,
      session,
      seller.user_id,
    )
    const row = await getKnex()("notification_actions").where({ action: "contract_offer_received" }).first()
    expect({ id: row?.action_type_id, entity: row?.entity, summary: w.summary(await w.observe()) }).toMatchInlineSnapshot(`
      {
        "entity": "offer_sessions",
        "id": 16,
        "summary": [
          "in_app  user:customer contract_offer_received (session:contract-offer)",
          "push    push:customer [contract_offer_received] New offer on your contract",
        ],
      }
    `)
  })
})

describe("Discord DM on every event group", () => {
  it("off by default; a linked user who turns it on gets the DM built from the push payload", async () => {
    const boss = await w.user("boss")
    const invitee = await w.user("invitee")
    const unlinked = await w.user("unlinked", { discord: false })
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    await w.channelPref(invitee, "contractor_invite", "discord", true)
    await w.channelPref(unlinked, "contractor_invite", "discord", true)
    for (const u of [invitee, unlinked, boss]) {
      if (u === boss) continue
      const [invite] = await getKnex()("contractor_invites")
        .insert({ contractor_id: acme.contractor_id, user_id: u.user_id })
        .returning("*")
      w.nameId(invite.invite_id, `invite:${u.username}`)
      await notificationService.createContractorInviteNotification(invite)
    }
    const obs = await w.observe()
    expect({ summary: w.summary(obs), dm: obs.discord.find((d) => (d as { route: string }).route.includes("/messages")) }).toMatchInlineSnapshot(`
      {
        "dm": {
          "body": {
            "allowed_mentions": {
              "parse": [],
            },
            "embeds": [
              {
                "color": 1095809,
                "description": "You have been invited to join Org acme

      [Open on SC Market](https://sc-market.space/contractor/ACME)",
                "title": "Contractor Invitation",
                "url": "https://sc-market.space/contractor/ACME",
              },
            ],
          },
          "method": "post",
          "route": "/channels/dm-discord:invitee/messages",
        },
        "summary": [
          "in_app  user:invitee contractor_invite (invite:invitee)",
          "in_app  user:unlinked contractor_invite (invite:unlinked)",
          "push    push:invitee [contractor_invite] Contractor Invitation",
          "push    push:unlinked [contractor_invite] Contractor Invitation",
          "email   invitee@example.test Contractor Invitation",
          "email   unlinked@example.test Contractor Invitation",
          "discord POST /users/@me/channels",
          "discord POST /channels/dm-discord:invitee/messages",
        ],
      }
    `)
  })
})
