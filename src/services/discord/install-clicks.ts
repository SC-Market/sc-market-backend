/**
 * Clicks on "Add SC Market to Discord" links (the frontend's
 * /discord/install route), per day, install type and the surface the link
 * was on, so staff can see which prompts work (Admin › Market › Seller
 * reachability). Counts only: no user, IP or time beyond the day.
 *
 * Surfaces are a fixed list; anything else counts as "other", so a bad or
 * hostile src can neither fail the redirect nor grow the table.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

export const INSTALL_TYPES = ["user", "server"] as const
export type DiscordInstallType = (typeof INSTALL_TYPES)[number]

/** Where an install link can be. Keep in sync with the frontend's install link sources. */
export const INSTALL_SOURCES = [
  "settings_notifications",
  "settings_discord",
  "org_discord",
  "shop_dashboard",
  "shop_hint",
  "guide",
  "faq",
  "footer",
  "other",
] as const
export type DiscordInstallSource = (typeof INSTALL_SOURCES)[number]

/** Days of clicks the report shows. */
export const INSTALL_CLICK_WINDOW_DAYS = 30

export function normalizeSource(src: unknown): DiscordInstallSource {
  return typeof src === "string" && (INSTALL_SOURCES as readonly string[]).includes(src)
    ? (src as DiscordInstallSource)
    : "other"
}

/** Count one click. Returns false (never throws) for an unknown type or a failed write. */
export async function recordInstallClick(type: unknown, src: unknown, db: Knex = getKnex()): Promise<boolean> {
  if (typeof type !== "string" || !(INSTALL_TYPES as readonly string[]).includes(type)) return false
  try {
    await db("discord_install_clicks")
      .insert({ day: db.raw("CURRENT_DATE"), install_type: type, src: normalizeSource(src), clicks: 1 })
      .onConflict(["day", "install_type", "src"])
      .merge({ clicks: db.raw("discord_install_clicks.clicks + 1") })
    return true
  } catch (err) {
    logger.warn("Failed to count a Discord install click", {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

export interface InstallClickCount {
  install_type: DiscordInstallType
  src: DiscordInstallSource
  /** Clicks in the last 7 days (today included). */
  clicks_7d: number
  /** Clicks in the last INSTALL_CLICK_WINDOW_DAYS days (today included). */
  clicks_30d: number
}

/** Clicks per type and surface over the window, most clicked first. */
export async function installClickCounts(db: Knex = getKnex()): Promise<InstallClickCount[]> {
  const rows: { install_type: DiscordInstallType; src: DiscordInstallSource; clicks_7d: number | string; clicks_30d: number | string }[] =
    await db("discord_install_clicks")
      .where("day", ">", db.raw(`CURRENT_DATE - ${INSTALL_CLICK_WINDOW_DAYS}`))
      .groupBy("install_type", "src")
      .select(
        "install_type",
        "src",
        db.raw("COALESCE(SUM(clicks) FILTER (WHERE day > CURRENT_DATE - 7), 0)::integer AS clicks_7d"),
        db.raw("COALESCE(SUM(clicks), 0)::integer AS clicks_30d"),
      )
      .orderBy([
        { column: "clicks_30d", order: "desc" },
        { column: "install_type" },
        { column: "src" },
      ])
  return rows.map((r) => ({
    install_type: r.install_type,
    src: r.src,
    clicks_7d: Number(r.clicks_7d) || 0,
    clicks_30d: Number(r.clicks_30d) || 0,
  }))
}
