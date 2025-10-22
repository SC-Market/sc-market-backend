import openapi from "@wesleytodd/openapi"
import { OpenAPIV3 } from "openapi-types"
import { env } from "../../../config/env.js"

const document: OpenAPIV3.Document = {
  openapi: "3.1.0",
  info: {
    title: "SC Market OpenAPI Definition",
    description: "The API for the SC Market site",
    version: "1.0.0",
  },
  paths: {},
  components: {
    schemas: {
      AvailabilityEntry: {
        type: "object",
        properties: {
          start: {
            type: "integer",
            minimum: 0,
          },
          finish: {
            type: "integer",
            minimum: 0,
          },
        },
        required: ["start", "finish"],
      },
      OrderAvailability: {
        type: "object",
        properties: {
          customer: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AvailabilityEntry",
            },
          },
          assigned: {
            type: "array",
            items: {
              $ref: "#/components/schemas/AvailabilityEntry",
            },
          },
        },
        required: ["customer", "assigned"],
      },
      OrderUserApplicant: {
        type: "object",
        properties: {
          user: {
            type: "string",
          },
        },
        required: ["user"],
      },
      OrderContractorApplicant: {
        type: "object",
        properties: {
          contractor: {
            type: "string",
          },
        },
        required: ["contractor"],
      },
      OrderReview: {
        properties: {
          user_author: {
            $ref: "#/components/schemas/MinimalUser",
            title: "OrderReview.user_author",
          },
          contractor_author: {
            $ref: "#/components/schemas/MinimalContractor",
            title: "OrderReview.contractor_author",
          },
          content: {
            title: "OrderReview.content",
            type: "string",
          },
          timestamp: {
            title: "OrderReview.timestamp",
            type: "number",
          },
          review_id: {
            title: "OrderReview.review_id",
            type: "string",
          },
          order_id: {
            title: "OrderReview.order_id",
            type: "string",
          },
          rating: {
            title: "OrderReview.rating",
            type: "number",
          },
        },
        required: [
          "user_author",
          "contractor_author",
          "content",
          "timestamp",
          "review_id",
          "order_id",
          "rating",
        ],
        additionalProperties: false,
        title: "OrderReview",
        type: "object",
      },
      Rating: {
        properties: {
          avg_rating: {
            title: "Rating.avg_rating",
            type: "number",
          },
          rating_count: {
            title: "Rating.rating_count",
            type: "integer",
            minimum: 0,
          },
          streak: {
            title: "Rating.streak",
            type: "integer",
            minimum: 0,
          },
          total_orders: {
            title: "Rating.total_orders",
            type: "integer",
            minimum: 0,
          },
        },
        required: ["avg_rating", "rating_count", "streak", "total_orders"],
        additionalProperties: false,
        title: "Rating",
        type: "object",
      },
      MinimalUser: {
        properties: {
          username: {
            title: "MinimalUser.username",
            type: "string",
            minLength: 3,
            maxLength: 30,
          },
          display_name: {
            title: "MinimalUser.display_name",
            type: "string",
            minLength: 3,
            maxLength: 50,
          },
          avatar: {
            title: "MinimalUser.avatar",
            type: "string",
          },
          rating: {
            $ref: "#/components/schemas/Rating",
            title: "Contractor.rating",
          },
          discord_profile: {
            properties: {
              id: {
                title: "MinimalUser.discord_profile.id",
                type: "string",
              },
              discriminator: {
                title: "MinimalUser.discord_profile.discriminator",
                type: "string",
              },
              username: {
                title: "MinimalUser.discord_profile.username",
                type: "string",
              },
            },
            required: ["id", "discriminator", "username"],
            additionalProperties: false,
            title: "MinimalUser.discord_profile",
            type: "object",
            nullable: true,
          },
        },
        required: ["username", "display_name", "avatar", "rating"],
        additionalProperties: false,
        title: "MinimalUser",
        type: "object",
      },
      MinimalContractor: {
        properties: {
          avatar: {
            title: "MinimalContractor.avatar",
            type: "string",
          },
          name: {
            title: "MinimalContractor.name",
            type: "string",
            minLength: 3,
            maxLength: 50,
          },
          spectrum_id: {
            title: "MinimalContractor.spectrum_id",
            type: "string",
            minLength: 3,
          },
          rating: {
            $ref: "#/components/schemas/Rating",
            title: "Contractor.rating",
          },
        },
        required: ["avatar", "name", "spectrum_id", "rating"],
        additionalProperties: false,
        title: "MinimalContractor",
        type: "object",
      },
      ServiceStatus: {
        enum: ["active", "inactive"],
        title: "ServiceStatus",
        type: "string",
      },
      Service: {
        properties: {
          service_id: {
            title: "Service.service_id",
            type: "string",
          },
          service_name: {
            title: "Service.service_name",
            type: "string",
          },
          service_description: {
            title: "Service.service_description",
            type: "string",
          },
          title: {
            type: "string",
            title: "Service.title",
          },
          rush: {
            title: "Service.rush",
            type: "boolean",
          },
          description: {
            title: "Order.description",
            type: "string",
          },
          kind: {
            type: "string",
            title: "Service.kind",
          },
          collateral: {
            title: "Service.collateral",
            type: "number",
            minimum: 0,
          },
          offer: {
            title: "Service.offer",
            type: "number",
            minimum: 0,
          },
          payment_type: {
            enum: ["one-time", "daily", "hourly"],
            title: "Order.payment_type",
            type: "string",
          },
          departure: {
            title: "OrderBody.departure",
            type: "string",
            nullable: true,
            maxLength: 30,
          },
          destination: {
            title: "OrderBody.destination",
            type: "string",
            nullable: true,
            maxLength: 30,
          },
          cost: {
            title: "Service.cost",
            type: "number",
            minimum: 0,
          },
          user: {
            title: "Service.user",
            type: "string",
            nullable: true,
          },
          contractor: {
            title: "Service.contractor",
            type: "string",
            nullable: true,
          },
          status: {
            $ref: "#/components/schemas/ServiceStatus",
            title: "Service.status",
          },
          timestamp: {
            title: "Order.timestamp",
            type: "string",
          },
          photos: {
            type: "array",
            items: {
              type: "string",
              format: "url",
            },
          },
        },
        required: [
          "order_id",
          "status",
          "kind",
          "cost",
          "rush",
          "assigned_to",
          "contractor",
          "customer",
          "title",
          "description",
          "timestamp",
          "comments",
          "applicants",
          "payment_type",
          "offer_session_id",
        ],
        additionalProperties: false,
        title: "Order",
        type: "object",
      },
      BadRequest: {
        properties: {
          errors: {
            items: {
              properties: {
                message: {
                  type: "string",
                },
              },
              required: ["message"],
              type: "object",
            },
            type: "array",
          },
          message: {
            type: "string",
          },
        },
        required: ["message"],
        type: "object",
      },
      Conflict: {
        properties: {
          message: {
            default: "Conflict",
            enum: ["Conflict"],
            type: "string",
          },
        },
        required: ["message"],
        type: "object",
      },
      Forbidden: {
        properties: {
          message: {
            default: "Forbidden",
            enum: ["Forbidden"],
            type: "string",
          },
        },
        required: ["message"],
        type: "object",
      },
      NotFound: {
        properties: {
          message: {
            default: "Not Found",
            enum: ["Not Found"],
            type: "string",
          },
        },
        required: ["message"],
        type: "object",
      },
      Unauthorized: {
        properties: {
          message: {
            default: "Unauthorized",
            enum: ["Unauthorized"],
            type: "string",
          },
        },
        required: ["message"],
        type: "object",
      },
      ServerError: {
        properties: {
          message: {
            default: "Internal Server Error",
            enum: ["Internal Server Error"],
            type: "string",
          },
        },
        required: ["message"],
        type: "object",
      },
      PhotoUploadResponse: {
        type: "object",
        title: "PhotoUploadResponse",
        properties: {
          result: {
            type: "string",
            description: "Success message",
            example: "Photos uploaded successfully",
          },
          photos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                resource_id: {
                  type: "string",
                  description: "Unique identifier for the uploaded photo",
                },
                url: {
                  type: "string",
                  format: "uri",
                  description: "CDN URL for the uploaded photo",
                },
              },
              required: ["resource_id", "url"],
            },
          },
        },
        required: ["result", "photos"],
      },
      PhotoUploadError: {
        type: "object",
        title: "PhotoUploadError",
        properties: {
          error: {
            type: "string",
            description: "Error message describing what went wrong",
          },
        },
        required: ["error"],
      },
    },
  },
  servers: [
    {
      url: "https://api.sc-market.space",
      description: "Prod Env",
    },
  ],
}

