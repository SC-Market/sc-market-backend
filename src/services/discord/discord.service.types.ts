import {
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIChannelInviteJSONBody,
} from "discord-api-types/v10"
import { DBOfferSession, DBOrder } from "../../clients/database/db-models.js"
import { User } from "../../api/routes/v1/api-models.js"

/**
 * Options for creating Discord invites
 */
export interface DiscordInviteOptions {
  max_age?: number
  max_uses?: number
  temporary?: boolean
  unique?: boolean
}

/**
 * Response from thread creation queue operation
 */
export interface ThreadCreationResult {
  status: "queued" | "failed"
  message: string
}
