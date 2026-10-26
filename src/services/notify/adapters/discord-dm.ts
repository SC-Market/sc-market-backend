/** Discord DM from the bot, over REST. Users without a linked Discord account are skipped. */
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10"
import * as profileDb from "../../../api/routes/v1/profiles/database.js"
import { discordService } from "../../discord/discord.service.js"
import type { UserChannelAdapter } from "../channels.js"

export const discordDmAdapter: UserChannelAdapter<RESTPostAPIChannelMessageJSONBody> = {
  id: "discord_dm",
  async send(message, ctx) {
    const discordId = await profileDb.getUserDiscordId(ctx.recipient.userId)
    if (!discordId) return { status: "skipped", reason: "no linked Discord account" }
    const result = await discordService.trySendDirectMessage(discordId, message)
    if (result.ok) return { status: "sent" }
    // 50007: the user does not accept DMs from the bot (or shares no server).
    if (result.code === 50007) return { status: "permanent", error: result.error }
    return { status: "retryable", error: result.error }
  },
}
