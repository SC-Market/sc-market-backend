import { orderTypes as orderTypes } from "../orders/helpers.js"
import { PAYMENT_TYPES as PAYMENT_TYPES } from "../types/payment-types.js"
import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import { Response404 as Response404 } from "../openapi.js"
import {
  Response500 as Response500,
  Response429Write,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"

oapi.schema("ServiceBody", {
  properties: {
    service_name: {
      title: "ServiceBody.service_name",
      type: "string",
      maxLength: 100,
    },
    service_description: {
      title: "ServiceBody.service_description",
      type: "string",
      maxLength: 2000,
    },
    title: {
      title: "ServiceBody.title",
      type: "string",
      maxLength: 100,
    },
    rush: {
      title: "ServiceBody.rush",
      type: "boolean",
    },
    description: {
      title: "ServiceBody.description",
      type: "string",
      maxLength: 2000,
    },
    kind: {
      title: "ServiceBody.kind",
      type: "string",
      enum: orderTypes,
    },
    collateral: {
      title: "ServiceBody.collateral",
      type: "number",
    },
    departure: {
      title: "ServiceBody.departure",
      nullable: true,
      type: "string",
    },
    destination: {
      title: "ServiceBody.destination",
      nullable: true,
      type: "string",
    },
    cost: {
      title: "ServiceBody.cost",
      type: "number",
      minimum: 0,
    },
    payment_type: {
      enum: PAYMENT_TYPES,
      title: "ServiceBody.payment_type",
      type: "string",
    },
    contractor: {
      title: "ServiceBody.contractor",
      nullable: true,
      type: "string",
    },
    status: {
      title: "ServiceBody.status",
      type: "string",
      enum: ["active", "inactive"],
    },
    photos: {
      items: {
        title: "ServiceBody.photos.[]",
        type: "string",
      },
      title: "ServiceBody.photos",
      type: "array",
      minLength: 1,
    },
  },
  required: [
    "service_name",
    "service_description",
    "title",
    "rush",
    "description",
    "collateral",
    "departure",
    "destination",
    "cost",
    "payment_type",
    "status",
    "photos",
  ],
  additionalProperties: false,
  title: "ServiceBody",
  type: "object",
})

export const services_post_root_spec = oapi.validPath({
  summary: "Create a new service",
  deprecated: false,
  description: "",
  operationId: "createService",
  tags: ["Services"],
  parameters: [],
  requestBody: {
    content: {
      "application/json": {
        schema: oapi.schema("ServiceBody"),
      },
    },
  },
  responses: {
    "201": {
      description: "Created - Resource successfully created",
      content: {
        "application/json": {
          schema: {
            properties: {},
            type: "object",
            title: "CreateServiceCreated",
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "429": Response429Write,
  },
  security: [],
})

export const services_get_user_username_spec = oapi.validPath({
  summary: "Get services by user",
  deprecated: false,
  description: "",
  operationId: "getServicesByUser",
  tags: ["Services"],
  parameters: [
    {
      name: "username",
      in: "path",
      description: "The username of the user",
      required: true,
      example: "Khuzdul",
      schema: {
        type: "string",
      },
    },
  ],
  responses: {
    "200": {
      description: "OK - Successful request with response body",
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                type: "array",
                items: oapi.schema("Service"),
              },
            },
            required: ["data"],
            type: "object",
            title: "GetServicesByUserOk",
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "404": Response404,
    "429": Response429Read,
  },
})

export const services_get_public_spec = oapi.validPath({
  summary: "Get public services with pagination",
  deprecated: false,
  description:
    "Get paginated list of active services with optional filtering and sorting",
  operationId: "getPublicServices",
  tags: ["Services"],
  parameters: [
    {
      name: "page",
      in: "query",
      description: "Page number (0-based)",
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
        default: 20,
      },
    },
    {
      name: "search",
      in: "query",
      description: "Search term for service name and description",
      required: false,
      schema: {
        type: "string",
      },
    },
    {
      name: "kind",
      in: "query",
      description: "Filter by service kind",
      required: false,
      schema: {
        type: "string",
      },
    },
    {
      name: "minCost",
      in: "query",
      description: "Minimum cost filter",
      required: false,
      schema: {
        type: "number",
        minimum: 0,
      },
    },
    {
      name: "maxCost",
      in: "query",
      description: "Maximum cost filter",
      required: false,
      schema: {
        type: "number",
        minimum: 0,
      },
    },
    {
      name: "paymentType",
      in: "query",
      description: "Filter by payment type",
      required: false,
      schema: {
        type: "string",
        enum: PAYMENT_TYPES,
      },
    },
    {
      name: "sortBy",
      in: "query",
      description: "Field to sort by",
      required: false,
      schema: {
        type: "string",
        enum: ["timestamp", "cost", "service_name"],
        default: "timestamp",
      },
    },
    {
      name: "sortOrder",
      in: "query",
      description: "Sort order",
      required: false,
      schema: {
        type: "string",
        enum: ["asc", "desc"],
        default: "desc",
      },
    },
    {
      name: "contractor",
      in: "query",
      description:
        "Filter by contractor (organization) spectrum ID. Only services offered by this org are returned.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "user",
      in: "query",
      description:
        "Filter by user username. Only services offered by this user are returned.",
      required: false,
      schema: { type: "string" },
    },
  ],
  responses: {
    "200": {
      description: "OK - Successful request with response body",
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                type: "array",
                items: oapi.schema("Service"),
              },
              pagination: {
                type: "object",
                properties: {
                  currentPage: { type: "integer" },
                  pageSize: { type: "integer" },
                  totalItems: { type: "integer" },
                  totalPages: { type: "integer" },
                  hasNextPage: { type: "boolean" },
                  hasPreviousPage: { type: "boolean" },
                },
                required: [
                  "currentPage",
                  "pageSize",
                  "totalItems",
                  "totalPages",
                  "hasNextPage",
                  "hasPreviousPage",
                ],
              },
            },
            required: ["data", "pagination"],
            type: "object",
            title: "GetPublicServicesOk",
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "429": Response429Read,
  },
})

export const services_get_contractor_spectrum_id_spec = oapi.validPath({
  summary: "Get services by contractor",
  deprecated: false,
  description: "",
  operationId: "getServicesByContractor",
  tags: ["Services"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      description: "The Spectrum ID of the contractor",
      required: true,
      example: "SCMARKET",
      schema: {
        type: "string",
      },
    },
  ],
  responses: {
    "200": {
      description: "OK - Successful request with response body",
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                type: "array",
                items: oapi.schema("Service"),
              },
            },
            required: ["data"],
            type: "object",
            title: "GetServicesByContractorOk",
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "404": Response404,
    "429": Response429Read,
  },
})

