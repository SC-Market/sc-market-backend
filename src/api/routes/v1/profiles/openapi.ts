import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response500 as Response500 } from "../openapi.js"
import {
  Response429Read,
  Response429Write,
  Response429Critical,
} from "../openapi.js"
import { SUPPORTED_LOCALES as SUPPORTED_LOCALES } from "../util/i18n.js"

oapi.schema("ProfileUpdateBody", {
  properties: {
    locale: {
      title: "ProfileUpdateBody.locale",
      type: "string",
      enum: [...SUPPORTED_LOCALES],
      description: "User's preferred locale/language",
    },
  },
  required: ["locale"],
  additionalProperties: false,
  title: "ProfileUpdateBody",
  type: "object",
})

oapi.schema("GetCurrentUserProfileSuccess", {
  type: "object",
  title: "GetCurrentUserProfileSuccess",
  description:
    "Current user profile returned by getCurrentUserProfile, syncRSIHandle, and unlinkStarCitizenAccount",
  properties: {
    user_id: {
      type: "string",
      format: "uuid",
      description: "Unique identifier for the user",
    },
    username: {
      type: "string",
      description: "Username",
    },
    display_name: {
      type: "string",
      description: "Display name",
    },
    profile_description: {
      type: "string",
      description: "User profile description",
    },
    role: {
      type: "string",
      enum: ["user", "admin"],
      description: "User role",
    },
    banned: {
      type: "boolean",
      description: "Whether the user is banned",
    },
    balance: {
      type: "number",
      description: "User balance",
    },
    created_at: {
      type: "string",
      format: "date-time",
      description: "Account creation timestamp",
    },
    official_server_id: {
      type: "string",
      nullable: true,
      description: "Discord official server ID",
    },
    discord_thread_channel_id: {
      type: "string",
      nullable: true,
      description: "Discord thread channel ID",
    },
    market_order_template: {
      type: "string",
      description: "Default market order template",
    },
    locale: {
      type: "string",
      enum: [...SUPPORTED_LOCALES],
      description: "Preferred locale",
    },
    contractors: {
      type: "array",
      description: "Contractors the user belongs to",
      items: {
        type: "object",
        properties: {
          contractor_id: { type: "string", format: "uuid" },
          spectrum_id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          avatar: { type: "string" },
          banner: { type: "string" },
          size: { type: "number" },
          role: { type: "string" },
        },
      },
    },
    avatar: {
      type: "string",
      format: "uri",
      description: "Avatar URL",
    },
    banner: {
      type: "string",
      format: "uri",
      description: "Banner URL",
    },
    settings: {
      type: "object",
      description: "User settings",
      properties: {
        discord_order_share: { type: "boolean" },
        discord_public: { type: "boolean" },
      },
    },
    rating: {
      type: "object",
      description: "User rating summary",
      properties: {
        average: { type: "number" },
        count: { type: "number" },
      },
    },
    discord_profile: {
      type: "object",
      nullable: true,
      description: "Linked Discord profile",
      properties: {
        username: { type: "string", nullable: true },
        discriminator: { type: "string", nullable: true },
        id: { type: "string", nullable: true },
      },
    },
  },
  required: [
    "user_id",
    "username",
    "display_name",
    "profile_description",
    "role",
    "banned",
    "balance",
    "created_at",
    "locale",
    "contractors",
    "avatar",
    "banner",
    "settings",
    "rating",
    "discord_profile",
    "market_order_template",
  ],
})

export const profile_post_auth_sync_handle_spec = oapi.validPath({
  summary: "Sync RSI handle from Spectrum profile",
  deprecated: false,
  description:
    "Sync the user's RSI handle and display name from their current Spectrum profile. This updates the handle to match what's currently set in their RSI account. User must already be verified.",
  operationId: "syncRSIHandle",
  tags: ["Profiles"],
  parameters: [],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "RSI handle successfully synced from Spectrum",
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                $ref: "#/components/schemas/GetCurrentUserProfileSuccess",
              },
            },
            required: ["data"],
            type: "object",
          },
        },
      },
    },
    "400": {
      description: "User not eligible for handle sync",
      content: {
        "application/json": {
          schema: {
            properties: {
              message: {
                type: "string",
                example:
                  "User must be already verified with a Spectrum ID to sync handle",
              },
              status: {
                type: "string",
                example: "error",
              },
            },
            required: ["message", "status"],
            type: "object",
          },
        },
      },
    },
    "402": {
      description: "Handle sync failed",
      content: {
        "application/json": {
          schema: {
            properties: {
              message: {
                type: "string",
                example: "Could not fetch current Spectrum profile information",
              },
              status: {
                type: "string",
                example: "error",
              },
            },
            required: ["message", "status"],
            type: "object",
          },
        },
      },
    },
    "401": Response401,
    "429": Response429Read,
    "500": Response500,
  },
  security: [],
})

export const profile_post_auth_unlink_spec = oapi.validPath({
  summary: "Unlink Star Citizen account",
  deprecated: false,
  description:
    "Unlink the user's Star Citizen account, returning them to unverified status and resetting usernames to default values based on their Discord ID.",
  operationId: "unlinkStarCitizenAccount",
  tags: ["Profiles"],
  parameters: [],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "Star Citizen account successfully unlinked",
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                $ref: "#/components/schemas/GetCurrentUserProfileSuccess",
              },
            },
            required: ["data"],
            type: "object",
          },
        },
      },
    },
    "400": {
      description: "User not eligible for account unlink",
      content: {
        "application/json": {
          schema: {
            properties: {
              message: {
                type: "string",
                example:
                  "User is not currently verified with a Star Citizen account",
              },
              status: {
                type: "string",
                example: "error",
              },
            },
            required: ["message", "status"],
            type: "object",
          },
        },
      },
    },
    "401": Response401,
    "429": Response429Read,
    "500": Response500,
  },
  security: [],
})