const adminDocument: OpenAPIV3.Document = {
  openapi: "3.1.0",
  info: {
    title: "SC Market OpenAPI Definition",
    description: "The internal API for the SC Market site",
    version: "1.0.0",
  },
  paths: {},
  components: {
    schemas: {
      MinimalUser: {
        properties: {
          username: {
            title: "MinimalUser.username",
            type: "string",
            minLength: 3,
            maxLength: 30,
          },
          display_name: {
            title: "MinimalUser.display_name",
            type: "string",
            minLength: 3,
            maxLength: 50,
          },
          avatar: {
            title: "MinimalUser.avatar",
            type: "string",
          },
          rating: {
            $ref: "#/components/schemas/Rating",
            title: "Contractor.rating",
          },
          discord_profile: {
            properties: {
              id: {
                title: "MinimalUser.discord_profile.id",
                type: "string",
              },
              discriminator: {
                title: "MinimalUser.discord_profile.discriminator",
                type: "string",
              },
              username: {
                title: "MinimalUser.discord_profile.username",
                type: "string",
              },
            },
            required: ["id", "discriminator", "username"],
            additionalProperties: false,
            title: "MinimalUser.discord_profile",
            type: "object",
            nullable: true,
          },
        },
        required: ["username", "display_name", "avatar", "rating"],
        additionalProperties: false,
        title: "MinimalUser",
        type: "object",
      },
      MinimalContractor: {
        properties: {
          avatar: {
            title: "MinimalContractor.avatar",
            type: "string",
          },
          name: {
            title: "MinimalContractor.name",
            type: "string",
            minLength: 3,
            maxLength: 50,
          },
          spectrum_id: {
            title: "MinimalContractor.spectrum_id",
            type: "string",
            minLength: 3,
          },
          rating: {
            $ref: "#/components/schemas/Rating",
            title: "Contractor.rating",
          },
        },
        required: ["avatar", "name", "spectrum_id", "rating"],
        additionalProperties: false,
        title: "MinimalContractor",
        type: "object",
      },
    },
  },
  servers: [
    {
      url: "https://api.sc-market.space",
      description: "Prod Env",
    },
  ],
}

