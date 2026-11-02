/**
 * Discord servers linked to a shop or an org (discord_linked_guilds).
 *
 * A server is linked when someone adds the bot from the shop's or org's
 * Discord settings on the website (the install flow, install-oauth.ts). The
 * settings page then lists that server's channels, so order threads and
 * alerts can be pointed at one without running /setup in Discord.
 *
 * Who may link a server, see it and pick its channels: whoever may manage the
 * owner's Discord integration. For a shop that is canManageShop (the owner,
 * or the org's Manage Market permission); for an org, its Manage Webhooks
 * permission (what /setup threads asks for).
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"
import {
  canManageShop,
  getShopById,
} from "../shops/shop-permissions.service.js"

export type LinkedGuildOwnerType = "shop" | "org"

export interface LinkedGuildOwner {
  owner_type: LinkedGuildOwnerType
  /** shops.shop_id or contractors.contractor_id. */
  owner_id: string
}

/** A resolved owner with what the website needs to link back to it. */
export interface ResolvedLinkedGuildOwner extends LinkedGuildOwner {
  /** The shop's slug, or the org's Spectrum ID. */
  path_key: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SPECTRUM_ID = /^[A-Za-z0-9_-]{1,64}$/
export const GUILD_ID = /^[0-9]{15,22}$/

/**
 * The shop (by shop id) or org (by Spectrum ID) a request names, or null when
 * it names neither, both, or one that doesn't exist.
 */
export async function resolveLinkedGuildOwner(
  ref: { shop?: unknown; org?: unknown },
  db: Knex = getKnex(),
): Promise<ResolvedLinkedGuildOwner | null> {
  const shop = typeof ref.shop === "string" ? ref.shop.trim() : ""
  const org = typeof ref.org === "string" ? ref.org.trim() : ""
  if (!!shop === !!org) return null
  if (shop) {
    if (!UUID.test(shop)) return null
    const row = await getShopById(shop)
    return row
      ? { owner_type: "shop", owner_id: row.shop_id, path_key: row.slug }
      : null
  }
  if (!SPECTRUM_ID.test(org)) return null
  const row = await db("contractors")
    .whereRaw("lower(spectrum_id) = lower(?)", [org])
    .first("contractor_id", "spectrum_id")
  return row
    ? {
        owner_type: "org",
        owner_id: String(row.contractor_id),
        path_key: String(row.spectrum_id),
      }
    : null
}

/** The shop's slug or the org's Spectrum ID (for links back to its settings), or null when gone. */
export async function ownerPathKey(
  owner: LinkedGuildOwner,
  db: Knex = getKnex(),
): Promise<string | null> {
  const row =
    owner.owner_type === "shop"
      ? await db("shops")
          .where({ shop_id: owner.owner_id })
          .first("slug as key")
      : await db("contractors")
          .where({ contractor_id: owner.owner_id })
          .first("spectrum_id as key")
  return row?.key ? String(row.key) : null
}

/** Whether the user may manage the owner's Discord integration. */
export async function mayManageOwnerDiscord(
  owner: LinkedGuildOwner,
  userId: string,
): Promise<boolean> {
  if (owner.owner_type === "shop") {
    const shop = await getShopById(owner.owner_id)
    return !!shop && (await canManageShop(shop, userId))
  }
  return has_permission(owner.owner_id, userId, "manage_webhooks")
}

/** Link a server to the owner (idempotent: a repeat keeps the first link). */
export async function linkGuild(
  owner: LinkedGuildOwner,
  guildId: string,
  userId: string,
  db: Knex = getKnex(),
): Promise<void> {
  if (!GUILD_ID.test(guildId)) throw new Error("Invalid Discord server id")
  await db("discord_linked_guilds")
    .insert({ ...owner, guild_id: guildId, linked_by_user_id: userId })
    .onConflict(["owner_type", "owner_id", "guild_id"])
    .ignore()
}

/** The owner's linked server ids, oldest first. */
export async function listLinkedGuildIds(
  owner: LinkedGuildOwner,
  db: Knex = getKnex(),
): Promise<string[]> {
  const rows: { guild_id: string }[] = await db("discord_linked_guilds")
    .where({ owner_type: owner.owner_type, owner_id: owner.owner_id })
    .orderBy("linked_at", "asc")
    .select("guild_id")
  return rows.map((r) => String(r.guild_id))
}

/** Whether the server is linked to the owner. */
export async function isGuildLinked(
  owner: LinkedGuildOwner,
  guildId: string,
  db: Knex = getKnex(),
): Promise<boolean> {
  const row = await db("discord_linked_guilds")
    .where({
      owner_type: owner.owner_type,
      owner_id: owner.owner_id,
      guild_id: guildId,
    })
    .first("guild_id")
  return !!row
}

/** Unlink a server. Returns whether it was linked. Channel setups stay until changed. */
export async function unlinkGuild(
  owner: LinkedGuildOwner,
  guildId: string,
  db: Knex = getKnex(),
): Promise<boolean> {
  const n = await db("discord_linked_guilds")
    .where({
      owner_type: owner.owner_type,
      owner_id: owner.owner_id,
      guild_id: guildId,
    })
    .delete()
  return Number(n) > 0
}
