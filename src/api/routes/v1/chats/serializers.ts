import { DBMessage } from "../../../../clients/database/db-models.js"
import { MessageBody } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../profiles/database.js"

export async function serializeMessage(
  msg: DBMessage,
): Promise<MessageBody & { author: string | null }> {
  if (msg.author) {
    const user = await profileDb.getUser({ user_id: msg.author })
    return {
      ...msg,
      author: user!.username,
    }
  } else {
    return {
      ...msg,
      author: null,
    }
  }
}