export const profile_put_root_spec = oapi.validPath({
  summary: "Update user profile",
  deprecated: false,
  description: "Update user profile settings including locale preference",
  operationId: "updateProfile",
  tags: ["Profiles"],
  parameters: [],
  requestBody: {
    content: {
      "application/json": {
        schema: oapi.schema("ProfileUpdateBody"),
      },
    },
  },
  responses: {
    "200": {
      description: "OK - Profile successfully updated",
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Locale updated successfully",
                  },
                  locale: {
                    type: "string",
                    enum: [...SUPPORTED_LOCALES],
                    example: "en",
                  },
                },
                required: ["message", "locale"],
              },
              status: {
                type: "string",
                example: "success",
              },
            },
            required: ["data", "status"],
            type: "object",
            title: "UpdateProfileSuccess",
          },
        },
      },
      headers: {},
    },
    "400": Response400,
    "401": Response401,
    "429": Response429Read,
    "500": Response500,
  },
  security: [],
})

export const profile_post_avatar_spec = oapi.validPath({
  summary: "Upload user profile avatar",
  deprecated: false,
  description:
    "Upload a new avatar image for the authenticated user's profile. The image must be in PNG, JPG, or WEBP format and less than 1MB. The image will be processed through content moderation. Send multipart/form-data with 'avatar' field containing the image file.",
  operationId: "uploadProfileAvatar",
  tags: ["Profiles"],
  parameters: [],
  responses: {
    "200": {
      description: "Avatar uploaded successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              result: {
                type: "string",
                example: "Avatar uploaded successfully",
              },
              resource_id: { type: "string" },
              url: { type: "string", format: "uri" },
            },
            required: ["result", "resource_id", "url"],
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "429": Response429Write,
    "500": Response500,
  },
  security: [{ userAuth: [] }],
})

export const profile_post_banner_spec = oapi.validPath({
  summary: "Upload user profile banner",
  deprecated: false,
  description:
    "Upload a new banner image for the authenticated user's profile. The image must be in PNG, JPG, or WEBP format and less than 2.5MB. The image will be processed through content moderation. Send multipart/form-data with 'banner' field containing the image file.",
  operationId: "uploadProfileBanner",
  tags: ["Profiles"],
  parameters: [],
  responses: {
    "200": {
      description: "Banner uploaded successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              result: {
                type: "string",
                example: "Banner uploaded successfully",
              },
              resource_id: { type: "string" },
              url: { type: "string", format: "uri" },
            },
            required: ["result", "resource_id", "url"],
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "429": Response429Write,
    "500": Response500,
  },
  security: [{ userAuth: [] }],
})

export const profile_get_root_spec = oapi.validPath({
  summary: "Get current user profile",
  deprecated: false,
  description:
    "Retrieve the complete profile information for the authenticated user including contractors, settings, and preferences",
  operationId: "getCurrentUserProfile",
  tags: ["Profiles"],
  parameters: [],
  responses: {
    "200": {
      description: "OK - User profile retrieved successfully",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/GetCurrentUserProfileSuccess",
          },
        },
      },
      headers: {},
    },
    "401": Response401,
    "429": Response429Read,
    "500": Response500,
  },
  security: [],
})

export const profile_get_blocklist_spec = oapi.validPath({
  summary: "Get user's blocklist",
  description: "Retrieve the list of users blocked by the current user",
  operationId: "getUserBlocklist",
  tags: ["Profiles"],
  responses: {
    "200": {
      description: "OK - Blocklist retrieved successfully",
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
                    id: { type: "string", format: "uuid" },
                    blocked_id: { type: "string", format: "uuid" },
                    created_at: { type: "string", format: "date-time" },
                    reason: { type: "string" },
                    blocked_user: {
                      type: "object",
                      properties: {
                        username: { type: "string" },
                        display_name: { type: "string" },
                        avatar: { type: "string" },
                      },
                    },
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
  security: [{ userAuth: [] }],
})

export const profile_post_blocklist_block_spec = oapi.validPath({
  summary: "Block a user",
  description: "Add a user to the current user's blocklist",
  operationId: "blockUser",
  tags: ["Profiles"],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "Username of the user to block",
            },
            reason: {
              type: "string",
              description: "Optional reason for blocking",
            },
          },
          required: ["username"],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "OK - User blocked successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "404": {
      description: "Not Found - User not found",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    "429": Response429Read,
  },
  security: [{ userAuth: [] }],
})

export const profile_delete_blocklist_unblock_username_spec = oapi.validPath({
  summary: "Unblock a user",
  description: "Remove a user from the current user's blocklist",
  operationId: "unblockUser",
  tags: ["Profiles"],
  parameters: [
    {
      name: "username",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Username of the user to unblock",
    },
  ],
  responses: {
    "200": {
      description: "OK - User unblocked successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "404": {
      description: "Not Found - User not found or not blocked",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    "429": Response429Read,
  },
  security: [{ userAuth: [] }],
})
