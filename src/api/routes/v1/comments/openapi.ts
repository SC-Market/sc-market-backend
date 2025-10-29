import {
  oapi,
  Response500,
  Response429Write,
  RateLimitHeaders,
} from "../openapi.js"
import { Response400, Response401, Response403 } from "../openapi.js"

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

export const post_comment_id_reply_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Comment" },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "429": Response429Write,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})

export const post_comment_id_delete_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
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
    "429": Response429Write,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})

export const post_comment_id_update_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
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
    "429": Response429Write,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})

export const post_comment_id_upvote_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
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
    "429": Response429Write,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})

export const post_comment_id_downvote_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
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
    "429": Response429Write,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})
