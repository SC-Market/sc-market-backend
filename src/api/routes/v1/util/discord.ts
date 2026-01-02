/**
 * Discord utility functions.
 *
 * Most Discord functions have been moved to DiscordService.
 * This file now only contains re-export of REST client for backward compatibility.
 *
 * @see ../../../../services/discord/discord.service.ts for Discord operations
 */

import { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10"
import {
  discordService,
  rest as serviceRest,
} from "../../../../services/discord/discord.service.js"

/**
 * Re-export Discord REST client for backward compatibility.
 * Some files (knex-db.ts, discord-queue-consumer.ts) still use the REST client directly.
 *
 * @deprecated Import { rest } from services/discord/discord.service.js instead
 */
export const rest = serviceRest

/**
 * @deprecated Use discordService.sendDirectMessage() instead
 * This function is kept for backward compatibility and will be removed in a future version.
 */
export async function sendDM(
  user_id: string,
  message: RESTPostAPIChannelMessageJSONBody,
) {
  await discordService.sendDirectMessage(user_id, message)
}
