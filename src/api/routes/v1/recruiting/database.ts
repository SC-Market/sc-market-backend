/**
 * Recruiting-related database operations.
 * This module contains all database queries specific to recruiting posts,
 * comments, votes, and related functionality.
 */

import { getKnex, database } from "../../../../clients/database/knex-db.js"
import {
  DBRecruitingPost,
  DBComment,
  DBRecruitingVote,
  DBContractor,
} from "../../../../clients/database/db-models.js"
import { RecruitingSearchQuery } from "../../../controllers/recruiting.controller.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get all recruiting posts paginated with search.
 */
export async function getAllRecruitingPostsPaginated(
  searchQuery: RecruitingSearchQuery,
) {
  // ['rating', 'name', 'activity', 'all-time']
  const knexInstance = knex()
  let query = knex()<DBRecruitingPost>("recruiting_posts").whereIn(
    "recruiting_posts.contractor_id",
    knex()("contractors")
      .select("contractor_id")
      .where("contractors.archived", false),
  )

  switch (searchQuery.sorting) {
    case "name":
      query = query
        .join(
          "contractors",
          "contractors.contractor_id",
          "=",
          "recruiting_posts.contractor_id",
        )
        .orderBy("contractors.name", searchQuery.reverseSort ? "asc" : "desc")
      break
    case "rating":
      query = query.orderBy(
        // @ts-ignore
        knex().raw("get_total_rating(null, recruiting_posts.contractor_id)"),
        searchQuery.reverseSort ? "asc" : "desc",
      )
      break
    case "members":
      query = query
        .join(
          "contractors",
          "contractors.contractor_id",
          "=",
          "recruiting_posts.contractor_id",
        )
        .orderBy(
          knex().select(knexInstance.raw(`contractors.size::integer`)),
          searchQuery.reverseSort ? "asc" : "desc",
        )
      break
    case "activity":
      query = query.orderBy(
        knex()("recruiting_votes")
          .where(
            "recruiting_votes.post_id",
            "=",
            knex().raw("recruiting_posts.post_id"),
          )
          .andWhere(
            "recruiting_votes.timestamp",
            ">",
            knex().raw("now() - INTERVAL '1 month'"),
          )
          .count(),
        searchQuery.reverseSort ? "asc" : "desc",
      )
      break
    case "all-time":
      query = query.orderBy(
        knex()("recruiting_votes")
          .where(
            "recruiting_votes.post_id",
            "=",
            knex().raw("recruiting_posts.post_id"),
          )
          .count(),
        searchQuery.reverseSort ? "asc" : "desc",
      )
      break
    case "date":
      query = query
        .join(
          "contractors",
          "contractors.contractor_id",
          "=",
          "recruiting_posts.contractor_id",
        )
        .orderBy(
          "contractors.created_at",
          searchQuery.reverseSort ? "asc" : "desc",
        )
      break
    case "post-date":
      query = query.orderBy(
        "recruiting_posts.timestamp",
        searchQuery.reverseSort ? "asc" : "desc",
      )
      break
    default:
      return []
  }

  if (searchQuery.rating) {
    query = query.where(
      "get_avg_rating(null, recruiting_posts.contractor_id)",
      ">=",
      searchQuery.rating,
    )
  }

  if (searchQuery.fields.length) {
    query = query.where(
      knexInstance.raw(
        "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = recruiting_posts.contractor_id))",
      ),
      "@>",
      searchQuery.fields,
    )
  }

  if (searchQuery.query) {
    query = query.where(function () {
      this.where("body", "ILIKE", "%" + searchQuery.query + "%").orWhere(
        "title",
        "ILIKE",
        "%" + searchQuery.query + "%",
      )
    })
  }

  // Language filtering: filter by contractor's supported languages (OR logic)
  if (searchQuery.language_codes && searchQuery.language_codes.length > 0) {
    // Build array expression using knex().raw() with safe parameter binding
    // Create placeholders for each language code and bind them as parameters
    const placeholders = searchQuery.language_codes.map(() => "?").join(",")
    const languageArrayRaw = knex().raw(
      "ARRAY[" + placeholders + "]::text[]",
      searchQuery.language_codes,
    )
    query = query.andWhereRaw(
      knex().raw(
        "EXISTS (SELECT 1 FROM contractors WHERE contractors.contractor_id = recruiting_posts.contractor_id AND COALESCE(contractors.supported_languages, ARRAY['en']) && ?)",
        [languageArrayRaw],
      ),
    )
  }

  return query
    .limit(searchQuery.pageSize)
    .offset(searchQuery.pageSize * searchQuery.index)
    .select()
}

/**
 * Get recruiting post count.
 */
export async function getRecruitingPostCount() {
  return knex()<{
    count: number
  }>("recruiting_posts")
    .whereIn(
      "recruiting_posts.contractor_id",
      knex()("contractors")
        .select("contractor_id")
        .where("contractors.archived", false),
    )
    .count()
}

/**
 * Get a recruiting post by where clause.
 */
export async function getRecruitingPost(where: any) {
  return knex()<DBRecruitingPost>("recruiting_posts").where(where).first()
}

/**
 * Update a recruiting post.
 */
export async function updateRecruitingPost(where: any, values: any) {
  return knex()<DBRecruitingPost>("recruiting_posts")
    .where(where)
    .update(values)
    .returning("*")
}

/**
 * Get recruiting post comments.
 */
export async function getRecruitingPostComments(where: any) {
  return knex()<DBComment>("comments")
    .join(
      "recruiting_comments",
      "comments.comment_id",
      "=",
      "recruiting_comments.comment_id",
    )
    .where(where)
    .select()
}

/**
 * Insert a recruiting comment.
 */
export async function insertRecruitingComment(values: any) {
  return knex()<{
    comment_id: string
    post_id: string
  }>("recruiting_comments").insert(values)
}

/**
 * Insert a comment.
 */
export async function insertComment(values: any) {
  return knex()<DBComment>("comments").insert(values).returning("*")
}

/**
 * Get a recruiting post vote within the last week.
 */
export async function getRecruitingPostVoteWithinWeek(where: any) {
  return knex()<DBRecruitingVote>("recruiting_votes")
    .where(where)
    .where("timestamp", ">", knex().raw("now() - INTERVAL '1 week'"))
    .first()
}

/**
 * Get recruiting post vote counts by where clause.
 */
export async function getRecruitingPostVoteCounts(where: any) {
  return knex()<{
    upvote: string
    count: number
  }>("recruiting_votes")
    .where(where)
    .groupBy("upvote")
    .count()
    .select("upvote")
}

/**
 * Get all recruiting posts (simple, no pagination).
 */
export async function getAllRecruitingPosts(): Promise<DBRecruitingPost[]> {
  return knex()<DBRecruitingPost>("recruiting_posts").select()
}

/**
 * Add a recruiting post vote.
 */
export async function addRecruitingPostVote(
  values: any,
): Promise<DBRecruitingVote[]> {
  return knex()<DBRecruitingVote>("recruiting_votes")
    .insert(values)
    .returning("*")
}
