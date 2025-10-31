import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import {
  Response404 as Response404,
  Response429Write,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"

export const tokens_post_root_spec = oapi.validPath({
  summary: "Create a new API token",
  description:
    "Create a new API token with specified scopes and contractor access. Users must have manage org permissions for any contractors specified.",
  operationId: "createApiToken",
  tags: ["Tokens"],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["name", "scopes"],
          properties: {
            name: {
              type: "string",
              description: "Name for the API token",
              example: "My API Token",
            },
            description: {
              type: "string",
              description: "Optional description for the API token",
              example: "Token for automated market operations",
            },
            scopes: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "profile:read",
                  "profile:write",
                  "market:read",
                  "market:write",
                  "market:purchase",
                  "market:photos",
                  "orders:read",
                  "orders:write",
                  "orders:reviews",
                  "contractors:read",
                  "contractors:write",
                  "contractors:members",
                  "contractors:webhooks",
                  "contractors:blocklist",
                  "orgs:read",
                  "orgs:write",
                  "orgs:manage",
                  "services:read",
                  "services:write",
                  "services:photos",
                  "offers:read",
                  "offers:write",
                  "chats:read",
                  "chats:write",
                  "notifications:read",
                  "notifications:write",
                  "moderation:read",
                  "moderation:write",
                  "admin:read",
                  "admin:write",
                  "admin:spectrum",
                  "admin:stats",
                  "readonly",
                  "full",
                  "admin",
                ],
              },
              description: "Array of scopes for the token. Admin scopes (admin:*, admin) and moderation scopes (moderation:*) are only available to admin users.",
              example: ["market:read", "orders:write"],
            },
            expires_at: {
              type: "string",
              format: "date-time",
              description: "Optional expiration date for the token",
              example: "2024-12-31T23:59:59Z",
            },
            contractor_spectrum_ids: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Optional array of contractor Spectrum IDs that this token can access",
              example: ["ORG-12345", "ORG-67890"],
            },
          },
        },
      },
    },
  },
  responses: {
    "201": {
      description: "Token created successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  token: {
                    type: "string",
                    description:
                      "The actual token value (only shown on creation)",
                    example: "scm_live_abc123...",
                  },
                  data: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      description: { type: "string", nullable: true },
                      scopes: {
                        type: "array",
                        items: { type: "string" },
                      },
                      contractor_spectrum_ids: {
                        type: "array",
                        items: { type: "string" },
                      },
                      expires_at: { type: "string", nullable: true },
                      created_at: { type: "string" },
                      updated_at: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "429": Response429Write,
  },
  ...RateLimitHeaders,
})

