import { oapi } from "../openapi.js"
import {
  Response400,
  Response401,
  Response404,
  Response409,
  Response500,
  Response429CommonWrite,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"

// Schemas
oapi.schema("AddEmailRequest", {
  type: "object",
  title: "AddEmailRequest",
  description: "Request to add email address with notification preferences",
  properties: {
    email: {
      type: "string",
      format: "email",
      description: "Email address to add",
    },
    notificationTypeIds: {
      type: "array",
      description: "Array of notification action type IDs to enable",
      items: {
        type: "integer",
      },
    },
  },
  required: ["email"],
})

oapi.schema("AddEmailResponse", {
  type: "object",
  title: "AddEmailResponse",
  properties: {
    email_id: {
      type: "string",
      format: "uuid",
      description: "Unique identifier for the email record",
    },
    email: {
      type: "string",
      format: "email",
      description: "Email address",
    },
    email_verified: {
      type: "boolean",
      description: "Whether the email is verified",
    },
    preferences_created: {
      type: "integer",
      description: "Number of notification preferences created",
    },
    message: {
      type: "string",
      description: "Success message",
    },
  },
  required: [
    "email_id",
    "email",
    "email_verified",
    "preferences_created",
    "message",
  ],
})

oapi.schema("UpdateEmailRequest", {
  type: "object",
  title: "UpdateEmailRequest",
  properties: {
    email: {
      type: "string",
      format: "email",
      description: "New email address",
    },
  },
  required: ["email"],
})

oapi.schema("EmailPreference", {
  type: "object",
  title: "EmailPreference",
  description: "Email notification preference for a specific action type",
  properties: {
    preference_id: {
      type: "string",
      format: "uuid",
    },
    action_type_id: {
      type: "integer",
      description: "Notification action type ID",
    },
    action_name: {
      type: "string",
      nullable: true,
      description: "Notification action name (e.g., 'order_create')",
    },
    enabled: {
      type: "boolean",
      description: "Whether email notifications are enabled",
    },
    frequency: {
      type: "string",
      enum: ["immediate", "daily", "weekly"],
      description: "Email frequency",
    },
    digest_time: {
      type: "string",
      nullable: true,
      format: "time",
      description: "Time for daily/weekly digests (HH:MM:SS format)",
    },
    created_at: {
      type: "string",
      format: "date-time",
    },
    updated_at: {
      type: "string",
      format: "date-time",
    },
  },
  required: [
    "preference_id",
    "action_type_id",
    "enabled",
    "frequency",
    "created_at",
    "updated_at",
  ],
})

oapi.schema("EmailPreferencesResponse", {
  type: "object",
  title: "EmailPreferencesResponse",
  properties: {
    preferences: {
      type: "array",
      items: {
        $ref: "#/components/schemas/EmailPreference",
      },
    },
    email: {
      type: "object",
      nullable: true,
      properties: {
        email_id: {
          type: "string",
          format: "uuid",
        },
        email: {
          type: "string",
          format: "email",
        },
        email_verified: {
          type: "boolean",
        },
        is_primary: {
          type: "boolean",
        },
      },
      required: ["email_id", "email", "email_verified", "is_primary"],
    },
  },
  required: ["preferences", "email"],
})

oapi.schema("UpdateEmailPreferencesRequest", {
  type: "object",
  title: "UpdateEmailPreferencesRequest",
  properties: {
    preferences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action_type_id: {
            type: "integer",
          },
          enabled: {
            type: "boolean",
          },
          frequency: {
            type: "string",
            enum: ["immediate", "daily", "weekly"],
          },
          digest_time: {
            type: "string",
            nullable: true,
            format: "time",
          },
        },
        required: ["action_type_id"],
      },
    },
  },
  required: ["preferences"],
})

// Endpoint specs
export const add_email_spec = oapi.path({
  tags: ["Email"],
  summary: "Add email address",
  description:
    "Add an email address to your account and select which notification types to enable. A verification email will be sent.",
  requestBody: {
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/AddEmailRequest",
        },
      },
    },
  },
  responses: {
    201: {
      description: "Email address added successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/AddEmailResponse",
          },
        },
      },
    },
    400: Response400,
    401: Response401,
    409: Response409,
    429: Response429CommonWrite,
    500: Response500,
  },
})

export const update_email_spec = oapi.path({
  tags: ["Email"],
  summary: "Update email address",
  description:
    "Update your email address. The new address will need to be verified.",
  requestBody: {
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/UpdateEmailRequest",
        },
      },
    },
  },
  responses: {
    200: {
      description: "Email address updated successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/AddEmailResponse",
          },
        },
      },
    },
    400: Response400,
    401: Response401,
    404: Response404,
    409: Response409,
    429: Response429CommonWrite,
    500: Response500,
  },
})

export const delete_email_spec = oapi.path({
  tags: ["Email"],
  summary: "Remove email address",
  description:
    "Remove your email address and all email notification preferences.",
  responses: {
    200: {
      description: "Email address removed successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
              },
            },
          },
        },
      },
    },
    401: Response401,
    404: Response404,
    429: Response429CommonWrite,
    500: Response500,
  },
})

export const request_verification_spec = oapi.path({
  tags: ["Email"],
  summary: "Request verification email",
  description: "Request a new verification email to be sent.",
  responses: {
    200: {
      description: "Verification email sent",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
              },
            },
          },
        },
      },
    },
    401: Response401,
    404: Response404,
    429: Response429CommonWrite,
    500: Response500,
  },
})

export const verify_email_spec = oapi.path({
  tags: ["Email"],
  summary: "Verify email address",
  description:
    "Verify email address using verification token. Redirects to frontend.",
  parameters: [
    {
      name: "token",
      in: "path",
      required: true,
      schema: {
        type: "string",
      },
      description: "Email verification token",
    },
  ],
  responses: {
    302: {
      description: "Redirects to frontend with success/error query parameter",
    },
  },
})

export const get_email_preferences_spec = oapi.path({
  tags: ["Email"],
  summary: "Get email notification preferences",
  description:
    "Get all email notification preferences for the authenticated user.",
  responses: {
    200: {
      description: "Email preferences retrieved successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/EmailPreferencesResponse",
          },
        },
      },
    },
    401: Response401,
    429: Response429Read,
    500: Response500,
  },
})

export const update_email_preferences_spec = oapi.path({
  tags: ["Email"],
  summary: "Update email notification preferences",
  description:
    "Update email notification preferences for one or more notification types.",
  requestBody: {
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/UpdateEmailPreferencesRequest",
        },
      },
    },
  },
  responses: {
    200: {
      description: "Preferences updated successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              preferences: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/EmailPreference",
                },
              },
              message: {
                type: "string",
              },
            },
          },
        },
      },
    },
    400: Response400,
    401: Response401,
    429: Response429CommonWrite,
    500: Response500,
  },
})

export const unsubscribe_spec = oapi.path({
  tags: ["Email"],
  summary: "Unsubscribe from email notifications",
  description:
    "Unsubscribe from email notifications using unsubscribe token. Redirects to frontend.",
  parameters: [
    {
      name: "token",
      in: "path",
      required: true,
      schema: {
        type: "string",
      },
      description: "Unsubscribe token",
    },
  ],
  responses: {
    302: {
      description: "Redirects to frontend unsubscribe page",
    },
  },
})
