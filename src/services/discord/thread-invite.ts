/**
 * The "join the Discord server" DM (event order.thread_invite): when the bot
 * creates an order or offer thread but can't add someone to it (usually they
 * aren't in that server yet), it creates an invite and reports who it
 * couldn't add (thread_created on the backend queue). This sends them the
 * invite through notify(), so it follows Settings -> Notifications (on by
 * default) and is logged and deduplicated like every other DM.
 *
 * Owner decision (2026-11-02). It used to be sent by the bot itself, with no
 * setting, in English, and always said "You submitted an offer", even for
 * orders. Now it says order or offer, speaks to the customer or the seller,
 * and is in the recipient's language (the site's 8).
 */
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10"
import type { DBOfferSession, DBOrder } from "../../clients/database/db-models.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"
import * as offerDb from "../../api/routes/v1/offers/database.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import { campaignLocale, type CampaignLocale } from "../dm-campaigns/still-selling-message.js"
import { notify } from "../notify/dispatcher.js"
import type { UserRecipient } from "../notify/channels.js"

export const THREAD_INVITE_EVENT = "order.thread_invite" as const

type Kind = "order" | "offer"
type Role = "customer" | "seller"

interface Strings {
  text: Record<Role, Record<Kind, (invite: string) => string>>
  view: Record<Kind, string>
  settings: string
}

const STRINGS: Record<CampaignLocale, Strings> = {
  en: {
    text: {
      customer: {
        order: (i) => `You placed an order on SC Market. Join the seller's Discord server to talk to them in the order thread: ${i}`,
        offer: (i) => `You sent an offer on SC Market. Join the seller's Discord server to talk to them in the offer thread: ${i}`,
      },
      seller: {
        order: (i) => `You have a new order on SC Market. Join the Discord server to talk to the customer in the order thread: ${i}`,
        offer: (i) => `You have a new offer on SC Market. Join the Discord server to talk to the customer in the offer thread: ${i}`,
      },
    },
    view: { order: "Order", offer: "Offer" },
    settings: "Notification settings",
  },
  de: {
    text: {
      customer: {
        order: (i) =>
          `Du hast auf SC Market eine Bestellung aufgegeben. Tritt dem Discord-Server des Verkäufers bei, um im Bestell-Thread mit ihm zu sprechen: ${i}`,
        offer: (i) =>
          `Du hast auf SC Market ein Angebot gemacht. Tritt dem Discord-Server des Verkäufers bei, um im Angebots-Thread mit ihm zu sprechen: ${i}`,
      },
      seller: {
        order: (i) =>
          `Du hast eine neue Bestellung auf SC Market. Tritt dem Discord-Server bei, um im Bestell-Thread mit dem Kunden zu sprechen: ${i}`,
        offer: (i) =>
          `Du hast ein neues Angebot auf SC Market. Tritt dem Discord-Server bei, um im Angebots-Thread mit dem Kunden zu sprechen: ${i}`,
      },
    },
    view: { order: "Bestellung", offer: "Angebot" },
    settings: "Benachrichtigungseinstellungen",
  },
  es: {
    text: {
      customer: {
        order: (i) =>
          `Hiciste un pedido en SC Market. Únete al servidor de Discord del vendedor para hablar con él en el hilo del pedido: ${i}`,
        offer: (i) =>
          `Enviaste una oferta en SC Market. Únete al servidor de Discord del vendedor para hablar con él en el hilo de la oferta: ${i}`,
      },
      seller: {
        order: (i) =>
          `Tienes un pedido nuevo en SC Market. Únete al servidor de Discord para hablar con el cliente en el hilo del pedido: ${i}`,
        offer: (i) =>
          `Tienes una oferta nueva en SC Market. Únete al servidor de Discord para hablar con el cliente en el hilo de la oferta: ${i}`,
      },
    },
    view: { order: "Pedido", offer: "Oferta" },
    settings: "Ajustes de notificaciones",
  },
  fr: {
    text: {
      customer: {
        order: (i) =>
          `Tu as passé une commande sur SC Market. Rejoins le serveur Discord du vendeur pour lui parler dans le fil de la commande : ${i}`,
        offer: (i) =>
          `Tu as envoyé une offre sur SC Market. Rejoins le serveur Discord du vendeur pour lui parler dans le fil de l'offre : ${i}`,
      },
      seller: {
        order: (i) =>
          `Tu as une nouvelle commande sur SC Market. Rejoins le serveur Discord pour parler au client dans le fil de la commande : ${i}`,
        offer: (i) =>
          `Tu as une nouvelle offre sur SC Market. Rejoins le serveur Discord pour parler au client dans le fil de l'offre : ${i}`,
      },
    },
    view: { order: "Commande", offer: "Offre" },
    settings: "Paramètres de notification",
  },
  ja: {
    text: {
      customer: {
        order: (i) => `SC Market で注文しました。販売者の Discord サーバーに参加して、注文スレッドで話しましょう：${i}`,
        offer: (i) => `SC Market でオファーを送りました。販売者の Discord サーバーに参加して、オファースレッドで話しましょう：${i}`,
      },
      seller: {
        order: (i) => `SC Market で新しい注文があります。Discord サーバーに参加して、注文スレッドで購入者と話しましょう：${i}`,
        offer: (i) =>
          `SC Market で新しいオファーがあります。Discord サーバーに参加して、オファースレッドで購入者と話しましょう：${i}`,
      },
    },
    view: { order: "注文", offer: "オファー" },
    settings: "通知設定",
  },
  uk: {
    text: {
      customer: {
        order: (i) =>
          `Ви зробили замовлення на SC Market. Приєднайтеся до Discord-сервера продавця, щоб поспілкуватися з ним у гілці замовлення: ${i}`,
        offer: (i) =>
          `Ви надіслали пропозицію на SC Market. Приєднайтеся до Discord-сервера продавця, щоб поспілкуватися з ним у гілці пропозиції: ${i}`,
      },
      seller: {
        order: (i) =>
          `У вас нове замовлення на SC Market. Приєднайтеся до Discord-сервера, щоб поспілкуватися з покупцем у гілці замовлення: ${i}`,
        offer: (i) =>
          `У вас нова пропозиція на SC Market. Приєднайтеся до Discord-сервера, щоб поспілкуватися з покупцем у гілці пропозиції: ${i}`,
      },
    },
    view: { order: "Замовлення", offer: "Пропозиція" },
    settings: "Налаштування сповіщень",
  },
  "zh-CN": {
    text: {
      customer: {
        order: (i) => `你在 SC Market 下了订单。加入卖家的 Discord 服务器，在订单帖子中与对方沟通：${i}`,
        offer: (i) => `你在 SC Market 发送了报价。加入卖家的 Discord 服务器，在报价帖子中与对方沟通：${i}`,
      },
      seller: {
        order: (i) => `你在 SC Market 有一个新订单。加入 Discord 服务器，在订单帖子中与买家沟通：${i}`,
        offer: (i) => `你在 SC Market 有一个新报价。加入 Discord 服务器，在报价帖子中与买家沟通：${i}`,
      },
    },
    view: { order: "订单", offer: "报价" },
    settings: "通知设置",
  },
  "zh-TW": {
    text: {
      customer: {
        order: (i) => `你在 SC Market 下了訂單。加入賣家的 Discord 伺服器，在訂單討論串中與對方溝通：${i}`,
        offer: (i) => `你在 SC Market 送出了報價。加入賣家的 Discord 伺服器，在報價討論串中與對方溝通：${i}`,
      },
      seller: {
        order: (i) => `你在 SC Market 有一筆新訂單。加入 Discord 伺服器，在訂單討論串中與買家溝通：${i}`,
        offer: (i) => `你在 SC Market 有一筆新報價。加入 Discord 伺服器，在報價討論串中與買家溝通：${i}`,
      },
    },
    view: { order: "訂單", offer: "報價" },
    settings: "通知設定",
  },
}

