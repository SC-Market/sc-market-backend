/**
 * "New public contract": when someone opens a public contract, post it to
 * - every webhook subscribed to `public_contract_create` (site-wide feed);
 * - every Discord channel with the contract feed on (/setup contracts);
 * - every user who opted in to the alert (contract_alert_subscriptions),
 *   in-app and push, optionally filtered by contract kind.
 *
 * Never the contract's own customer, and nothing at all for contracts opened
 * by a test account (services/test-accounts). Never throws.
 */
import { getKnex } from "../../clients/database/knex-db.js"
import type { DBPublicContract } from "../../api/routes/v1/contracts/types.js"
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import { discordService } from "../discord/discord.service.js"
import { actingAsTestAccount, isTestUserId } from "../test-accounts/isolation.js"
import { notify } from "../notify/dispatcher.js"
import { sendWebhookBody } from "../../api/routes/v1/util/webhooks.js"
import logger from "../../logger/logger.js"
import { env } from "../../config/env.js"

export const PUBLIC_CONTRACT_ACTION = "public_contract_create"

function contractUrl(id: string): string {
  return `${env.FRONTEND_URL || "https://sc-market.space"}/contracts/public/${id}`
}

const aUEC = (n: number | string) => `${(+n).toLocaleString("en-US")} aUEC`

/** The post shared by webhooks and Discord channels. */
export function publicContractEmbed(contract: DBPublicContract) {
  return {
    color: 0x10b881,
    title: `New public contract: ${contract.title}`.slice(0, 256),
    url: contractUrl(contract.id),
    description: (contract.description || "").slice(0, 300),
    fields: [
      { name: "Kind", value: contract.kind || "Other", inline: true },
      { name: "Payment", value: contract.payment_type, inline: true },
      { name: "Cost", value: aUEC(contract.cost), inline: true },
      ...(contract.collateral && +contract.collateral > 0
        ? [{ name: "Collateral", value: aUEC(contract.collateral), inline: true }]
        : []),
    ],
    timestamp: new Date(contract.timestamp ?? Date.now()).toISOString(),
  }
}

/** Users to alert for this contract, with the scope whose preferences apply. */
export async function contractAlertRecipients(
  contract: DBPublicContract,
): Promise<{ userId: string; contractorId: string | null }[]> {
  const rows: { user_id: string; contractor_id: string | null }[] = await getKnex()(
    "contract_alert_subscriptions as s",
  )
    .join("accounts as a", "a.user_id", "s.user_id")
    .whereNot("s.user_id", contract.customer_id)
    .whereNull("a.deleted_at")
    .where("a.banned", false)
    .where("a.is_test", false)
    .where(function () {
      this.whereNull("s.kinds").orWhereRaw("? = ANY (s.kinds)", [contract.kind])
    })
    // An org subscription only while the user is still a member holding
    // manage_orders there (taking contracts on the org's behalf, §8).
    .where(function () {
      this.whereNull("s.contractor_id").orWhereExists(function () {
        this.select(getKnex().raw("1"))
          .from("contractor_members as m")
          .join("contractor_member_roles as mr", function () {
            this.on("mr.user_id", "=", "m.user_id")
          })
          .join("contractor_roles as r", function () {
            this.on("r.role_id", "=", "mr.role_id").andOn("r.contractor_id", "=", "m.contractor_id")
          })
          .whereRaw("m.contractor_id = s.contractor_id")
          .whereRaw("m.user_id = s.user_id")
          .where("r.manage_orders", true)
      })
    })
    .orderBy([{ column: "s.user_id" }, { column: "s.contractor_id", order: "asc", nulls: "first" }])
    .select("s.user_id", "s.contractor_id")
  // One alert per user: their personal subscription if they have one, else the first org.
  const seen = new Set<string>()
  const out: { userId: string; contractorId: string | null }[] = []
  for (const r of rows) {
    if (seen.has(r.user_id)) continue
    seen.add(r.user_id)
    out.push({ userId: r.user_id, contractorId: r.contractor_id })
  }
  return out
}

export async function notifyPublicContractCreated(contract: DBPublicContract): Promise<void> {
  try {
    // Contracts opened by a test account reach nobody.
    if (actingAsTestAccount() || (await isTestUserId(contract.customer_id))) return
    const embed = publicContractEmbed(contract)

    // Webhooks (site-wide feed).
    const webhooks = await notificationDb.getNotificationWebhooksByAction({}, PUBLIC_CONTRACT_ACTION)
    for (const webhook of webhooks) {
      try {
        await sendWebhookBody(
          {
            username: "SC Market - New Public Contract",
            allowed_mentions: { parse: [] },
            embeds: [embed],
          },
          webhook,
        )
      } catch (e) {
        logger.error(`Failed to send public contract webhook ${webhook.webhook_id}: ${e}`)
      }
    }

    // Discord channel feed.
    const channels: string[] = await getKnex()("discord_channel_setups")
      .where({ contracts: true })
      .distinct("channel_id")
      .pluck("channel_id")
    for (const channelId of channels) {
      await discordService.postChannelMessage(channelId, { embeds: [embed], allowed_mentions: { parse: [] } })
    }

    // Opt-in alert.
    const recipients = await contractAlertRecipients(contract)
    if (recipients.length) {
      await notify("contract.public_created", recipients, {
        entityId: contract.id,
        actorId: contract.customer_id,
        messages: {
          push: {
            title: "New public contract",
            body: `${contract.title} (${contract.kind}, ${aUEC(contract.cost)})`,
            icon: `${env.FRONTEND_URL || "https://sc-market.space"}/android-chrome-192x192.png`,
            data: { url: contractUrl(contract.id), type: PUBLIC_CONTRACT_ACTION, entityId: contract.id },
            tag: `public-contract-${contract.id}`,
          },
        },
      })
    }
  } catch (err) {
    logger.error("Failed to notify about a new public contract", {
      contract_id: contract.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Someone made an offer on a public contract: tell the contract's customer
 * (in-app and push; email and Discord DM if they turned them on). The offer
 * events themselves go to the offering side, never to the customer.
 */
export async function notifyContractOfferReceived(
  contract: DBPublicContract,
  session: { id: string; contractor_id?: string | null },
  offererId: string,
): Promise<void> {
  try {
    const base = env.FRONTEND_URL || "https://sc-market.space"
    await notify("contract.offer_received", [{ userId: contract.customer_id }], {
      entityId: session.id,
      actorId: offererId,
      messages: {
        push: {
          title: "New offer on your contract",
          body: contract.title,
          icon: `${base}/android-chrome-192x192.png`,
          data: { url: `${base}/offer/${session.id}`, type: "contract_offer_received", entityId: session.id },
          tag: `contract-offer-${session.id}`,
        },
        email: { data: { offer: session } },
      },
    })
  } catch (err) {
    logger.error("Failed to notify about an offer on a public contract", {
      contract_id: contract.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
