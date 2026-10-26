/**
 * How the website shows and sets a thread channel (user and org settings,
 * data export). The bot sets them with /setup; see channel-setups.ts.
 */
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
  /**
   * false when Discord says the bot can't see the channel (it lost access,
   * or the channel was deleted), so the site can ask the owner to fix the
   * bot's permissions or pick another channel. null when there is no channel
   * or Discord couldn't be asked.
   */
  bot_can_see_channel: boolean | null
}

/**
 * Discord JSON error codes meaning the bot can't see the channel:
 * 50001 Missing Access, 10003 Unknown Channel.
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#json
 */
const CHANNEL_NOT_VISIBLE_CODES = new Set([50001, 10003])

function isChannelNotVisible(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === "number" && CHANNEL_NOT_VISIBLE_CODES.has(code)
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
    bot_can_see_channel: null,
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
    result.bot_can_see_channel = true
  } catch (error) {
    if (isChannelNotVisible(error)) result.bot_can_see_channel = false
    logger.debug(`Could not fetch Discord channel ${ref.channel_id}: ${error}`)
  }
  return result
}
