/**
 * Discord servers linked to a shop or org by adding the bot from its Discord
 * settings (services/discord/linked-guilds.ts, install-oauth.ts). The
 * settings page lists them with their channels, and points the owner's order
 * threads and alerts at a channel without /setup in Discord.
 *
 * Only servers linked to that owner can be targeted, and only channels the
 * bot sees in them (Discord's channel list for the server). Everything needs
 * the right to manage the owner's Discord integration: canManageShop for a
 * shop, the org's Manage Webhooks permission for an org.
 */
import {
  Body,
  Delete,
  Get,
  Path,
  Put,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { ChannelType, type APIChannel } from "discord-api-types/v10"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import logger from "../../../../logger/logger.js"
import { discordService } from "../../../../services/discord/discord.service.js"
import {
  addFeedChannel,
  listOwner,
  removeKind,
  setThreadChannel,
} from "../../../../services/discord/channel-setups.js"
import {
  GUILD_ID,
  isGuildLinked,
  listLinkedGuildIds,
  mayManageOwnerDiscord,
  resolveLinkedGuildOwner,
  unlinkGuild,
  type LinkedGuildOwner,
} from "../../../../services/discord/linked-guilds.js"
import type {
  LinkedDiscordChannel,
  LinkedDiscordServer,
  LinkedDiscordServersResponse,
  UpdateLinkedDiscordServerRequest,
} from "../types/discord-install.types.js"

const CHANNEL_ID = /^[0-9]{15,22}$/
const MAX_ALERT_CHANNELS = 10

const CHANNEL_KINDS: Partial<Record<number, LinkedDiscordChannel["kind"]>> = {
  [ChannelType.GuildText]: "text",
  [ChannelType.GuildForum]: "forum",
  [ChannelType.GuildAnnouncement]: "announcement",
}

/** The server's channels that can get threads or alerts, or null when the bot can't read it. */
async function serverChannels(
  guildId: string,
): Promise<LinkedDiscordChannel[] | null> {
  try {
    const channels = (await discordService.fetchGuildChannels(
      guildId,
    )) as (APIChannel & {
      position?: number
      name?: string | null
    })[]
    return channels
      .filter((c) => CHANNEL_KINDS[c.type] !== undefined)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c) => ({
        channel_id: c.id,
        name: c.name ?? c.id,
        kind: CHANNEL_KINDS[c.type]!,
      }))
  } catch (error) {
    logger.debug(
      `Could not list channels of Discord server ${guildId}: ${error}`,
    )
    return null
  }
}

