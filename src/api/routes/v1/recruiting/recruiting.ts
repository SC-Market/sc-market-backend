import express from "express"
import { database } from "../../../../clients/database/knex-db.js"
import {
  formatComment,
  formatRecruitingPost,
  FormattedComment,
} from "../util/formatting.js"
import { DBRecruitingPost } from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import { requireRecruitingWrite } from "../../../middleware/auth.js"
import { has_permission } from "../util/permissions.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
} from "../openapi.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import {
  contractorRecruiting,
  valid_recruiting_post,
  valid_recruiting_post_by_contractor,
} from "./middleware.js"

export const recruitingRouter = express.Router()

// OpenAPI Schemas
oapi.schema("RecruitingPost", {
  type: "object",
  title: "RecruitingPost",
  properties: {
    post_id: {
      type: "string",
      format: "uuid",
      title: "RecruitingPost.post_id",
    },
    contractor: {
      $ref: "#/components/schemas/Contractor",
      title: "RecruitingPost.contractor",
    },
    title: {
      type: "string",
      maxLength: 200,
      title: "RecruitingPost.title",
    },
    body: {
      type: "string",
      maxLength: 5000,
      title: "RecruitingPost.body",
    },
    timestamp: {
      type: "string",
      format: "date-time",
      title: "RecruitingPost.timestamp",
    },
    upvotes: {
      type: "integer",
      minimum: 0,
      title: "RecruitingPost.upvotes",
    },
    downvotes: {
      type: "integer",
      minimum: 0,
      title: "RecruitingPost.downvotes",
    },
  },
  required: [
    "post_id",
    "contractor",
    "title",
    "body",
    "timestamp",
    "upvotes",
    "downvotes",
  ],
  additionalProperties: false,
})

oapi.schema("CreateRecruitingPostRequest", {
  type: "object",
  title: "CreateRecruitingPostRequest",
  properties: {
    title: {
      type: "string",
      maxLength: 200,
      minLength: 1,
      title: "CreateRecruitingPostRequest.title",
    },
    body: {
      type: "string",
      maxLength: 5000,
      minLength: 1,
      title: "CreateRecruitingPostRequest.body",
    },
    contractor: {
      type: "string",
      minLength: 3,
      maxLength: 50,
      title: "CreateRecruitingPostRequest.contractor",
    },
  },
  required: ["title", "body", "contractor"],
  additionalProperties: false,
})

oapi.schema("UpdateRecruitingPostRequest", {
  type: "object",
  title: "UpdateRecruitingPostRequest",
  properties: {
    title: {
      type: "string",
      maxLength: 200,
      minLength: 1,
      title: "UpdateRecruitingPostRequest.title",
    },
    body: {
      type: "string",
      maxLength: 5000,
      minLength: 1,
      title: "UpdateRecruitingPostRequest.body",
    },
  },
  required: ["title", "body"],
  additionalProperties: false,
})

oapi.schema("RecruitingComment", {
  type: "object",
  title: "RecruitingComment",
  properties: {
    comment_id: {
      type: "string",
      format: "uuid",
      title: "RecruitingComment.comment_id",
    },
    author: {
      $ref: "#/components/schemas/MinimalUser",
      title: "RecruitingComment.author",
    },
    content: {
      type: "string",
      maxLength: 2000,
      title: "RecruitingComment.content",
    },
    replies: {
      type: "array",
      items: {
        $ref: "#/components/schemas/RecruitingComment",
      },
      title: "RecruitingComment.replies",
    },
    timestamp: {
      type: "string",
      format: "date-time",
      title: "RecruitingComment.timestamp",
    },
    upvotes: {
      type: "integer",
      minimum: 0,
      title: "RecruitingComment.upvotes",
    },
    downvotes: {
      type: "integer",
      minimum: 0,
      title: "RecruitingComment.downvotes",
    },
    deleted: {
      type: "boolean",
      title: "RecruitingComment.deleted",
    },
  },
  required: [
    "comment_id",
    "author",
    "content",
    "timestamp",
    "upvotes",
    "downvotes",
    "deleted",
  ],
  additionalProperties: false,
})

oapi.schema("CreateCommentRequest", {
  type: "object",
  title: "CreateCommentRequest",
  properties: {
    content: {
      type: "string",
      maxLength: 2000,
      minLength: 1,
      title: "CreateCommentRequest.content",
    },
  },
  required: ["content"],
  additionalProperties: false,
})

oapi.schema("VoteRequest", {
  type: "object",
  title: "VoteRequest",
  properties: {
    vote_type: {
      type: "string",
      enum: ["upvote", "downvote"],
      title: "VoteRequest.vote_type",
    },
  },
  required: ["vote_type"],
  additionalProperties: false,
})

