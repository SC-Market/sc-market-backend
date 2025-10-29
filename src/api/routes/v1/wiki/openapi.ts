import { adminOapi as adminOapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response500 as Response500, Response429Read, RateLimitHeaders } from "../openapi.js"

adminOapi.schema("WikiImageSearchResult", {
  type: "object",
  properties: {
    id: { type: "number" },
    key: { type: "string" },
    title: { type: "string" },
    excerpt: { type: "string", nullable: true },
    matched_title: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    thumbnail: {
      type: "object",
      nullable: true,
      properties: {
        mimetype: { type: "string" },
        size: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        duration: { type: "number", nullable: true },
        url: { type: "string" },
      },
    },
    images: {
      type: "object",
      nullable: true,
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              imageinfo: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    thumburl: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  required: ["id", "key", "title"],
})

adminOapi.schema("WikiItemSearchResult", {
  type: "object",
  properties: {
    query: {
      type: "object",
      properties: {
        pages: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              pageid: { type: "number" },
              title: { type: "string" },
              extract: { type: "string", nullable: true },
              thumbnail: {
                type: "object",
                nullable: true,
                properties: {
                  source: { type: "string" },
                },
              },
              categories: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
})

export const wiki_get_imagesearch_query_spec = adminOapi.validPath({
  summary: "Search wiki images",
  description: "Search for images in the Star Citizen wiki",
  operationId: "searchWikiImages",
  tags: ["Wiki"],
  parameters: [
    {
      name: "query",
      in: "path",
      required: true,
      schema: { type: "string", minLength: 3 },
      description: "Search query (minimum 3 characters)",
    },
  ],
  responses: {
    "200": {
      description: "Image search results retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/WikiImageSearchResult" },
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "500": Response500,
    "429": Response429Read,
  },
})

export const wiki_get_itemsearch_query_spec = adminOapi.validPath({
  summary: "Search wiki items",
  description: "Search for items and pages in the Star Citizen wiki",
  operationId: "searchWikiItems",
  tags: ["Wiki"],
  parameters: [
    {
      name: "query",
      in: "path",
      required: true,
      schema: { type: "string", minLength: 3 },
      description: "Search query (minimum 3 characters)",
    },
  ],
  responses: {
    "200": {
      description: "Item search results retrieved successfully",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/WikiItemSearchResult" },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "500": Response500,
    "429": Response429Read,
  },
})
