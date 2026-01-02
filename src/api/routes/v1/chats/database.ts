/**
 * Chat-related database operations.
 * This module contains all database queries specific to chats and chat participants.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  DBChat,
  DBChatParticipant,
  DBMessage,
} from "../../../../clients/database/db-models.js"
import { MessageBody } from "../api-models.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get a chat by where clause.
 * @throws Error if chat not found
 */
export async function getChat(where: Partial<DBChat>): Promise<DBChat> {
  const chat = await knex()<DBChat>("chats").where(where).first()

  if (!chat) {
    throw new Error("Invalid chat!")
  }

  return chat as DBChat
}

/**
 * Update a chat by where clause.
 */
export async function updateChat(
  where: Partial<DBChat>,
  values: Partial<DBChat>,
): Promise<DBChat[]> {
  return knex()<DBChat>("chats").where(where).update(values).returning("*")
}

/**
 * Get chat participants by where clause.
 * Returns array of user IDs.
 */
export async function getChatParticipants(where: any): Promise<string[]> {
  const res = await knex()<DBChatParticipant>("chat_participants")
    .where(where)
    .select()

  return res.map((r) => r.user_id)
}

/**
 * Get messages by where clause.
 */
export function getMessages(where: Partial<DBMessage>): Promise<DBMessage[]> {
  return knex()<DBMessage>("messages")
    .where(where)
    .orderBy("timestamp", "ASC")
    .select("*")
}

/**
 * Insert a chat with participants.
 */
export async function insertChat(
  participants: string[],
  order_id?: string,
  session_id?: string,
): Promise<DBChat> {
  const chat = (
    await knex()<DBChat>("chats")
      .insert({ order_id, session_id })
      .returning("*")
  )[0]

  for (const participant of participants) {
    await knex()<DBChatParticipant>("chat_participants").insert({
      chat_id: chat.chat_id,
      user_id: participant,
    })
  }

  return chat
}

/**
 * Insert a message.
 */
export async function insertMessage(
  messageBody: MessageBody,
): Promise<DBMessage> {
  return (
    await knex()<DBMessage>("messages").insert(messageBody).returning("*")
  )[0]
}

/**
 * Get the most recent message by where clause.
 */
export async function getMostRecentMessage(
  where: any,
): Promise<DBMessage | undefined> {
  return knex()<DBMessage>("messages")
    .where(where)
    .orderBy("timestamp", "desc")
    .first()
}

/**
 * Get chats by participant user ID.
 */
export async function getChatByParticipant(
  participant: string,
): Promise<DBChat[]> {
  return knex()<DBChat>("chats")
    .join("chat_participants", "chats.chat_id", "chat_participants.chat_id")
    .where({
      "chat_participants.user_id": participant,
    })
    .select("chats.*")
}

/**
 * Add a participant to a chat if they don't already exist.
 * This function is idempotent - safe to call multiple times.
 */
export async function addChatParticipant(
  chat_id: string,
  user_id: string,
): Promise<void> {
  // Check if participant already exists
  const existing = await knex()<DBChatParticipant>("chat_participants")
    .where({
      chat_id,
      user_id,
    })
    .first()

  if (!existing) {
    await knex()<DBChatParticipant>("chat_participants").insert({
      chat_id,
      user_id,
    })
  }
}

/**
 * Add multiple participants to a chat.
 * This function is idempotent - safe to call multiple times.
 */
export async function addChatParticipants(
  chat_id: string,
  user_ids: string[],
): Promise<void> {
  // Filter out null/undefined values
  const validUserIds = user_ids.filter(
    (id): id is string => id !== null && id !== undefined,
  )

  if (validUserIds.length === 0) {
    return
  }

  // Get existing participants to avoid duplicates
  const existing = await knex()<DBChatParticipant>("chat_participants")
    .where({ chat_id })
    .whereIn("user_id", validUserIds)
    .select("user_id")

  const existingUserIds = new Set(existing.map((p) => p.user_id))
  const newUserIds = validUserIds.filter((id) => !existingUserIds.has(id))

  if (newUserIds.length > 0) {
    await knex()<DBChatParticipant>("chat_participants").insert(
      newUserIds.map((user_id) => ({
        chat_id,
        user_id,
      })),
    )
  }
}
