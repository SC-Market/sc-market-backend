/** Discord DM from the bot, over REST. Users without a linked Discord account are skipped. */
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10"
import * as profileDb from "../../../api/routes/v1/profiles/database.js"
import { discordService } from "../../discord/discord.service.js"
import { isDmRefusalCode } from "../../discord/dm-attempts.js"
import type { UserChannelAdapter } from "../channels.js"

export const discordDmAdapter: UserChannelAdapter<RESTPostAPIChannelMessageJSONBody> = {
  id: "discord_dm",
  async send(message, ctx) {
    const discordId = await profileDb.getUserDiscordId(ctx.recipient.userId)
    if (!discordId) return { status: "skipped", reason: "no linked Discord account" }
    // Recorded in discord_dm_attempts (sent / failed with Discord's error code).
    const result = await discordService.trySendDirectMessage(discordId, message, {
      userId: ctx.recipient.userId,
      source: `notify:${ctx.eventKey}`,
    })
    if (result.ok) return { status: "sent" }
    // A DM refusal (50007 DMs closed, 50278 no mutual server): retrying won't help.
    if (isDmRefusalCode(result.code)) return { status: "permanent", error: result.error }
    return { status: "retryable", error: result.error }
  },
}