const sortingMethods = [
  "rating",
  "name",
  "activity",
  "all-time",
  "members",
  "date",
  "post-date",
]

export interface RecruitingSearchQuery {
  sorting: string
  query: string
  rating: number
  index: number
  fields: string[]
  reverseSort: boolean
  pageSize: number
}

export function convertQuery(query: {
  index?: string
  sorting?: string
  query?: string
  fields?: string
  rating?: string
  pageSize?: string
}): RecruitingSearchQuery {
  const index = +(query.index || 0)
  let sorting = (query.sorting || "name").toLowerCase()
  const reverseSort = sorting.endsWith("-reverse")
  if (reverseSort) {
    sorting = sorting.slice(0, sorting.length - "-reverse".length)
  }

  if (sortingMethods.indexOf(sorting) === -1) {
    sorting = "name"
  }

  const searchQuery = (query.query || "").toLowerCase()
  const fields = query.fields ? query.fields.toLowerCase().split(",") : []
  const rating = +(query.rating || 0)
  const pageSize = +(query.pageSize || 15)
  return {
    index,
    reverseSort,
    sorting,
    query: searchQuery,
    fields,
    rating,
    pageSize,
  }
}

recruitingRouter.get(
  "/posts",
  oapi.validPath({
    summary: "Get recruiting posts",
    deprecated: false,
    description:
      "Retrieve a paginated list of recruiting posts with search and filtering capabilities",
    operationId: "getRecruitingPosts",
    tags: ["Recruiting"],
    parameters: [
      {
        name: "index",
        in: "query",
        description: "Page index (0-based)",
        required: false,
        schema: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
      },
      {
        name: "sorting",
        in: "query",
        description: "Sort method",
        required: false,
        schema: {
          type: "string",
          enum: sortingMethods,
          default: "name",
        },
      },
      {
        name: "query",
        in: "query",
        description: "Search query",
        required: false,
        schema: {
          type: "string",
        },
      },
      {
        name: "fields",
        in: "query",
        description: "Comma-separated list of fields to search",
        required: false,
        schema: {
          type: "string",
        },
      },
      {
        name: "rating",
        in: "query",
        description: "Minimum rating filter",
        required: false,
        schema: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
      },
      {
        name: "pageSize",
        in: "query",
        description: "Number of items per page",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 15,
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successfully retrieved recruiting posts",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                total: {
                  type: "integer",
                  minimum: 0,
                  description: "Total number of posts matching the query",
                },
                items: {
                  type: "array",
                  items: oapi.schema("RecruitingPost"),
                  description: "Array of recruiting posts",
                },
              },
              required: ["total", "items"],
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
    },
  }),
  async function (req, res) {
    // /posts?index=0&reverseSort=false&sorting=rating&query=&fields=&rating=0
    const query = req.query as {
      index?: string
      reverseSort: string
      sorting: string
      query: string
      fields: string
      rating: string
      pageSize: string
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
      posts = await database.getAllRecruitingPostsPaginated(searchData)
    } catch (e) {
      console.error(e)
    }
    const counts = await database.getRecruitingPostCount()
    const formatted = await Promise.all(posts.map(formatRecruitingPost))

    res.json(createResponse({ total: +counts[0].count, items: formatted }))
  },
)

recruitingRouter.post(
  "/posts",
  contractorRecruiting,
  requireRecruitingWrite,
  oapi.validPath({
    summary: "Create a recruiting post",
    deprecated: false,
    description: "Create a new recruiting post for a contractor",
    operationId: "createRecruitingPost",
    tags: ["Recruiting"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("CreateRecruitingPostRequest"),
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Recruiting post successfully created",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: oapi.schema("RecruitingPost"),
              },
              required: ["data"],
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
    },
  }),
  async function (req, res) {
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
      res.status(400).json({ error: "Missing required fields" })
      return
    }

    const contractor_obj = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    const last_post = await database.getRecruitingPost({
      contractor_id: contractor_obj.contractor_id,
    })
    if (last_post) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Cannot create multiple posts" }))
      return
    }

    const posts = await database
      .knex<DBRecruitingPost>("recruiting_posts")
      .insert({ title, body, contractor_id: contractor_obj.contractor_id })
      .returning("*")

    const formatted = await formatRecruitingPost(posts[0])
    res.status(201).json(createResponse(formatted))
  },
)

// TODO: Update doesn't need an ID we can just fetch default

