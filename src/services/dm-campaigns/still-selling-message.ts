/**
 * The "Still selling?" campaign DM (services/dm-campaigns/still-selling.service.ts):
 * one line of text and three link buttons, in the recipient's language
 * (accounts.locale; the site's 8 locales, English otherwise).
 *
 *   You have N listings on SC Market that haven't been updated in M months. Still selling?
 *   [Keep them live] [Pause them] [Manage listings]
 */
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10"

export const CAMPAIGN_LOCALES = [
  "en",
  "de",
  "es",
  "fr",
  "ja",
  "uk",
  "zh-CN",
  "zh-TW",
] as const
export type CampaignLocale = (typeof CAMPAIGN_LOCALES)[number]

interface Strings {
  text: (n: number, m: number) => string
  keep: (n: number) => string
  pause: (n: number) => string
  manage: string
}

/** Ukrainian plural category: one (1, 21, ...), few (2-4, 22-24, ...), many. */
function ukPlural(n: number): "one" | "few" | "many" {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "one"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few"
  return "many"
}

const STRINGS: Record<CampaignLocale, Strings> = {
  en: {
    text: (n, m) =>
      `You have ${n} ${n === 1 ? "listing" : "listings"} on SC Market that ${n === 1 ? "hasn't" : "haven't"} ` +
      `been updated in ${m} ${m === 1 ? "month" : "months"}. Still selling?`,
    keep: (n) => (n === 1 ? "Keep it live" : "Keep them live"),
    pause: (n) => (n === 1 ? "Pause it" : "Pause them"),
    manage: "Manage listings",
  },
  de: {
    text: (n, m) =>
      `Sie haben ${n} ${n === 1 ? "Angebot" : "Angebote"} auf SC Market, ${n === 1 ? "das" : "die"} seit ` +
      `${m} ${m === 1 ? "Monat" : "Monaten"} nicht aktualisiert ${n === 1 ? "wurde" : "wurden"}. Verkaufen Sie noch?`,
    keep: () => "Aktiv lassen",
    pause: () => "Pausieren",
    manage: "Angebote verwalten",
  },
  es: {
    text: (n, m) =>
      `Tienes ${n} ${n === 1 ? "anuncio" : "anuncios"} en SC Market que no ${n === 1 ? "se ha" : "se han"} ` +
      `actualizado en ${m} ${m === 1 ? "mes" : "meses"}. ¿Sigues vendiendo?`,
    keep: (n) => (n === 1 ? "Mantenerlo activo" : "Mantenerlos activos"),
    pause: (n) => (n === 1 ? "Pausarlo" : "Pausarlos"),
    manage: "Gestionar anuncios",
  },
  fr: {
    text: (n, m) =>
      `Vous avez ${n} ${n === 1 ? "annonce" : "annonces"} sur SC Market qui n'${n === 1 ? "a" : "ont"} pas été ` +
      `${n === 1 ? "mise" : "mises"} à jour depuis ${m} mois. Vous vendez toujours ?`,
    keep: (n) => (n === 1 ? "La garder en ligne" : "Les garder en ligne"),
    pause: (n) => (n === 1 ? "La mettre en pause" : "Les mettre en pause"),
    manage: "Gérer les annonces",
  },
  ja: {
    text: (n, m) =>
      `SC Marketに${m}か月間更新されていない出品が${n}件あります。まだ販売していますか？`,
    keep: () => "公開を続ける",
    pause: () => "一時停止する",
    manage: "出品を管理",
  },
  uk: {
    text: (n, m) => {
      const listings = {
        one: "оголошення",
        few: "оголошення",
        many: "оголошень",
      }[ukPlural(n)]
      const months = { one: "місяць", few: "місяці", many: "місяців" }[
        ukPlural(m)
      ]
      const which =
        ukPlural(n) === "one" ? "яке не оновлювалося" : "які не оновлювалися"
      return `У вас ${n} ${listings} на SC Market, ${which} ${m} ${months}. Ще продаєте?`
    },
    keep: (n) =>
      ukPlural(n) === "one" ? "Залишити активним" : "Залишити активними",
    pause: () => "Призупинити",
    manage: "Керувати оголошеннями",
  },
  "zh-CN": {
    text: (n, m) =>
      `你在 SC Market 上有 ${n} 个商品已经 ${m} 个月没有更新了。还在出售吗？`,
    keep: () => "继续上架",
    pause: () => "暂停",
    manage: "管理商品",
  },
  "zh-TW": {
    text: (n, m) =>
      `你在 SC Market 上有 ${n} 個商品已經 ${m} 個月沒有更新了。還在出售嗎？`,
    keep: () => "繼續上架",
    pause: () => "暫停",
    manage: "管理商品",
  },
}

/** The campaign locale for an accounts.locale value ("en", "zh-TW", "de-DE", ...). */
export function campaignLocale(raw: string | null | undefined): CampaignLocale {
  const value = (raw ?? "").trim()
  if (!value) return "en"
  const lower = value.toLowerCase().replace("_", "-")
  if (lower.startsWith("zh")) {
    return /(-tw|-hk|-mo|-hant)/.test(lower) ? "zh-TW" : "zh-CN"
  }
  const base = lower.split("-")[0]
  return (CAMPAIGN_LOCALES as readonly string[]).includes(base)
    ? (base as CampaignLocale)
    : "en"
}

/** Whole months since `date` (30-day months), at least 1. */
export function monthsSince(date: Date | string, now = new Date()): number {
  const days = (now.getTime() - new Date(date).getTime()) / 86_400_000
  return Math.max(1, Math.floor(days / 30))
}

export interface StillSellingMessageInput {
  locale: CampaignLocale
  listings: number
  months: number
  keepUrl: string
  pauseUrl: string
  manageUrl: string
}

export interface RenderedMessage {
  locale: CampaignLocale
  text: string
  buttons: { label: string; url: string }[]
}

export function renderStillSelling(
  input: StillSellingMessageInput,
): RenderedMessage {
  const s = STRINGS[input.locale] ?? STRINGS.en
  return {
    locale: input.locale,
    text: s.text(input.listings, input.months),
    buttons: [
      { label: s.keep(input.listings), url: input.keepUrl },
      { label: s.pause(input.listings), url: input.pauseUrl },
      { label: s.manage, url: input.manageUrl },
    ],
  }
}

/** The Discord message: the text and one row of link buttons, no mentions. */
export function toDiscordMessage(
  rendered: RenderedMessage,
): RESTPostAPIChannelMessageJSONBody {
  return {
    content: rendered.text,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 1,
        components: rendered.buttons.map((b) => ({
          type: 2,
          style: 5,
          label: b.label,
          url: b.url,
        })),
      },
    ],
  } as RESTPostAPIChannelMessageJSONBody
}
