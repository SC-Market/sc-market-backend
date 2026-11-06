/**
 * Discord alert channels (destination channel): the bot posts over REST to
 * channels set up with /setup alerts or /setup contracts
 * (discord_channel_setups). The transport is the legacy one
 * (discordService.postChannelMessage): @discordjs/rest, which waits out
 * Discord's rate limits (429 buckets) itself, as before.
 *
 * Failures: Discord's "this channel can't take it" codes (unknown channel or
 * guild, missing access or permissions, a rejected body) and other 4xx are
 * permanent; 429, 5xx and network errors are retryable. DM refusal codes
 * (isDmRefusalCode) are for DMs only and don't apply here.
 */
import { discordService } from "../../discord/discord.service.js"
import type { DestinationAdapter } from "../channels.js"

/**
 * 10003 Unknown Channel, 10004 Unknown Guild, 50001 Missing Access,
 * 50013 Missing Permissions, 50035 Invalid Form Body.
 */
export const PERMANENT_CHANNEL_CODES: readonly number[] = Object.freeze([10003, 10004, 50001, 50013, 50035])

export function isPermanentChannelFailure(code?: number, status?: number): boolean {
  if (code !== undefined && PERMANENT_CHANNEL_CODES.includes(code)) return true
  if (status === undefined) return false
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export const discordChannelAdapter: DestinationAdapter = {
  id: "discord_channel",
  async send(body, destination) {
    if (destination.channel !== "discord_channel") {
      throw new Error(`discord_channel adapter got ${destination.channel}`)
    }
    const r = await discordService.tryPostChannelMessage(destination.channelId, body as never)
    if (r.ok) return { status: "sent" }
    if (r.skipped) return { status: "skipped", reason: r.error }
    return isPermanentChannelFailure(r.code, r.status)
      ? { status: "permanent", error: r.error }
      : { status: "retryable", error: r.error }
  },
}