recruitingRouter.get(
  "/posts/:post_id",
  valid_recruiting_post,
  oapi.validPath({
    summary: "Get recruiting post by ID",
    deprecated: false,
    description: "Retrieve a specific recruiting post by its ID",
    operationId: "getRecruitingPostById",
    tags: ["Recruiting"],
    parameters: [
      {
        name: "post_id",
        in: "path",
        description: "The ID of the recruiting post",
        required: true,
        schema: {
          type: "string",
          format: "uuid",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successfully retrieved recruiting post",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: oapi.schema("RecruitingPost"),
              },
              required: ["data"],
            },
          },
        },
      },
      "400": Response400,
      "404": Response404,
    },
  }),
  async function (req, res) {
    const formatted = await formatRecruitingPost(req.recruiting_post!)
    res.json(createResponse(formatted))
  },
)

recruitingRouter.get(
  "/posts/:post_id/comments",
  valid_recruiting_post,
  oapi.validPath({
    summary: "Get recruiting post comments",
    deprecated: false,
    description: "Retrieve all comments for a specific recruiting post",
    operationId: "getRecruitingPostComments",
    tags: ["Recruiting"],
    parameters: [
      {
        name: "post_id",
        in: "path",
        description: "The ID of the recruiting post",
        required: true,
        schema: {
          type: "string",
          format: "uuid",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successfully retrieved comments",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("RecruitingComment"),
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "400": Response400,
      "404": Response404,
    },
  }),
  async function (req, res) {
    const comments_raw = await database.getRecruitingPostComments({
      "recruiting_comments.post_id": req.recruiting_post!.post_id,
      reply_to: null,
    })
    const comments = await Promise.all(comments_raw.map(formatComment))
    comments.sort(
      (a: FormattedComment, b: FormattedComment) =>
        +b.upvotes! - +b.downvotes! - (+a.upvotes! - +a.downvotes!),
    )

    res.json(createResponse(comments))
  },
)

recruitingRouter.put(
  "/posts/:post_id",

  requireRecruitingWrite,
  async function (req, res) {
    const user = req.user as User
    const post_id = req.params["post_id"]
    const post = await database.getRecruitingPost({ post_id })

    if (!post) {
      res.status(400).json(createErrorResponse({ message: "Invalid post" }))
      return
    }

    const contractor = await database.getContractor({
      contractor_id: post.contractor_id,
    })
    if (
      !(await has_permission(
        contractor.contractor_id,
        user.user_id,
        "manage_recruiting",
      ))
    ) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Missing permissions" }))
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
        .json(createErrorResponse({ message: "Missing required fields" }))
      return
    }

    const newValues: { title?: string; body?: string } = {}
    if (title) newValues.title = title
    if (body) newValues.body = body

    const [result] = await database.updateRecruitingPost({ post_id }, newValues)

    res.json(createResponse(result))
  },
)

recruitingRouter.post(
  "/posts/:post_id/upvote",

  requireRecruitingWrite,
  async function (req, res) {
    const post_id = req.params["post_id"]
    const post = await database.getRecruitingPost({ post_id })
    const user = req.user as User

    if (!post) {
      res.status(400).json({ message: "Invalid post" })
      return
    }

    const vote = await database.getRecruitingPostVoteWithinWeek({
      actor_id: user.user_id,
      post_id,
    })
    if (!vote) {
      await database.addRecruitingPostVote({
        actor_id: user.user_id,
        post_id,
        upvote: true,
      })
    }

    res.json({ message: "Success!", already_voted: !!vote })
  },
)

recruitingRouter.post(
  "/posts/:post_id/comment",

  requireRecruitingWrite,
  async function (req, res) {
    const post_id = req.params["post_id"]
    const post = await database.getRecruitingPost({ post_id })
    const user = req.user as User

    if (!post) {
      res.status(400).json({ message: "Invalid post" })
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
      const comment = await database.getComment({ comment_id: reply_to })

      if (!comment) {
        res.status(400).json({ message: "Invalid comment" })
        return
      }

      comments = await database.insertComment({
        author: user.user_id,
        content,
        reply_to,
      })
    } else {
      comments = await database.insertComment({
        author: user.user_id,
        content,
        reply_to,
      })
    }

    await database.insertRecruitingComment({
      post_id,
      comment_id: comments[0].comment_id,
    })

    res.json({ message: "Success!" })
  },
)

recruitingRouter.get(
  "/contractors/:spectrum_id/posts",
  valid_recruiting_post_by_contractor,
  oapi.validPath({
    summary: "Get recruiting post by contractor",
    deprecated: false,
    description: "Retrieve the recruiting post for a specific contractor",
    operationId: "getRecruitingPostByContractor",
    tags: ["Recruiting"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "The Spectrum ID of the contractor",
        required: true,
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successfully retrieved recruiting post",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: oapi.schema("RecruitingPost"),
              },
              required: ["data"],
            },
          },
        },
      },
      "400": Response400,
      "404": Response404,
    },
  }),
  async function (req, res) {
    const formatted = await formatRecruitingPost(req.recruiting_post!)
    res.json(createResponse(formatted))
  },
)
