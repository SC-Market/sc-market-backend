import { PermissionFlagsBits } from "discord-api-types/v10"
import { discordService } from "./discord.service.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"

/**
 * Checks a (server, channel) pair a user wants SC Market to create order and
 * offer threads in. Mirrors what the bot's /register command guarantees for
 * users and orgs: the bot can see the channel, the channel belongs to that
 * server, and the requesting user (by their linked Discord account) is the
 * server owner or holds Administrator / Manage Server there.
 *
 * Without this, anyone managing a shop could point thread creation (and the
 * invites the bot mints for it) at any server the bot is in.
 *
 * Returns null when allowed, otherwise a message for the user.
 */
export async function verifyDiscordThreadTarget(
  userId: string,
  serverId: string,
  channelId: string,
): Promise<string | null> {
  const snowflake = /^\d{15,22}$/
  if (!snowflake.test(serverId) || !snowflake.test(channelId)) {
    return "Discord server and channel IDs must be numeric Discord IDs"
  }

  const discordUserId = await profileDb.getUserDiscordId(userId)
  if (!discordUserId) {
    return "Link your Discord account before connecting a Discord server"
  }

  let guild
  let channel
  try {
    ;[guild, channel] = await Promise.all([
      discordService.fetchGuild(serverId),
      discordService.fetchChannel(channelId),
    ])
  } catch {
    return "The SC Market bot is not in that server or cannot see that channel"
  }

  if (channel.guild_id !== guild.id) {
    return "That channel is not in that server"
  }

  if (guild.owner_id === discordUserId) return null

  const member = await discordService.fetchGuildMember(guild.id, discordUserId)
  if (!member) {
    return "You must be a member of that Discord server"
  }

  const memberRoles = new Set([guild.id, ...member.roles]) // guild.id = @everyone
  let permissions = 0n
  for (const role of guild.roles) {
    if (memberRoles.has(role.id)) permissions |= BigInt(role.permissions)
  }
  const allowed =
    (permissions & PermissionFlagsBits.Administrator) !== 0n ||
    (permissions & PermissionFlagsBits.ManageGuild) !== 0n
  return allowed
    ? null
    : "You need Administrator or Manage Server permission in that Discord server"
}
