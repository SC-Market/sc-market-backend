/**
 * `discord_channel_setups`: the one place that says which Discord channels get
 * order threads and order alerts, and for whom (a shop, an org or a user).
 *
 * - Threads: at most one channel per owner. Orders and offers are routed to
 *   the shop's channel, else the org's, else the assigned user's
 *   (`DiscordService.resolveThreadConfig`).
 * - Alerts: any number of channels per owner (`order-alerts.ts`).
 * - Contracts: the site-wide public contract feed, any number of channels
 *   (`services/contracts/public-contract-alerts.ts`).
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  DBDiscordChannelSetup,
  DiscordSetupOwnerType,
} from "../../clients/database/db-models.js"

const TABLE = "discord_channel_setups"
const knex = () => getKnex()

export type DiscordSetupKind = "threads" | "alerts" | "contracts"

const ALL_KINDS: DiscordSetupKind[] = ["threads", "alerts", "contracts"]

export interface DiscordSetupOwner {
  owner_type: DiscordSetupOwnerType
  owner_id: string
}

export interface DiscordChannelRef {
  guild_id: string
  channel_id: string
}

/** The owner's order-thread channel, or null when it has none. */
export async function getThreadChannel(
  owner: DiscordSetupOwner,
): Promise<DiscordChannelRef | null> {
  const row = await knex()<DBDiscordChannelSetup>(TABLE)
    .where({ owner_type: owner.owner_type, owner_id: owner.owner_id, threads: true })
    .first("guild_id", "channel_id")
  return row ? { guild_id: row.guild_id, channel_id: row.channel_id } : null
}

/**
 * Point the owner's order threads at `channel`. An owner has one thread
 * channel, so a previous one stops getting threads (its row is removed unless
 * it also has alerts). Returns the channel that was replaced, if any.
 */
export async function setThreadChannel(
  owner: DiscordSetupOwner,
  channel: DiscordChannelRef,
  created_by_discord_id: string | null,
): Promise<DiscordChannelRef | null> {
  return knex().transaction(async (trx) => {
    const previous = await trx<DBDiscordChannelSetup>(TABLE)
      .where({ owner_type: owner.owner_type, owner_id: owner.owner_id, threads: true })
      .forUpdate()
      .first()

    if (previous && previous.channel_id !== channel.channel_id) {
      await removeKind(trx, previous, "threads")
    }

    await trx(TABLE)
      .insert({
        ...owner,
        channel_id: channel.channel_id,
        guild_id: channel.guild_id,
        threads: true,
        created_by_discord_id,
      })
      .onConflict(["channel_id", "owner_type", "owner_id"])
      .merge({
        threads: true,
        guild_id: channel.guild_id,
        created_by_discord_id,
        updated_at: trx.fn.now(),
      })

    return previous && previous.channel_id !== channel.channel_id
      ? { guild_id: previous.guild_id, channel_id: previous.channel_id }
      : null
  })
}

/** Turn on alerts for the owner in `channel`. */
export async function addAlertChannel(
  owner: DiscordSetupOwner,
  channel: DiscordChannelRef,
  created_by_discord_id: string,
): Promise<void> {
  await addFeedChannel(owner, channel, created_by_discord_id, "alerts")
}

/** Turn on a multi-channel kind (order alerts or the contract feed) in `channel`. */
export async function addFeedChannel(
  owner: DiscordSetupOwner,
  channel: DiscordChannelRef,
  created_by_discord_id: string,
  kind: "alerts" | "contracts",
): Promise<void> {
  await knex()(TABLE)
    .insert({
      ...owner,
      channel_id: channel.channel_id,
      guild_id: channel.guild_id,
      [kind]: true,
      created_by_discord_id,
    })
    .onConflict(["channel_id", "owner_type", "owner_id"])
    .merge({ [kind]: true, created_by_discord_id, updated_at: knex().fn.now() })
}

/** The owner's setup in this channel, or undefined. */
export async function getSetup(
  owner: DiscordSetupOwner,
  channel_id: string,
): Promise<DBDiscordChannelSetup | undefined> {
  return knex()<DBDiscordChannelSetup>(TABLE)
    .where({ owner_type: owner.owner_type, owner_id: owner.owner_id, channel_id })
    .first()
}