export const oapi = openapi(document)
export const adminOapi = openapi(adminDocument)

export const Response400 = {
  description:
    "The server could not understand the request due to invalid syntax. The client should modify the request and try again.",
  content: {
    "application/json": {
      schema: oapi.schema("BadRequest"),
    },
  },
  headers: {},
}

export const Response401 = {
  description:
    "Authentication is required to access the requested resource. The client must include the appropriate credentials.",
  content: {
    "application/json": {
      schema: oapi.schema("Unauthorized"),
    },
  },
  headers: {},
}

export const Response403 = {
  description:
    "The server understood the request, but refuses to authorize it. Ensure the client has appropriate permissions.",
  content: {
    "application/json": {
      schema: oapi.schema("Forbidden"),
    },
  },
  headers: {},
}

export const Response404 = {
  description:
    "The server cannot find the requested resource. The endpoint may be invalid or the resource may no longer exist.",
  content: {
    "application/json": {
      schema: oapi.schema("NotFound"),
    },
  },
  headers: {},
}

export const Response500 = {
  description:
    "The server encountered an unexpected condition that prevented it from fulfilling the request. Please try again later.",
  content: {
    "application/json": {
      schema: oapi.schema("ServerError"),
    },
  },
  headers: {},
}

export const Response409 = {
  description:
    "The request could not be completed due to a conflict with the current state of the resource. Resolve the conflict and try again.",
  content: {
    "application/json": {
      schema: oapi.schema("Conflict"),
    },
  },
  headers: {},
}

const deployEnvironment = env.DEPLOY_ENVIRONMENT

if (deployEnvironment === "development") {
  const server = {
    url: "http://localhost",
    description: "Dev Env",
  }

  if (oapi.document.servers) {
    oapi.document.servers.push(server)
  } else {
    oapi.document.servers = [server]
  }
}
