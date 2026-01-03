import { RequestHandler } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import * as recruitingDb from "./database.js"
import * as contractorDb from "../contractors/database.js"
import * as commentDb from "../comments/database.js"
import {
  formatComment,
  formatRecruitingPost,
  FormattedComment,
} from "../util/formatting.js"
import { DBRecruitingPost } from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import { has_permission } from "../util/permissions.js"
import {
  createErrorResponse,
  createResponse,
  createForbiddenErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"

// Types
export interface RecruitingSearchQuery {
  sorting: string
  query: string
  rating: number
  index: number
  fields: string[]
  reverseSort: boolean
  pageSize: number
  language_codes?: string[]
}

// Utility functions and constants
// Base sorting methods (without -reverse suffix)
const baseSortingMethods = [
  "rating",
  "name",
  "activity",
  "all-time",
  "members",
  "date",
  "post-date",
]

// All valid sorting methods including reverse variants (for OpenAPI enum)
export const sortingMethods = [
  ...baseSortingMethods,
  ...baseSortingMethods.map((method) => `${method}-reverse`),
]

export function convertQuery(query: {
  index?: string
  sorting?: string
  query?: string
  fields?: string
  rating?: string
  pageSize?: string
  language_codes?: string
}): RecruitingSearchQuery {
  const index = +(query.index || 0)
  let sorting = (query.sorting || "name").toLowerCase()
  const reverseSort = sorting.endsWith("-reverse")
  if (reverseSort) {
    sorting = sorting.slice(0, sorting.length - "-reverse".length)
  }

  // Validate against base sorting methods (without -reverse)
  if (baseSortingMethods.indexOf(sorting) === -1) {
    sorting = "name"
  }

  const searchQuery = (query.query || "").toLowerCase()
  const fields = query.fields ? query.fields.toLowerCase().split(",") : []
  const rating = +(query.rating || 0)
  const pageSize = +(query.pageSize || 15)
  const language_codes = query.language_codes
    ? query.language_codes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined
  return {
    index,
    reverseSort,
    sorting,
    query: searchQuery,
    fields,
    rating,
    pageSize,
    language_codes:
      language_codes && language_codes.length > 0 ? language_codes : undefined,
  }
}

export const get_posts: RequestHandler = async function (req, res) {
  // /posts?index=0&reverseSort=false&sorting=rating&query=&fields=&rating=0
  const query = req.query as {
    index?: string
    reverseSort: string
    sorting: string
    query: string
    fields: string
    rating: string
    pageSize: string
    language_codes?: string
  }

  const searchData = convertQuery(query)

  /*
    SELECT recruiting_posts.*
                    FROM recruiting_posts
                    ORDER BY (SELECT COUNT(*) FROM recruiting_votes rv WHERE rv.post_id = recruiting_posts.post_id)
                    LIMIT 15
                    OFFSET 0;
     */

  let posts: DBRecruitingPost[] = []
  try {
    posts = await recruitingDb.getAllRecruitingPostsPaginated(searchData)
  } catch (e) {
    logger.error("Error fetching recruiting posts", { error: e })
  }
  const counts = await recruitingDb.getRecruitingPostCount()
  const formatted = await Promise.all(posts.map(formatRecruitingPost))

  res.json(createResponse({ total: +counts[0].count, items: formatted }))
}

export const post_posts: RequestHandler = async function (req, res) {
  const {
    title,
    body,
    contractor: spectrum_id,
  }: {
    title: string
    body: string
    contractor: string
  } = req.body

  if (!title || !body || !spectrum_id) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Missing required fields",
        ),
      )
    return
  }

  const contractor_obj = await contractorDb.getContractor({
    spectrum_id: spectrum_id,
  })
  if (contractor_obj.archived) {
    res
      .status(409)
      .json(
        createErrorResponse(
          ErrorCode.CONFLICT,
          "Archived organizations cannot create recruiting posts",
        ),
      )
    return
  }
  const last_post = await recruitingDb.getRecruitingPost({
    contractor_id: contractor_obj.contractor_id,
  })
  if (last_post) {
    res
      .status(400)
      .json(
        createErrorResponse(ErrorCode.CONFLICT, "Cannot create multiple posts"),
      )
    return
  }

  const posts = await database
    .knex<DBRecruitingPost>("recruiting_posts")
    .insert({ title, body, contractor_id: contractor_obj.contractor_id })
    .returning("*")

  const formatted = await formatRecruitingPost(posts[0])
  res.status(201).json(createResponse(formatted))
}

