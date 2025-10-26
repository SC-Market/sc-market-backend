import { adminOapi as adminOapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import { Response500 as Response500 } from "../openapi.js"

adminOapi.schema("CreateDeliveryRequest", {
  type: "object",
  properties: {
    start: { type: "string", description: "Departure location" },
    end: { type: "string", description: "Destination location" },
    order_id: {
      type: "string",
      description: "ID of the order being delivered",
    },
    ship_id: {
      type: "string",
      description: "ID of the ship used for delivery",
    },
  },
  required: ["start", "end", "order_id", "ship_id"],
})

adminOapi.schema("Delivery", {
  type: "object",
  properties: {
    delivery_id: { type: "string" },
    departure: { type: "string" },
    destination: { type: "string" },
    order_id: { type: "string" },
    ship_id: { type: "string" },
    progress: { type: "number", minimum: 0, maximum: 100 },
    status: {
      type: "string",
      enum: ["pending", "in_progress", "completed", "cancelled"],
    },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
  required: [
    "delivery_id",
    "departure",
    "destination",
    "order_id",
    "ship_id",
    "progress",
    "status",
  ],
})

adminOapi.schema("DeliveryWithDetails", {
  allOf: [
    { $ref: "#/components/schemas/Delivery" },
    {
      type: "object",
      properties: {
        order: { $ref: "#/components/schemas/Order" },
        ship: { $ref: "#/components/schemas/Ship" },
      },
    },
  ],
})

export const delivery_post_create_spec = adminOapi.validPath({
  summary: "Create a new delivery",
  description: "Create a delivery for an order using a user's ship",
  operationId: "createDelivery",
  tags: ["Deliveries"],
  requestBody: {
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/CreateDeliveryRequest" },
      },
    },
  },
  responses: {
    "200": {
      description: "Delivery created successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              result: { type: "string", example: "Success" },
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
})

export const deliveries_get_mine_spec = adminOapi.validPath({
  summary: "Get user's deliveries",
  description: "Get all deliveries for the authenticated user",
  operationId: "getMyDeliveries",
  tags: ["Deliveries"],
  responses: {
    "200": {
      description: "User's deliveries retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/DeliveryWithDetails" },
          },
        },
      },
    },
    "401": Response401,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})