export const services_put_service_id_spec = oapi.validPath({
  summary: "Update a service",
  deprecated: false,
  description: "",
  operationId: "updateService",
  tags: ["Services"],
  parameters: [
    {
      name: "service_id",
      in: "path",
      description: "",
      required: true,
      example: "",
      schema: {
        type: "string",
      },
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: oapi.schema("ServiceBody"),
      },
    },
  },
  responses: {
    "204": {
      description: "Updated - Resource successfully updated",
      content: {
        "application/json": {
          schema: {
            properties: {},
            type: "object",
            title: "UpdateServiceUpdated",
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "429": Response429Write,
  },
  security: [],
})

export const services_get_service_id_spec = oapi.validPath({
  summary: "Get a service by ID",
  deprecated: false,
  description: "",
  operationId: "getServiceById",
  tags: ["Services"],
  parameters: [
    {
      name: "service_id",
      in: "path",
      description: "",
      required: true,
      example: "",
      schema: {
        type: "string",
      },
    },
  ],
  responses: {
    "200": {
      description: "OK - Successful request with response body",
      content: {
        "application/json": {
          schema: oapi.schema("Service"),
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "404": Response404,
    "429": Response429Read,
  },
  security: [],
})

export const services_post_service_id_photos_spec = oapi.validPath({
  summary: "Upload photos for a service",
  description:
    "Upload up to 5 photos for a specific service. Photos are stored in CDN and linked to the service. If the total number of photos would exceed 5, the oldest photos will be automatically removed to maintain the limit.",
  operationId: "uploadServicePhotos",
  tags: ["Services"],
  parameters: [
    {
      name: "service_id",
      in: "path",
      required: true,
      description: "ID of the service to upload photos for",
      schema: {
        type: "string",
      },
    },
  ],
  responses: {
    "200": {
      description: "Photos uploaded successfully",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/PhotoUploadResponse",
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "500": Response500,
    "429": Response429Write,
  },
})

export const services_post_service_id_view_spec = oapi.validPath({
  summary: "Track a view on a service",
  description: "Records a view on a service for analytics purposes",
  operationId: "trackServiceView",
  deprecated: false,
  tags: ["Services"],
  parameters: [
    {
      name: "service_id",
      in: "path",
      required: true,
      description: "ID of the service to track view for",
      schema: {
        type: "string",
      },
    },
  ],
  responses: {
    "200": {
      description: "View tracked successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string" },
            },
            required: ["message"],
          },
        },
      },
    },
    "400": Response400,
    "404": Response404,
    "500": Response500,
    "429": Response429Write,
  },
  security: [],
})

export const services_get_seller_analytics_spec = oapi.validPath({
  summary: "Get seller service analytics",
  description: "Returns analytics data for the authenticated user's services",
  operationId: "getServiceAnalytics",
  deprecated: false,
  tags: ["Services"],
  parameters: [
    {
      name: "period",
      in: "query",
      description: "Time period for analytics (7d, 30d, 90d)",
      schema: {
        type: "string",
        enum: ["7d", "30d", "90d"],
      },
    },
  ],
  responses: {
    "200": {
      description: "Analytics retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  services: { type: "number" },
                  total_service_views: { type: "number" },
                  time_period: { type: "string" },
                  user_id: { type: "string" },
                },
                required: [
                  "services",
                  "total_service_views",
                  "time_period",
                  "user_id",
                ],
              },
            },
            required: ["data"],
          },
        },
      },
    },
    "401": Response401,
    "500": Response500,
    "429": Response429Read,
  },
  security: [],
})
