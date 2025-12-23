/**
 * Comment-related database operations.
 * This module contains all database queries specific to comments,
 * comment votes, and related functionality.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  DBComment,
  DBCommentVote,
} from "../../../../clients/database/db-models.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Insert a comment.
 */
export async function insertComment(values: any) {
  return knex()<DBComment>("comments").insert(values).returning("*")
}

/**
 * Get comments by where clause.
 */
export async function getComments(where: Partial<DBComment>) {
  return knex()<DBComment>("comments").where(where).select()
}

/**
 * Get a comment by where clause.
 */
export async function getComment(where: any) {
  return knex()<DBComment>("comments").where(where).first()
}

/**
 * Update comments by where clause.
 */
export async function updateComments(where: any, values: any) {
  return knex()<DBComment>("comments")
    .where(where)
    .update(values)
    .returning("*")
}

/**
 * Get comment vote counts by where clause.
 */
export async function getCommentVoteCounts(where: any) {
  return knex()<{
    upvote: string
    count: number
  }>("comment_votes")
    .where(where)
    .groupBy("upvote")
    .count()
    .select("upvote")
}

/**
 * Get a comment vote by where clause.
 */
export async function getCommentVote(where: any) {
  return knex()<DBCommentVote>("comment_votes").where(where).first()
}

/**
 * Add a comment vote.
 */
export async function addCommentVote(values: any) {
  return knex()<DBCommentVote>("comment_votes").insert(values).returning("*")
}

/**
 * Remove a comment vote by where clause.
 */
export async function removeCommentVote(where: any) {
  return knex()<DBCommentVote>("comment_votes").where(where).delete()
}

/**
 * Insert a like (for posts/comments).
 */
export async function insertLike(body: {
  post_id: string
  user_id: string
}): Promise<void> {
  return knex()("likes").insert(body)
}