async function describeServer(
  owner: LinkedGuildOwner,
  guildId: string,
): Promise<LinkedDiscordServer> {
  const [channels, setups] = await Promise.all([
    serverChannels(guildId),
    listOwner(owner),
  ])
  let name: string | null = null
  let icon_url: string | null = null
  if (channels) {
    try {
      const guild = await discordService.fetchGuild(guildId)
      name = guild.name
      icon_url = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=96`
        : null
    } catch (error) {
      logger.debug(`Could not fetch Discord server ${guildId}: ${error}`)
    }
  }
  const inServer = setups.filter((s) => String(s.guild_id) === guildId)
  return {
    guild_id: guildId,
    name,
    icon_url,
    bot_in_server: channels !== null,
    channels: channels ?? [],
    thread_channel_id: inServer.find((s) => s.threads)?.channel_id ?? null,
    alert_channel_ids: inServer
      .filter((s) => s.alerts)
      .map((s) => String(s.channel_id)),
  }
}

@Route("discord/linked-servers")
// "Shops" too: a change here moves the shop's thread channel (ShopResponse).
@Tags("Discord", "Shops")
export class DiscordLinkedServersV2Controller extends BaseController {
  /** The owner, if the user may manage its Discord integration; else 404/403. */
  private async owner(
    shop: string | undefined,
    org: string | undefined,
  ): Promise<LinkedGuildOwner> {
    const userId = this.getUserId()
    const owner = await resolveLinkedGuildOwner({ shop, org })
    if (!owner) this.throwNotFound("Shop or org")
    if (!(await mayManageOwnerDiscord(owner, userId))) {
      this.throwForbidden(
        "You don't have permission to manage this Discord integration",
      )
    }
    return { owner_type: owner.owner_type, owner_id: owner.owner_id }
  }

  private async linkedOwner(
    guildId: string,
    shop?: string,
    org?: string,
  ): Promise<LinkedGuildOwner> {
    const owner = await this.owner(shop, org)
    if (!GUILD_ID.test(guildId) || !(await isGuildLinked(owner, guildId))) {
      this.throwNotFound("Linked Discord server", guildId)
    }
    return owner
  }

  /**
   * The Discord servers linked to a shop (by shop id) or an org (by Spectrum
   * ID), with the channels that can get order threads and alerts.
   * @summary List linked Discord servers
   */
  @Get("")
  @Security("loggedin")
  public async getLinkedDiscordServers(
    @Request() request: ExpressRequest,
    @Query() shop?: string,
    @Query() org?: string,
  ): Promise<LinkedDiscordServersResponse> {
    this.request = request
    const owner = await this.owner(shop, org)
    const ids = await listLinkedGuildIds(owner)
    return {
      servers: await Promise.all(ids.map((id) => describeServer(owner, id))),
    }
  }

  /**
   * Point the owner's order threads and alerts at channels of a linked server.
   * @summary Set up threads and alerts in a linked Discord server
   */
  @Put("{guildId}")
  @Security("loggedin")
  public async updateLinkedDiscordServer(
    @Request() request: ExpressRequest,
    @Path() guildId: string,
    @Body() body: UpdateLinkedDiscordServerRequest,
  ): Promise<LinkedDiscordServer> {
    this.request = request
    const owner = await this.linkedOwner(guildId, body.shop, body.org)

    const thread = body.thread_channel_id
    const alerts = body.alert_channel_ids
    if (
      alerts !== undefined &&
      (alerts.length > MAX_ALERT_CHANNELS ||
        alerts.some((id) => !CHANNEL_ID.test(id)))
    ) {
      this.throwValidationError("Pick at most 10 alert channels", [
        {
          field: "alert_channel_ids",
          message: "Discord channel ids, at most 10",
        },
      ])
    }
    if (thread !== undefined && thread !== null && !CHANNEL_ID.test(thread)) {
      this.throwValidationError("Pick a channel for order threads", [
        { field: "thread_channel_id", message: "A Discord channel id" },
      ])
    }

    const channels = await serverChannels(guildId)
    if (!channels) {
      this.throwConflict(
        "The SC Market bot isn't in that server any more. Add it again from this page.",
      )
    }
    const kindOf = new Map(channels.map((c) => [c.channel_id, c.kind]))
    if (thread && !["text", "forum"].includes(kindOf.get(thread) ?? "")) {
      this.throwValidationError(
        "Order threads need a text or forum channel in this server",
        [
          {
            field: "thread_channel_id",
            message: "Not a text or forum channel in this server",
          },
        ],
      )
    }
    if (
      alerts?.some(
        (id) => !["text", "announcement"].includes(kindOf.get(id) ?? ""),
      )
    ) {
      this.throwValidationError(
        "Alerts need text or announcement channels in this server",
        [
          {
            field: "alert_channel_ids",
            message: "Not a text or announcement channel in this server",
          },
        ],
      )
    }

    const inServer = (await listOwner(owner)).filter(
      (s) => String(s.guild_id) === guildId,
    )
    if (thread) {
      await setThreadChannel(
        owner,
        { guild_id: guildId, channel_id: thread },
        null,
      )
    } else if (thread === null) {
      const current = inServer.find((s) => s.threads)
      if (current) await removeKind(this.db(), current, "threads")
    }
    if (alerts !== undefined) {
      const wanted = new Set(alerts)
      // Re-read: a thread change above may have removed or added rows.
      const rows = (await listOwner(owner)).filter(
        (s) => String(s.guild_id) === guildId,
      )
      for (const row of rows) {
        if (row.alerts && !wanted.has(String(row.channel_id)))
          await removeKind(this.db(), row, "alerts")
      }
      const have = new Set(
        rows.filter((r) => r.alerts).map((r) => String(r.channel_id)),
      )
      for (const id of wanted) {
        if (!have.has(id))
          await addFeedChannel(
            owner,
            { guild_id: guildId, channel_id: id },
            null,
            "alerts",
          )
      }
    }
    logger.info("Linked Discord server setup saved", {
      owner_type: owner.owner_type,
      owner_id: owner.owner_id,
      guild_id: guildId,
    })
    return describeServer(owner, guildId)
  }

  /**
   * Unlink a server from the shop or org. Threads and alerts already set up
   * in it keep working until they are changed.
   * @summary Unlink a Discord server
   */
  @Delete("{guildId}")
  @Security("loggedin")
  @SuccessResponse(204, "Unlinked")
  public async unlinkDiscordServer(
    @Request() request: ExpressRequest,
    @Path() guildId: string,
    @Query() shop?: string,
    @Query() org?: string,
  ): Promise<void> {
    this.request = request
    const owner = await this.linkedOwner(guildId, shop, org)
    await unlinkGuild(owner, guildId)
    this.setStatus(204)
  }

  private db() {
    return getKnex()
  }
}