function frontendUrl(): string {
  return (env.FRONTEND_URL || "https://sc-market.space").replace(/\/+$/, "")
}

/** The DM: one line in the recipient's language, the order/offer page, and where to turn it off. */
export function threadInviteMessage(
  locale: string | null | undefined,
  role: Role,
  kind: Kind,
  entityId: string,
  inviteCode: string,
): RESTPostAPIChannelMessageJSONBody {
  const s = STRINGS[campaignLocale(locale)]
  const invite = `https://discord.gg/${inviteCode}`
  const page = `${frontendUrl()}/${kind === "order" ? "contract" : "offer"}/${entityId}`
  return {
    allowed_mentions: { parse: [] },
    content: `${s.text[role][kind](invite)}\n\n${s.view[kind]}: ${page}\n-# ${s.settings}: ${frontendUrl()}/settings?tab=notifications`,
  }
}

export interface ThreadInviteReport {
  /** "order" or "offer_session" (the create_thread entity). */
  entityType: string
  entityId: string
  threadId: string
  /** Discord ids the bot could not add to the thread. */
  discordIds: string[]
  inviteCode: string
}

/**
 * DM the invite to the order's or offer's parties the bot couldn't add.
 * Only the customer and the assignee can be thread members (discord.service
 * queueThreadCreation), so anyone else in the report is ignored. Never throws.
 */
export async function sendThreadInvites(report: ThreadInviteReport): Promise<void> {
  try {
    const kind: Kind | null =
      report.entityType === "order" ? "order" : report.entityType === "offer_session" ? "offer" : null
    if (!kind || !report.inviteCode || !report.discordIds.length) return
    let entity: Pick<DBOrder, "customer_id" | "assigned_id"> | Pick<DBOfferSession, "customer_id" | "assigned_id">
    if (kind === "order") {
      entity = await orderDb.getOrder({ order_id: report.entityId })
    } else {
      const [session] = await offerDb.getOfferSessions({ id: report.entityId })
      if (!session) return
      entity = session
    }

    const wanted = new Set(report.discordIds.map(String))
    const parties: { userId: string; role: Role }[] = []
    for (const [userId, role] of [
      [entity.customer_id, "customer"],
      [entity.assigned_id, "seller"],
    ] as const) {
      if (!userId) continue
      const discordId = await profileDb.getUserDiscordId(userId)
      if (discordId && wanted.has(String(discordId))) parties.push({ userId, role })
    }
    if (!parties.length) return

    const roles = new Map(parties.map((p) => [p.userId, p.role]))
    const locales = new Map<string, string | null>()
    for (const p of parties) {
      const user = await profileDb.getUser({ user_id: p.userId }).catch(() => null)
      locales.set(p.userId, (user as { locale?: string | null } | null)?.locale ?? null)
    }
    const recipients: UserRecipient[] = parties.map((p) => ({ userId: p.userId, contractorId: null }))
    await notify(THREAD_INVITE_EVENT, recipients, {
      entityId: report.entityId,
      // One invite per person per thread, however often the report arrives.
      dedupeKey: `${report.entityId}:${report.threadId}`,
      channels: ["discord_dm"],
      messages: (r) => ({
        discord_dm: threadInviteMessage(locales.get(r.userId), roles.get(r.userId) ?? "customer", kind, report.entityId, report.inviteCode),
      }),
    })
  } catch (error) {
    logger.error("Failed to send Discord thread invites", {
      entity_type: report.entityType,
      entity_id: report.entityId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