export const get_posts_post_id: RequestHandler = async function (req, res) {
  const formatted = await formatRecruitingPost(req.recruiting_post!)
  res.json(createResponse(formatted))
}

export const get_posts_post_id_comments: RequestHandler = async function (
  req,
  res,
) {
  const comments_raw = await recruitingDb.getRecruitingPostComments({
    "recruiting_comments.post_id": req.recruiting_post!.post_id,
    reply_to: null,
  })
  const comments = await Promise.all(comments_raw.map(formatComment))
  comments.sort(
    (a: FormattedComment, b: FormattedComment) =>
      +b.upvotes! - +b.downvotes! - (+a.upvotes! - +a.downvotes!),
  )

  res.json(createResponse(comments))
}

export const put_posts_post_id: RequestHandler = async function (req, res) {
  const user = req.user as User
  const post_id = req.params["post_id"]
  const post = await recruitingDb.getRecruitingPost({ post_id })

  if (!post) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid post"))
    return
  }

  const contractor = await contractorDb.getContractor({
    contractor_id: post.contractor_id,
  })
  if (contractor.archived) {
    res
      .status(409)
      .json(
        createErrorResponse(
          ErrorCode.CONFLICT,
          "Archived organizations cannot update recruiting posts",
        ),
      )
    return
  }
  if (
    !(await has_permission(
      contractor.contractor_id,
      user.user_id,
      "manage_recruiting",
    ))
  ) {
    res.status(400).json(createForbiddenErrorResponse("Missing permissions"))
    return
  }

  const {
    title,
    body,
  }: {
    title: string
    body: string
  } = req.body

  if (!title && !body) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Missing required fields",
        ),
      )
    return
  }

  const newValues: { title?: string; body?: string } = {}
  if (title) newValues.title = title
  if (body) newValues.body = body

  const [result] = await recruitingDb.updateRecruitingPost(
    { post_id },
    newValues,
  )

  res.json(createResponse(result))
}

export const post_posts_post_id_upvote: RequestHandler = async function (
  req,
  res,
) {
  const post_id = req.params["post_id"]
  const post = await recruitingDb.getRecruitingPost({ post_id })
  const user = req.user as User

  if (!post) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid post"))
    return
  }

  const vote = await recruitingDb.getRecruitingPostVoteWithinWeek({
    actor_id: user.user_id,
    post_id,
  })
  if (!vote) {
    await recruitingDb.addRecruitingPostVote({
      actor_id: user.user_id,
      post_id,
      upvote: true,
    })
  }

  res.json({ message: "Success!", already_voted: !!vote })
}

export const post_posts_post_id_comment: RequestHandler = async function (
  req,
  res,
) {
  const post_id = req.params["post_id"]
  const post = await recruitingDb.getRecruitingPost({ post_id })
  const user = req.user as User

  if (!post) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid post"))
    return
  }

  const {
    content,
    reply_to,
  }: {
    content: string
    reply_to?: string
  } = req.body

  let comments
  if (reply_to) {
    const comment = await commentDb.getComment({ comment_id: reply_to })

    if (!comment) {
      res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid comment"),
        )
      return
    }

    comments = await recruitingDb.insertComment({
      author: user.user_id,
      content,
      reply_to,
    })
  } else {
    comments = await recruitingDb.insertComment({
      author: user.user_id,
      content,
      reply_to,
    })
  }

  await recruitingDb.insertRecruitingComment({
    post_id,
    comment_id: comments[0].comment_id,
  })

  res.json({ message: "Success!" })
}

export const get_contractors_spectrum_id_posts: RequestHandler =
  async function (req, res) {
    const formatted = await formatRecruitingPost(req.recruiting_post!)
    res.json(createResponse(formatted))
  }