/** Turn one kind off for `row`; the row goes away when it has nothing left. */
export async function removeKind(
  db: Knex | Knex.Transaction,
  row: Pick<DBDiscordChannelSetup, "id" | "threads" | "alerts"> & { contracts?: boolean },
  kind: DiscordSetupKind,
): Promise<void> {
  const remaining = ALL_KINDS.some((k) => k !== kind && !!row[k])
  if (remaining) {
    await db(TABLE).where({ id: row.id }).update({ [kind]: false, updated_at: db.fn.now() })
  } else {
    await db(TABLE).where({ id: row.id }).del()
  }
}

/** Stop the owner's order threads (used by the site's settings). */
export async function clearThreadChannel(owner: DiscordSetupOwner): Promise<void> {
  const row = await knex()<DBDiscordChannelSetup>(TABLE)
    .where({ owner_type: owner.owner_type, owner_id: owner.owner_id, threads: true })
    .first()
  if (row) await removeKind(knex(), row, "threads")
}

/**
 * Channels that get alerts for an order or offer: the shop's alert channels,
 * plus the org's (org work) or the assigned user's (personal work).
 */
export async function getAlertChannels(target: {
  shop_id?: string | null
  contractor_id?: string | null
  user_id?: string | null
}): Promise<string[]> {
  const owners: DiscordSetupOwner[] = []
  if (target.shop_id) owners.push({ owner_type: "shop", owner_id: target.shop_id })
  if (target.contractor_id) {
    owners.push({ owner_type: "org", owner_id: target.contractor_id })
  } else if (target.user_id) {
    owners.push({ owner_type: "user", owner_id: target.user_id })
  }
  if (!owners.length) return []

  const rows = await knex()<DBDiscordChannelSetup>(TABLE)
    .where({ alerts: true })
    .where((q) => {
      for (const o of owners) {
        q.orWhere({ owner_type: o.owner_type, owner_id: o.owner_id })
      }
    })
    .select("channel_id")
  return [...new Set(rows.map((r) => r.channel_id))]
}

export interface ChannelSetupView {
  owner_type: DiscordSetupOwnerType
  owner_id: string
  /** Who it is for: org name and Spectrum ID, shop name, or username. */
  owner_label: string
  /** The org's Spectrum ID, for org rows (what the bot's `org` option takes). */
  spectrum_id: string | null
  guild_id: string
  threads: boolean
  alerts: boolean
  contracts: boolean
  created_by_discord_id: string | null
}

/** Everything set up in one channel, with readable owner names. */
export async function listChannel(channel_id: string): Promise<ChannelSetupView[]> {
  const rows = await knex()(`${TABLE} as d`)
    .leftJoin("contractors as c", function () {
      this.on("c.contractor_id", "=", "d.owner_id").andOn(knex().raw("d.owner_type = 'org'"))
    })
    .leftJoin("shops as s", function () {
      this.on("s.shop_id", "=", "d.owner_id").andOn(knex().raw("d.owner_type = 'shop'"))
    })
    .leftJoin("accounts as a", function () {
      this.on("a.user_id", "=", "d.owner_id").andOn(knex().raw("d.owner_type = 'user'"))
    })
    .where("d.channel_id", channel_id)
    .orderBy("d.created_at", "asc")
    .select(
      "d.owner_type",
      "d.owner_id",
      "d.guild_id",
      "d.threads",
      "d.alerts",
      "d.contracts",
      "d.created_by_discord_id",
      "c.name as org_name",
      "c.spectrum_id",
      "s.name as shop_name",
      "a.username",
    )

  return rows.map((r) => ({
    owner_type: r.owner_type,
    owner_id: r.owner_id,
    owner_label:
      r.owner_type === "org"
        ? `${r.org_name} (${r.spectrum_id})`
        : r.owner_type === "shop"
          ? `the shop ${r.shop_name}`
          : r.username,
    spectrum_id: r.owner_type === "org" ? r.spectrum_id : null,
    guild_id: r.guild_id,
    threads: r.threads,
    alerts: r.alerts,
    contracts: r.contracts,
    created_by_discord_id: r.created_by_discord_id,
  }))
}

/** Every channel set up for an owner (data export). */
export async function listOwner(owner: DiscordSetupOwner): Promise<DBDiscordChannelSetup[]> {
  return knex()<DBDiscordChannelSetup>(TABLE)
    .where({ owner_type: owner.owner_type, owner_id: owner.owner_id })
    .orderBy("created_at", "asc")
    .select()
}

/** Remove every setup of an owner (account deletion). */
export async function deleteOwner(
  owner: DiscordSetupOwner,
  db: Knex | Knex.Transaction = knex(),
): Promise<void> {
  await db(TABLE).where({ owner_type: owner.owner_type, owner_id: owner.owner_id }).del()
}
