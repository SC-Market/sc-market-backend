import { oapi } from "../openapi.js"
import {
  Response400,
  Response401,
  Response403,
  Response404,
  Response429Write,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"
import { sortingMethods } from "./controller.js"

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

export const get_posts_spec = oapi.validPath({
  summary: "Get recruiting posts",
  deprecated: false,
  description:
    "Retrieve a paginated list of recruiting posts with search and filtering capabilities",
  operationId: "getRecruitingPosts",
  tags: ["RecruitingPosts", "Recruiting"],
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
      headers: RateLimitHeaders,
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
    "429": Response429Read,
  },
})

export const post_posts_spec = oapi.validPath({
  summary: "Create a recruiting post",
  deprecated: false,
  description: "Create a new recruiting post for a contractor",
  operationId: "createRecruitingPost",
  tags: ["RecruitingPosts", "Recruiting"],
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
      headers: RateLimitHeaders,
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
    "429": Response429Write,
  },
})

export const get_posts_post_id_spec = oapi.validPath({
  summary: "Get recruiting post by ID",
  deprecated: false,
  description: "Retrieve a specific recruiting post by its ID",
  operationId: "getRecruitingPostById",
  tags: ["RecruitingPosts", "Recruiting"],
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
      headers: RateLimitHeaders,
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
    "429": Response429Read,
  },
})

export const get_posts_post_id_comments_spec = oapi.validPath({
  summary: "Get recruiting post comments",
  deprecated: false,
  description: "Retrieve all comments for a specific recruiting post",
  operationId: "getRecruitingPostComments",
  tags: ["RecruitingPosts", "RecruitingPostComments", "Recruiting"],
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
      headers: RateLimitHeaders,
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
    "429": Response429Read,
  },
})

export const get_contractors_spectrum_id_posts_spec = oapi.validPath({
  summary: "Get recruiting post by contractor",
  deprecated: false,
  description: "Retrieve the recruiting post for a specific contractor",
  operationId: "getRecruitingPostByContractor",
  tags: ["RecruitingPosts", "Recruiting"],
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
      headers: RateLimitHeaders,
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
    "429": Response429Read,
  },
})
