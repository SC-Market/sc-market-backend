import express from "express"
import { userAuthorized, requireOrdersWrite } from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { has_permission } from "../util/permissions.js"
import {
  adminOapi,
  oapi,
  Response400,
  Response401,
  Response403,
  Response500,
} from "../openapi.js"

export const deliveryRouter = express.Router()

// OpenAPI Schema Definitions
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

/* TODO:
 *  - Allow a user to fetch a delivery iff:
 *      - The user is related to the delivery
 *      - The user owns the vehicle
 *      - The delivery is related to the organization and the user is an admin
 *  - Allow a user to fetch all deliveries related to their vehicles
 *  - Allow a user to fetch all deliveries related to their orders
 *  - Allow a user to fetch all deliveries related to their organization
 *  - Multiple orders per delivery
 */

deliveryRouter.post(
  "/create",
  adminOapi.validPath({
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
  }),
  userAuthorized,
  requireOrdersWrite,
  async (req, res, next) => {
    const user = req.user as User

    const {
      start,
      end,
      order_id,
      ship_id,
    }: {
      start: string
      end: string
      order_id: string
      ship_id: string
    } = req.body

    if (!start || !end || !order_id || !ship_id) {
      res.status(400).json({ error: "Missing required fields" })
      return
    }

    const contractors = await database.getUserContractors({
      user_id: user.user_id,
    })
    const order = await database.getOrder({ order_id })
    let contractor
    let manageOrders
    if (order.contractor_id) {
      contractor = contractors.find(
        (c) => c.contractor_id === order.contractor_id,
      )
      manageOrders = await has_permission(
        contractor!.contractor_id,
        user.user_id,
        "manage_market",
      )
    }
    const unrelated = !(order.assigned_id === user.user_id || manageOrders)

    if (unrelated) {
      res.status(403).json({
        error: "You are not allowed to create a delivery for this order",
      })
      return
    }

    const ship = await database.getShip({ ship_id })

    if (!ship || ship.owner !== user.user_id) {
      res.status(403).json({
        error: "You are not allowed to create a delivery for this ship",
      })
      return
    }

    await database.createDelivery({
      departure: start,
      destination: end,
      order_id: order_id,
      ship_id: ship_id,
      progress: 0,
      status: "pending",
    })

    res.json({ result: "Success" })
  },
)

export const deliveriesRouter = express.Router()

deliveriesRouter.get(
  "/mine",
  adminOapi.validPath({
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
  }),
  userAuthorized,
  async (req, res, next) => {
    const user = req.user as User
    const orders = await database.getDeliveries({ customer_id: user.user_id })

    res.json(
      await Promise.all(
        orders.map(async (delivery) => ({
          ...delivery,
          order: await database.getOrder({ order_id: delivery.order_id }),
          ship: await database.getShip({ ship_id: delivery.ship_id }),
        })),
      ),
    )
  },
)