export const tokens_get_root_spec = oapi.validPath({
  summary: "List user's API tokens",
  description: "Retrieve all API tokens belonging to the authenticated user",
  operationId: "listApiTokens",
  tags: ["Tokens"],
  responses: {
    "200": {
      description: "List of tokens",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string", nullable: true },
                    scopes: {
                      type: "array",
                      items: { type: "string" },
                    },
                    contractor_spectrum_ids: {
                      type: "array",
                      items: { type: "string" },
                    },
                    expires_at: { type: "string", nullable: true },
                    created_at: { type: "string" },
                    updated_at: { type: "string" },
                    last_used_at: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "429": Response429Read,
  },
  ...RateLimitHeaders,
})

export const tokens_get_tokenId_spec = oapi.validPath({
  summary: "Get specific API token details",
  description:
    "Retrieve details for a specific API token belonging to the authenticated user",
  operationId: "getApiToken",
  tags: ["Tokens"],
  parameters: [
    {
      name: "tokenId",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "ID of the token to retrieve",
    },
  ],
  responses: {
    "200": {
      description: "Token details",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                  scopes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  contractor_spectrum_ids: {
                    type: "array",
                    items: { type: "string" },
                  },
                  expires_at: { type: "string", nullable: true },
                  created_at: { type: "string" },
                  updated_at: { type: "string" },
                  last_used_at: { type: "string", nullable: true },
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "404": Response404,
    "429": Response429Read,
  },
  ...RateLimitHeaders,
})

export const tokens_put_tokenId_spec = oapi.validPath({
  summary: "Update API token",
  description:
    "Update an existing API token's properties including scopes, expiration, and contractor access",
  operationId: "updateApiToken",
  tags: ["Tokens"],
  parameters: [
    {
      name: "tokenId",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "ID of the token to update",
    },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name for the API token",
              example: "My Updated API Token",
            },
            description: {
              type: "string",
              description: "Optional description for the API token",
              example: "Updated token description",
            },
            scopes: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "profile:read",
                  "profile:write",
                  "market:read",
                  "market:write",
                  "market:purchase",
                  "market:photos",
                  "orders:read",
                  "orders:write",
                  "orders:reviews",
                  "contractors:read",
                  "contractors:write",
                  "contractors:members",
                  "contractors:webhooks",
                  "contractors:blocklist",
                  "orgs:read",
                  "orgs:write",
                  "orgs:manage",
                  "services:read",
                  "services:write",
                  "services:photos",
                  "offers:read",
                  "offers:write",
                  "chats:read",
                  "chats:write",
                  "notifications:read",
                  "notifications:write",
                  "moderation:read",
                  "moderation:write",
                  "admin:read",
                  "admin:write",
                  "admin:spectrum",
                  "admin:stats",
                  "readonly",
                  "full",
                  "admin",
                ],
              },
              description: "Array of scopes for the token. Admin scopes (admin:*, admin) and moderation scopes (moderation:*) are only available to admin users.",
              example: ["market:read", "orders:write"],
            },
            expires_at: {
              type: "string",
              format: "date-time",
              description: "Optional expiration date for the token",
              example: "2024-12-31T23:59:59Z",
            },
            contractor_spectrum_ids: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Optional array of contractor Spectrum IDs that this token can access. Set to null to remove all contractor access.",
              example: ["ORG-12345", "ORG-67890"],
            },
          },
        },
      },
    },
  },
  responses: {
    "200": {
      description: "Token updated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                  scopes: {
                    type: "array",
                    items: { type: "string" },
                  },
                  contractor_spectrum_ids: {
                    type: "array",
                    items: { type: "string" },
                  },
                  expires_at: { type: "string", nullable: true },
                  created_at: { type: "string" },
                  updated_at: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Write,
  },
  ...RateLimitHeaders,
})

export const tokens_delete_tokenId_spec = oapi.validPath({
  summary: "Revoke API token",
  description: "Permanently revoke an API token, making it unusable",
  operationId: "revokeApiToken",
  tags: ["Tokens"],
  parameters: [
    {
      name: "tokenId",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "ID of the token to revoke",
    },
  ],
  responses: {
    "200": {
      description: "Token revoked successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Token revoked successfully" },
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "404": Response404,
    "429": Response429Write,
  },
  ...RateLimitHeaders,
})

export const tokens_post_tokenId_extend_spec = oapi.validPath({
  summary: "Extend API token expiration",
  description: "Extend the expiration date of an existing API token",
  operationId: "extendApiToken",
  tags: ["Tokens"],
  parameters: [
    {
      name: "tokenId",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "ID of the token to extend",
    },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["expires_at"],
          properties: {
            expires_at: {
              type: "string",
              format: "date-time",
              description: "New expiration date for the token",
              example: "2025-12-31T23:59:59Z",
            },
          },
        },
      },
    },
  },
  responses: {
    "200": {
      description: "Token expiration extended successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Token expiration extended",
                  },
                },
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "404": Response404,
    "429": Response429Write,
  },
  ...RateLimitHeaders,
})

export const tokens_get_tokenId_stats_spec = oapi.validPath({
  summary: "Get API token usage statistics",
  description: "Retrieve usage statistics for a specific API token",
  operationId: "getApiTokenStats",
  tags: ["Tokens"],
  parameters: [
    {
      name: "tokenId",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "ID of the token to get stats for",
    },
  ],
  responses: {
    "200": {
      description: "Token statistics",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  created_at: { type: "string" },
                  last_used_at: { type: "string", nullable: true },
                  expires_at: { type: "string", nullable: true },
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "404": Response404,
    "429": Response429Read,
  },
  ...RateLimitHeaders,
})

export const tokens_get_scopes_spec = oapi.validPath({
  summary: "Get available scopes",
  description:
    "Retrieve list of available scopes for the authenticated user. Scopes are automatically filtered based on user role (admin-only scopes are excluded for non-admin users).",
  operationId: "getAvailableScopes",
  tags: ["Tokens"],
  responses: {
    "200": {
      description: "List of available scopes",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  scopes: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Array of scope names available to the current user",
                  },
                },
              },
            },
          },
        },
      },
    },
    "401": Response401,
    "429": Response429Read,
  },
  ...RateLimitHeaders,
})
