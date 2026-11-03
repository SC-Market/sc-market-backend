/**
 * Email translations: every email the backend sends, in the site's 8
 * languages (accounts.locale; English otherwise). One catalog per locale
 * (./catalogs/<locale>.ts, the frontend's locale codes), flat keys
 * "<template>.<key>" plus the shared "layout.*", "common.*" and "status.*".
 *
 * - Templates read their strings with the `t` helper (template-engine.ts):
 *   `{{t "order_create.heading"}}`, `{{t "common.greeting" name=userDisplayName}}`.
 *   The locale is the template data's `locale`.
 * - Subjects and the preheader are built by the formatters with `translate`.
 * - `{name}` is a placeholder. In the HTML part its value is HTML-escaped;
 *   the catalog string itself is trusted and may hold `<b>…</b>` (bold) and
 *   `<link>…</link>` (a link to the `link` value). The text part drops the
 *   tags and escapes nothing.
 * - A key with a `count` value is plural: "<key>_one" / "_few" / "_many" /
 *   "_other", chosen with Intl.PluralRules for the locale.
 *
 * email-catalogs.test.ts checks that every locale carries every en key (with
 * the plural forms its language needs) and the same placeholders and tags.
 * Game proper nouns (aUEC, Star Citizen, ship and item names) stay in English.
 */
import de from "./catalogs/de.js"
import en from "./catalogs/en.js"
import es from "./catalogs/es.js"
import fr from "./catalogs/fr.js"
import ja from "./catalogs/ja.js"
import uk from "./catalogs/uk.js"
import zh_Hans from "./catalogs/zh_Hans.js"
import zh_Hant from "./catalogs/zh_Hant.js"

export const EMAIL_LOCALES = ["en", "de", "es", "fr", "ja", "uk", "zh_Hans", "zh_Hant"] as const
export type EmailLocale = (typeof EMAIL_LOCALES)[number]

export type EmailCatalog = Readonly<Record<string, string>>

export const EMAIL_CATALOGS: Record<EmailLocale, EmailCatalog> = {
  en,
  de,
  es,
  fr,
  ja,
  uk,
  zh_Hans,
  zh_Hant,
}

/** BCP 47 tag of each locale: <html lang>, Intl number formatting and plural rules. */
const LANGUAGE_TAG: Record<EmailLocale, string> = {
  en: "en",
  de: "de",
  es: "es",
  fr: "fr",
  ja: "ja",
  uk: "uk",
  zh_Hans: "zh-Hans",
  zh_Hant: "zh-Hant",
}

const NUMBER_LOCALE: Record<EmailLocale, string> = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  ja: "ja-JP",
  uk: "uk-UA",
  zh_Hans: "zh-CN",
  zh_Hant: "zh-TW",
}

/**
 * accounts.locale -> one of the 8 email languages, English otherwise. The
 * frontend stores its own codes (zh_Hans, zh_Hant); BCP 47 tags such as
 * "de-DE", "zh-TW" or "zh-Hant" map onto them.
 */
export function emailLocale(raw: string | null | undefined): EmailLocale {
  const value = (raw ?? "").trim().toLowerCase().replace(/_/g, "-")
  if (!value) return "en"
  if (value.startsWith("zh")) {
    return /-(tw|hk|mo|hant)\b/.test(value) ? "zh_Hant" : "zh_Hans"
  }
  const base = value.split("-")[0]
  return (EMAIL_LOCALES as readonly string[]).includes(base) ? (base as EmailLocale) : "en"
}

export function languageTag(locale: EmailLocale): string {
  return LANGUAGE_TAG[locale]
}

/** A number as the locale writes it (aUEC amounts, quantities). */
export function formatNumber(locale: EmailLocale, value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0"
  const num = typeof value === "string" ? parseFloat(value) : value
  if (!Number.isFinite(num)) return String(value)
  return num.toLocaleString(NUMBER_LOCALE[locale])
}

export type Vars = Record<string, unknown>

/** The catalog string for a key (its plural form when `count` is given). */
function lookup(locale: EmailLocale, key: string, vars: Vars): string {
  const catalog = EMAIL_CATALOGS[locale]
  if (typeof vars.count === "number") {
    const category = new Intl.PluralRules(LANGUAGE_TAG[locale]).select(vars.count)
    const form = catalog[`${key}_${category}`] ?? catalog[`${key}_other`]
    if (form !== undefined) return form
  }
  const value = catalog[key]
  if (value === undefined) throw new Error(`Missing email string ${key} (${locale})`)
  return value
}

const PLACEHOLDER = /\{(\w+)\}/g

function fill(source: string, vars: Vars, render: (value: unknown) => string): string {
  return source.replace(PLACEHOLDER, (whole, name: string) =>
    name in vars ? render(vars[name]) : whole,
  )
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value)
}

/** Plain text (subjects, preheaders, push, the text/plain part). */
export function translate(locale: EmailLocale, key: string, vars: Vars = {}): string {
  return fill(lookup(locale, key, vars), vars, asText).replace(/<\/?(b|link)>/g, "")
}

/**
 * HTML: placeholder values escaped with `escape`, `<b>` and `<link>` turned
 * into markup. Values already rendered as HTML (another `t`) pass `escape`
 * through unchanged (Handlebars SafeString).
 */
export function translateHtml(
  locale: EmailLocale,
  key: string,
  vars: Vars,
  escape: (value: unknown) => string,
): string {
  const link = escape(vars.link ?? "")
  return fill(lookup(locale, key, vars), vars, escape)
    .replace(/<b>/g, "<strong>")
    .replace(/<\/b>/g, "</strong>")
    .replace(/<link>/g, `<a href="${link}" style="color: #e8e8e8;">`)
    .replace(/<\/link>/g, "</a>")
}

/** The greeting line, by display name (username otherwise). */
export function greeting(locale: EmailLocale, name: string): string {
  return translate(locale, "common.greeting", { name })
}

/** "3 days" / "5 hours" since `hours` ago. */
export function waitedFor(locale: EmailLocale, hours: number): string {
  const h = Math.max(0, Math.floor(hours))
  const days = Math.floor(h / 24)
  return days >= 1
    ? translate(locale, "common.duration_days", { count: days })
    : translate(locale, "common.duration_hours", { count: h })
}

/** A status as the site names it; an unknown status is shown as stored. */
export function statusLabel(locale: EmailLocale, kind: "order" | "offer", status: unknown): string {
  const key = `status.${kind}.${asText(status)}`
  return key in EMAIL_CATALOGS[locale] ? translate(locale, key) : asText(status)
}

// ---------------------------------------------------------------------------
// Texts also used outside the email templates.
// ---------------------------------------------------------------------------

export interface BuyOrderFilledFacts {
  /** The selling shop's name. */
  seller: string
  item: string
  quantity: number
  /** Order total in aUEC. */
  total: number
  /** Units the buy order still wants after this fill (0 = complete). */
  remaining: number
}

/** "Your buy order was filled": the push and the email say the same thing. */
export function buyOrderFilledText(locale: EmailLocale, f: BuyOrderFilledFacts) {
  return {
    title: translate(locale, "buy_order_filled.subject"),
    body: translate(locale, "buy_order_filled.body", {
      seller: f.seller,
      quantity: formatNumber(locale, f.quantity),
      item: f.item,
      total: formatNumber(locale, f.total),
    }),
    status:
      f.remaining > 0
        ? translate(locale, "buy_order_filled.open", { remaining: formatNumber(locale, f.remaining) })
        : translate(locale, "buy_order_filled.complete"),
  }
}
