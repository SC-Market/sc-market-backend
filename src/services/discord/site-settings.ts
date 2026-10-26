/**
 * How the website shows and sets a thread channel (user and org settings,
 * data export). The bot sets them with /setup; see channel-setups.ts.
 */
import { DBDiscordChannelSetup } from "../../clients/database/db-models.js"
import logger from "../../logger/logger.js"
import { DiscordChannelRef } from "./channel-setups.js"
import { discordService } from "./discord.service.js"

/** The SC Market Discord server's shared order-thread channel ("Use Official Server"). */
export const OFFICIAL_THREAD_CHANNEL: DiscordChannelRef = {
  guild_id: "1003056231591727264",
  channel_id: "1072580369251041330",
}

export interface ThreadChannelDescription {
  guild_id: string | null
  channel_id: string | null
  guild_name: string | null
  guild_avatar: string | null
  channel_name: string | null
}

/** A thread channel with the server and channel names, when the bot can see them. */
export async function describeThreadChannel(
  ref: DiscordChannelRef | null,
): Promise<ThreadChannelDescription> {
  const result: ThreadChannelDescription = {
    guild_id: ref?.guild_id ?? null,
    channel_id: ref?.channel_id ?? null,
    guild_name: null,
    guild_avatar: null,
    channel_name: null,
  }
  if (!ref) return result

  try {
    const guild = await discordService.fetchGuild(ref.guild_id)
    result.guild_name = guild.name
    result.guild_avatar = guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=240`
      : null
  } catch (error) {
    logger.debug(`Could not fetch Discord server ${ref.guild_id}: ${error}`)
  }
  try {
    const channel = await discordService.fetchChannel(ref.channel_id)
    result.channel_name = channel.name
  } catch (error) {
    logger.debug(`Could not fetch Discord channel ${ref.channel_id}: ${error}`)
  }
  return result
}

/** Data-export lines for an owner's Discord channels. */
export function formatDiscordSetups(rows: DBDiscordChannelSetup[]): string {
  if (!rows.length) return "Discord channels: none\n"
  return (
    "Discord channels:\n" +
    rows
      .map((r) => {
        const kinds = [r.threads && "order threads", r.alerts && "order alerts"]
          .filter(Boolean)
          .join(", ")
        return `- Server ${r.guild_id}, channel ${r.channel_id}: ${kinds}\n`
      })
      .join("")
  )
}
