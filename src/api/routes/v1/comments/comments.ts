import express from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { User } from "../api-models.js"
import { formatComment } from "../util/formatting.js"
import { requireCommentsWrite } from "../../../middleware/auth.js"
import { rate_limit } from "../../../middleware/ratelimiting.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response500,
} from "../openapi.js"

export const commentRouter = express.Router()

// OpenAPI Schema Definitions
oapi.schema("CommentReplyRequest", {
  type: "object",
  properties: {
    content: { type: "string", description: "Comment content" },
  },
  required: ["content"],
})

oapi.schema("CommentUpdateRequest", {
  type: "object",
  properties: {
    content: { type: "string", description: "Updated comment content" },
  },
  required: ["content"],
})

oapi.schema("Comment", {
  type: "object",
  properties: {
    comment_id: { type: "string" },
    author: { type: "string" },
    content: { type: "string" },
    reply_to: { type: "string", nullable: true },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
    deleted: { type: "boolean" },
    upvotes: { type: "number" },
    downvotes: { type: "number" },
  },
  required: [
    "comment_id",
    "author",
    "content",
    "created_at",
    "updated_at",
    "deleted",
    "upvotes",
    "downvotes",
  ],
})

// TODO: Use verifiedUser everywhere

commentRouter.post(
  "/:comment_id/reply",
  oapi.validPath({
    summary: "Reply to a comment",
    description: "Create a reply to an existing comment",
    operationId: "replyToComment",
    tags: ["Comments"],
    parameters: [
      {
        name: "comment_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Comment ID to reply to",
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CommentReplyRequest" },
        },
      },
    },
    responses: {
      "200": {
        description: "Reply created successfully",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Comment" },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [{ bearerAuth: [] }],
  }),
  rate_limit(15),

  requireCommentsWrite,
  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      res.status(400).json({ message: "Invalid comment" })
      return
    }

    const {
      content,
    }: {
      content: string
    } = req.body

    const comments = await database.insertComment({
      author: user.user_id,
      content,
      reply_to: comment.comment_id,
    })

    res.json(await formatComment(comments[0]))
  },
)

commentRouter.post(
  "/:comment_id/delete",
  oapi.validPath({
    summary: "Delete a comment",
    description: "Delete a comment (author or admin only)",
    operationId: "deleteComment",
    tags: ["Comments"],
    parameters: [
      {
        name: "comment_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Comment ID to delete",
      },
    ],
    responses: {
      "200": {
        description: "Comment deleted successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string", example: "Success" },
              },
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [{ bearerAuth: [] }],
  }),

  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      res.status(400).json({ message: "Invalid comment" })
      return
    }

    if (comment.author !== user.user_id && user.role !== "admin") {
      res.status(400).json({ message: "No permissions" })
      return
    }

    await database.updateComments({ comment_id }, { deleted: true })
    res.json({ message: "Success" })
  },
)

commentRouter.post(
  "/:comment_id/update",
  oapi.validPath({
    summary: "Update a comment",
    description: "Update a comment's content (author or admin only)",
    operationId: "updateComment",
    tags: ["Comments"],
    parameters: [
      {
        name: "comment_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Comment ID to update",
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CommentUpdateRequest" },
        },
      },
    },
    responses: {
      "200": {
        description: "Comment updated successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string", example: "Success" },
              },
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [{ bearerAuth: [] }],
  }),
  rate_limit(15),

  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      res.status(400).json({ message: "Invalid comment" })
      return
    }

    if (comment.author !== user.user_id && user.role !== "admin") {
      res.status(400).json({ message: "No permissions" })
      return
    }

    const {
      content,
    }: {
      content: string
    } = req.body

    if (!content) {
      res.status(400).json({ message: "Invalid argument" })
      return
    }

    await database.updateComments({ comment_id }, { content })
    res.json({ message: "Success" })
  },
)

commentRouter.post(
  "/:comment_id/upvote",
  oapi.validPath({
    summary: "Upvote a comment",
    description: "Upvote a comment (toggles if already upvoted)",
    operationId: "upvoteComment",
    tags: ["Comments"],
    parameters: [
      {
        name: "comment_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Comment ID to upvote",
      },
    ],
    responses: {
      "200": {
        description: "Comment upvoted successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string", example: "Success" },
              },
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "500": Response500,
    },
    security: [{ bearerAuth: [] }],
  }),
  rate_limit(1),

  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      res.status(400).json({ message: "Invalid comment" })
      return
    }

    const vote = await database.getCommentVote({
      actor_id: user.user_id,
      comment_id,
    })
    await database.removeCommentVote({ actor_id: user.user_id, comment_id })
    if (!vote || !vote.upvote) {
      await database.addCommentVote({
        actor_id: user.user_id,
        comment_id,
        upvote: true,
      })
    }

    res.json({ message: "Success" })
  },
)

commentRouter.post(
  "/:comment_id/downvote",
  oapi.validPath({
    summary: "Downvote a comment",
    description: "Downvote a comment (toggles if already downvoted)",
    operationId: "downvoteComment",
    tags: ["Comments"],
    parameters: [
      {
        name: "comment_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Comment ID to downvote",
      },
    ],
    responses: {
      "200": {
        description: "Comment downvoted successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string", example: "Success" },
              },
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "500": Response500,
    },
    security: [{ bearerAuth: [] }],
  }),
  rate_limit(1),

  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      res.status(400).json({ message: "Invalid comment" })
      return
    }

    const vote = await database.getCommentVote({
      actor_id: user.user_id,
      comment_id,
    })
    await database.removeCommentVote({ actor_id: user.user_id, comment_id })
    if (!vote || vote.upvote) {
      await database.addCommentVote({
        actor_id: user.user_id,
        comment_id,
        upvote: false,
      })
    }

    res.json({ message: "Success" })
  },
)
