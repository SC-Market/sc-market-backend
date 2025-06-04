import express from "express"
import {
  adminAuthorized,
  userAuthorized,
  verifiedUser,
} from "../../../middleware/auth.js"
import { database } from "../../../../clients/database/knex-db.js"
import { DBOrder } from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import { formatOrderStub } from "../util/formatting.js"
import { createOrderReviewNotification } from "../util/notifications.js"
import { rate_limit } from "../../../middleware/ratelimiting.js"
import { has_permission, is_member } from "../util/permissions.js"
import {
  acceptApplicant,
  convert_order_search_query,
  createOffer,
  handleAssignedUpdate,
  handleStatusUpdate,
  is_related_to_order,
  orderTypes,
  paymentTypes,
  search_orders,
} from "./helpers.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
  Response409,
} from "../openapi.js"
import { serializeOrderDetails, serializePublicOrder } from "./serializers.js"
import { related_to_order } from "./middleware.js"
import { createThread } from "../util/discord.js"
import logger from "../../../../logger/logger.js"
import { validate_optional_username } from "../profiles/middleware.js"
import { validate_optional_spectrum_id } from "../contractors/middleware.js"
import { ORDER_SEARCH_SORT_METHODS, ORDER_SEARCH_STATUS } from "./types.js"

export const ordersRouter = express.Router()

oapi.schema("OrderStatus", {
  enum: ["fulfilled", "in-progress", "not-started", "cancelled"],
  title: "OrderStatus",
  type: "string",
})

oapi.schema("OrderBody", {
  properties: {
    title: {
      title: "OrderBody.title",
      type: "string",
      maxLength: 100,
      minLength: 1,
    },
    rush: {
      title: "OrderBody.rush",
      type: "boolean",
    },
    description: {
      title: "OrderBody.description",
      type: "string",
      maxLength: 2000,
    },
    kind: {
      enum: orderTypes,
      title: "OrderBody.kind",
      type: "string",
    },
    collateral: {
      title: "OrderBody.collateral",
      type: "integer",
      minimum: 0,
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
      title: "OrderBody.cost",
      type: "integer",
      minimum: 0,
    },
    contractor: {
      title: "OrderBody.contractor",
      type: "string",
      nullable: true,
    },
    assigned_to: {
      title: "OrderBody.assigned_to",
      type: "string",
      nullable: true,
    },
    service_id: {
      title: "OrderBody.service_id",
      type: "string",
      nullable: true,
    },
    payment_type: {
      enum: paymentTypes,
      title: "OrderBody.payment_type",
      type: "string",
    },
  },
  required: [
    "title",
    "rush",
    "description",
    "kind",
    "collateral",
    "departure",
    "destination",
    "cost",
    "payment_type",
  ],
  additionalProperties: false,
  title: "OrderBody",
  type: "object",
})

ordersRouter.post(
  "/",
  oapi.validPath({
    summary: "Create a new order",
    deprecated: false,
    description: "",
    operationId: "createANewOrder",
    tags: ["Orders", "Offers"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("OrderBody"),
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  title: "data",
                  type: "object",
                  properties: {
                    discord_invite: {
                      nullable: true,
                      title: "discord_invite",
                      type: "string",
                    },
                    session_id: {
                      nullable: false,
                      title: "session_id",
                      type: "string",
                    },
                  },
                },
              },
              required: ["data"],
              type: "object",
              title: "CreateANewOrderCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
    },
    security: [],
  }),
  verifiedUser,
  async (req, res, next) => {
    const user = req.user as User // TODO: Handle order service

    const {
      kind,
      description,
      cost,
      title,
      contractor,
      assigned_to,
      collateral,
      payment_type,
      service_id,
    }: {
      kind: string
      cost: string
      title: string
      description: string
      contractor: string | null
      assigned_to: string | null
      rush: boolean
      departure: string | null
      destination: string | null
      collateral: number
      service_id?: string
      payment_type: string
    } = req.body

    let contractor_id
    if (contractor) {
      const contractor_obj = await database.getContractor({
        spectrum_id: contractor,
      })
      if (!contractor_obj) {
        res
          .status(400)
          .json(createErrorResponse({ message: "Invalid contractor" }))
        return
      }
      contractor_id = contractor_obj.contractor_id
    } else {
      contractor_id = null
    }

    let assigned_user
    if (assigned_to) {
      assigned_user = await database.getUser({ username: assigned_to })
      if (!assigned_user) {
        res
          .status(400)
          .json(createErrorResponse({ message: "Invalid assignee" }))
        return
      }

      if (contractor_id) {
        const role = await database.getContractorRoleLegacy(
          assigned_user.user_id,
          contractor_id,
        )
        if (!role) {
          res
            .status(400)
            .json(createErrorResponse({ message: "Invalid assignee" }))
          return
        }
      }
    } else {
      assigned_user = null
    }

    // TODO: Allow for public contracts again
    const { session, discord_invite } = await createOffer(
      {
        assigned_id: assigned_user?.user_id,
        contractor_id: contractor_id,
        customer_id: user.user_id,
      },
      {
        actor_id: user.user_id,
        kind: kind,
        description: description,
        cost: cost,
        title: title,
        // rush: rush || false,
        // TODO: Departure / destination
        // departure: departure,
        // destination: destination,
        collateral: collateral || 0,
        service_id,
        payment_type: payment_type as "one-time" | "hourly" | "daily",
      },
    )

    res.status(201).json(
      createResponse({
        discord_invite: discord_invite,
        session_id: session.id,
      }),
    )
  },
)

oapi.schema("OrderStub", {
  properties: {
    order_id: {
      title: "OrderStub.order_id",
      type: "string",
    },
    contractor: {
      ...oapi.schema("MinimalContractor"),
      nullable: true,
      title: "OrderStub.contractor",
    },
    assigned_to: {
      ...oapi.schema("MinimalUser"),
      nullable: true,
      title: "OrderStub.assigned_to",
    },
    customer: {
      ...oapi.schema("MinimalUser"),
      title: "OrderStub.customer",
    },
    status: {
      ...oapi.schema("OrderStatus"),
      title: "OrderStub.status",
    },
    timestamp: {
      title: "OrderStub.timestamp",
      type: "string",
    },
    service_name: {
      title: "OrderStub.service_name",
      type: "string",
      nullable: true,
    },
    cost: {
      title: "OrderStub.cost",
      type: "integer",
      minimum: 0,
    },
    title: {
      title: "OrderStub.title",
      type: "string",
      minLength: 1,
      maxLength: 100,
    },
    payment_type: {
      title: "OrderStub.payment_type",
      type: "string",
      enum: paymentTypes,
    },
    count: {
      title: "OrderStub.count",
      type: "integer",
      minimum: 0,
    },
  },
  required: [
    "order_id",
    "contractor",
    "assigned_to",
    "customer",
    "status",
    "timestamp",
    "service_name",
    "cost",
    "title",
    "payment_type",
    "count",
  ],
  additionalProperties: false,
  title: "OrderStub",
  type: "object",
})

ordersRouter.get(
  "/mine",
  oapi.validPath({
    summary: "Get orders you've placed",
    deprecated: false,
    description: "",
    operationId: "getOrdersYouvePlaced",
    tags: ["Orders"],
    parameters: [],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("OrderStub"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetOrdersYouvePlacedOk",
            },
          },
        },
        headers: {},
      },
      "401": Response401,
    },
  }),
  userAuthorized,
  async (req, res, next) => {
    const user = req.user as User
    const orders = await database.getOrders({ customer_id: user.user_id })

    res.json(createResponse(await Promise.all(orders.map(formatOrderStub))))
  },
)

ordersRouter.get(
  "/assigned",
  oapi.validPath({
    summary: "Get orders assigned to you",
    deprecated: false,
    description: "",
    operationId: "getOrdersAssignedToYou",
    tags: ["Orders"],
    parameters: [],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("OrderStub"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetOrdersAssignedToYouOk",
            },
          },
        },
        headers: {},
      },
      "401": Response401,
    },
  }),

  userAuthorized,
  async (req, res, next) => {
    const user = req.user as User
    const orders = await database.getOrders({ assigned_id: user.user_id })
    const contractors = await database.getUserContractors({
      "contractor_members.user_id": user.user_id,
    })

    res.json(createResponse(await Promise.all(orders.map(formatOrderStub))))
  },
)

ordersRouter.get(
  "/contractor/:spectrum_id/assigned",
  oapi.validPath({
    summary: "Get orders assigned to you for a given contractor",
    deprecated: false,
    description: "",
    operationId: "getOrdersAssignedToYouForAGivenContractor",
    tags: ["Orders"],
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
                  items: oapi.schema("OrderStub"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetOrdersAssignedToYouForAGivenContractorOk",
            },
          },
        },
        headers: {},
      },
      "401": Response401,
      "403": Response403,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res, next) => {
    const spectrum_id = req.params["spectrum_id"]
    const contractor = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    if (!contractor) {
      res.status(400).json({ message: "Invalid contractor" })
      return
    }

    const user = req.user as User
    const orders = await database.getOrders({
      assigned_id: user.user_id,
      contractor_id: contractor.contractor_id,
    })

    res.json(createResponse(await Promise.all(orders.map(formatOrderStub))))
  },
)

ordersRouter.get(
  "/contractor/:spectrum_id",
  oapi.validPath({
    summary: "Get orders placed with the given contractor",
    deprecated: false,
    description: "",
    operationId: "getOrdersPlacedWithTheGivenContractor",
    tags: ["Orders"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
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
                  items: oapi.schema("OrderStub"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetOrdersPlacedWithTheGivenContractorOk",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res, next) => {
    const spectrum_id = req.params["spectrum_id"]
    const contractor = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    if (!contractor) {
      res.status(404).json({ message: "Invalid contractor" })
      return
    }

    const user = req.user as User
    const contractors = await database.getUserContractors({
      "contractor_members.user_id": user.user_id,
    })

    if (
      contractors.filter((c) => c.contractor_id === contractor.contractor_id)
        .length === 0
    ) {
      res
        .status(403)
        .json({ message: "You are not authorized to view these orders" })
      return
    }

    const orders = await database.getOrders({
      contractor_id: contractor.contractor_id,
    })

    res.json(createResponse(await Promise.all(orders.map(formatOrderStub))))
  },
)

ordersRouter.get("/public", async (req, res, next) => {
  const orders = await database.getOrders({
    assigned_id: null,
    contractor_id: null,
    status: "not-started",
  })

  res.json(
    createResponse(
      await Promise.all(orders.map((o) => serializePublicOrder(o))),
    ),
  )
})

ordersRouter.get(
  "/search",
  oapi.validPath({
    summary: "Search orders",
    deprecated: false,
    description: "",
    operationId: "searchOrders",
    tags: ["Orders"],
    parameters: [
      {
        name: "spectrum_id",
        in: "query",
        description: "The Spectrum ID of the contracting org",
        required: false,
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
      {
        name: "assigned",
        in: "query",
        description: "The assigned user's username",
        required: false,
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
      {
        name: "customer",
        in: "query",
        description: "The customer's username",
        required: false,
        schema: {
          type: "string",
          minLength: 3,
          maxLength: 50,
        },
      },
      {
        name: "sort_method",
        in: "query",
        description: "The method to sort results by",
        required: false,
        schema: {
          type: "string",
          enum: ORDER_SEARCH_SORT_METHODS,
          default: "timestamp",
        },
      },
      {
        name: "status",
        in: "query",
        description: "The current status of the order",
        required: false,
        schema: {
          type: "string",
          enum: ORDER_SEARCH_STATUS,
        },
      },
      {
        name: "index",
        in: "query",
        description: "The page index of the search",
        required: false,
        schema: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
      },
      {
        name: "page_size",
        in: "query",
        description: "The page size for the search",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 25,
          default: 5,
        },
      },
      {
        name: "reverse_sort",
        in: "query",
        description: "Whether to reverse the sort",
        required: false,
        schema: {
          type: "boolean",
          default: false,
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
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: oapi.schema("OrderStub"),
                    },
                    item_count: {
                      type: "integer",
                      minimum: 0,
                    },
                  },
                },
              },
              required: ["data"],
              type: "object",
              title: "SearchOrdersOk",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [],
  }),
  userAuthorized,
  validate_optional_username("customer"),
  validate_optional_username("assigned"),
  validate_optional_spectrum_id("contractor"),
  async (req, res) => {
    const user = req.user as User
    const args = await convert_order_search_query(req)
    if (!(args.contractor_id || args.assigned_id || args.customer_id)) {
      if (user.role !== "admin") {
        res.status(400).json(createErrorResponse("Missing permissions."))
        return
      }
    }

    if (args.contractor_id) {
      if (!(await is_member(args.contractor_id, user.user_id))) {
        res.status(400).json(createErrorResponse("Missing permissions."))
        return
      }
    }

    if (args.assigned_id && args.assigned_id !== user.user_id) {
      res.status(400).json(createErrorResponse("Missing permissions."))
      return
    }

    const result = await search_orders(args)
    res.json(
      createResponse({
        item_counts: result.item_counts,
        items: await Promise.all(result.items.map(formatOrderStub)),
      }),
    )
    return
  },
)

ordersRouter.get("/all", adminAuthorized, async (req, res, next) => {
  const orders = await database.getOrders({})

  res.json(createResponse(await Promise.all(orders.map(formatOrderStub))))
})

ordersRouter.post(
  "/:order_id/review",
  oapi.validPath({
    summary: "Leave a review on an order",
    deprecated: false,
    description: "",
    operationId: "postReview",
    tags: ["Order Reviews"],
    parameters: [
      {
        name: "order_id",
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
          schema: {
            type: "object",
            properties: {
              content: {
                title: "content",
                type: "string",
                maxLength: 1000,
              },
              rating: {
                title: "rating",
                type: "number",
                minimum: 0,
                multipleOf: 0.5,
              },
              role: {
                title: "role",
                type: "string",
                enum: ["contractor", "customer"],
              },
            },
            required: ["content", "rating", "role"],
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
              title: "PostReviewCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  rate_limit(1),
  userAuthorized,
  async (req, res, next) => {
    const order_id = req.params["order_id"]
    let order: DBOrder
    try {
      order = await database.getOrder({ order_id: order_id })
    } catch (e) {
      res.status(404).json({ message: "Invalid order" })
      return
    }
    const user = req.user as User

    const {
      content,
      rating,
      role,
    }: {
      content: string
      rating: number
      role: string
    } = req.body

    if (!["customer", "contractor"].includes(role)) {
      res.status(400).json({ message: "Invalid role" })
      return
    }

    const amCustomer = order.customer_id === user.user_id
    const amContractor =
      order.assigned_id === user.user_id ||
      (order.contractor_id &&
        (await has_permission(
          order.contractor_id,
          user.user_id,
          "manage_orders",
        )))

    if (role === "customer" && !amCustomer) {
      res
        .status(403)
        .json({ message: "You are not authorized to review this order!" })
      return
    }
    if (role === "contractor" && !amContractor) {
      res
        .status(403)
        .json({ message: "You are not authorized to review this order!" })
      return
    }

    if (!content) {
      res.status(400).json({ message: "Message content cannot be empty!" })
      return
    }

    if (!rating || rating > 5 || rating <= 0 || rating % 0.5 !== 0) {
      res.status(400).json({ message: "Invalid rating!" })
      return
    }

    const existing = await database.getOrderReview({
      order_id: order.order_id,
      role: role as "customer" | "contractor",
    })
    if (existing) {
      res
        .status(409)
        .json({ message: "A review has already been left on this order" })
      return
    }

    const review = await database.createOrderReview({
      order_id: order.order_id,
      content: content,
      user_author: user.user_id,
      rating: rating,
      role: role as "customer" | "contractor",
    })

    await createOrderReviewNotification(review[0])

    res.status(200).json(createResponse({ result: "Success" }))
  },
)

ordersRouter.put(
  "/:order_id",
  oapi.validPath({
    summary: "Update an order",
    deprecated: false,
    description: "",
    operationId: "updateOrder",
    tags: ["Orders"],
    parameters: [
      {
        name: "order_id",
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
          schema: {
            type: "object",
            properties: {
              status: {
                title: "status",
                ...oapi.schema("OrderStatus"),
              },
              assigned_to: {
                title: "assigned_to",
                type: "string",
                nullable: true,
              },
              contractor: {
                title: "contractor",
                type: "string",
              },
            },
            required: [],
          },
        },
      },
    },
    responses: {
      "200": {
        description: "OK - Resource successfully updated",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
              title: "UpdateTheStatusForOrderOk",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
  }),
  rate_limit(5),
  userAuthorized,
  related_to_order,
  async (req, res) => {
    const {
      status,
      assigned_to,
      contractor,
    }: {
      status?: string
      assigned_to?: string
      contractor?: string
      applied?: boolean
    } = req.body

    if (status) {
      await handleStatusUpdate(req, res, status)
    }

    if (assigned_to !== undefined || contractor !== undefined) {
      await handleAssignedUpdate(req, res)
    }
  },
)

ordersRouter.post(
  "/:order_id/applicants",
  oapi.validPath({
    summary: "Apply to an open contract",
    deprecated: true,
    description: "Deprecated - Use public contract offers",
    operationId: "postApply",
    tags: ["Order Applicants"],
    parameters: [
      {
        name: "order_id",
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
          schema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                maxLength: 1000,
              },
            },
            required: ["message"],
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
              title: "PostApplyCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  rate_limit(5),
  verifiedUser,
  async (req, res, next) => {
    const order_id = req.params["order_id"]
    let order: DBOrder
    try {
      order = await database.getOrder({ order_id: order_id })
    } catch (e) {
      res.status(400).json(createErrorResponse({ message: "Invalid order" }))
      return
    }
    const user = req.user as User

    if (order.assigned_id || order.contractor_id) {
      res
        .status(409)
        .json(createErrorResponse({ message: "Order is already assigned" }))
      return
    }

    const {
      contractor,
      message,
    }: {
      contractor?: string
      message?: string
    } = req.body

    if (!contractor) {
      const apps = await database.getOrderApplicants({
        user_applicant_id: user.user_id,
        order_id: order.order_id,
      })
      if (apps.length > 0) {
        res.status(409).json(
          createErrorResponse({
            message: "You have already applied to this order",
          }),
        )
        return
      }

      await database.createOrderApplication({
        order_id: order.order_id,
        user_applicant_id: user.user_id,
        message: message || "",
      })
    } else {
      let contractor_obj
      try {
        contractor_obj = await database.getContractor({
          spectrum_id: contractor,
        })
      } catch {
        res
          .status(400)
          .json(createErrorResponse({ message: "Invalid contractor" }))
        return
      }

      if (
        !(await has_permission(
          contractor_obj.contractor_id,
          user.user_id,
          "manage_orders",
        ))
      ) {
        res.status(403).json(
          createErrorResponse({
            message: "You are not authorized to apply to this order",
          }),
        )
        return
      }

      const apps = await database.getOrderApplicants({
        org_applicant_id: contractor_obj.contractor_id,
        order_id: order.order_id,
      })
      if (apps.length > 0) {
        res.status(409).json(
          createErrorResponse({
            message: "You have already applied to this order",
          }),
        )
        return
      }

      await database.createOrderApplication({
        order_id: order.order_id,
        org_applicant_id: contractor_obj.contractor_id,
        message: message || "",
      })
    }

    // TODO: Submit the application
    res.status(201).json(createResponse({ result: "Success" }))
  },
)

async function updateAssigned(
  req: any,
  res: any,
  {
    target_username,
    contractor_spectrum_id,
  }: { target_username?: string; contractor_spectrum_id?: string },
) {
  const order_id = req.params["order_id"]
  let order: DBOrder
  try {
    order = await database.getOrder({ order_id: order_id })
  } catch (e) {
    res.status(404).json(createErrorResponse({ message: "Invalid order" }))
    return
  }

  const user = req.user as User

  if (order.customer_id !== user.user_id) {
    res.status(403).json(
      createErrorResponse({
        message: "You are not authorized to accept this application",
      }),
    )
    return
  }

  if (order.assigned_id || order.contractor_id) {
    res
      .status(409)
      .json(createErrorResponse({ message: "Order is already assigned" }))
    return
  }

  if (contractor_spectrum_id) {
    let target_contractor
    try {
      target_contractor = await database.getContractor({
        spectrum_id: contractor_spectrum_id,
      })
    } catch {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid contractor" }))
      return
    }

    await database.updateOrder(order.order_id, {
      contractor_id: target_contractor?.contractor_id,
    })
  } else {
    let target_user
    try {
      target_user = await database.getUser({ username: target_username })
    } catch {
      res.status(400).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    await database.updateOrder(order.order_id, {
      assigned_id: target_user?.user_id,
    })
  }

  res.status(201).json(createResponse({ result: "Success" }))
}

ordersRouter.post(
  "/:order_id/applicants/contractors/:spectrum_id",
  related_to_order,
  oapi.validPath({
    summary: "Accept an application on an order",
    deprecated: true,
    description: "Deprecated - Use public contract offers",
    operationId: "acceptAnApplicationOnOrder",
    tags: ["Order Applicants"],
    parameters: [
      {
        name: "order_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "spectrum_id",
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
          schema: {
            properties: {},
            type: "object",
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                },
              },
              required: ["data"],
              type: "object",
              title: "AcceptAnApplicationOnOrderCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  rate_limit(1),
  userAuthorized,
  async (req, res, next) => {
    const { spectrum_id } = req.params

    await acceptApplicant(req, res, { target_contractor: spectrum_id })
    // TODO: Make apps into their own objects
  },
) // TODO

ordersRouter.post(
  "/:order_id/applicants/users/:username",
  oapi.validPath({
    summary: "Accept an application on an order",
    deprecated: true,
    description: "Deprecated - Use public contract offers",
    operationId: "acceptAnApplicationOnOrder",
    tags: ["Order Applicants"],
    parameters: [
      {
        name: "order_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
      {
        name: "username",
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
          schema: {
            properties: {},
            type: "object",
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                },
              },
              required: ["data"],
              type: "object",
              title: "AcceptAnApplicationOnOrderCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  rate_limit(1),
  userAuthorized,
  related_to_order,
  async (req, res, next) => {
    const { username } = req.params

    await acceptApplicant(req, res, { target_username: username })
  },
)

oapi.schema("OrderApplicant", {
  properties: {
    order_id: {
      title: "OrderApplicant.order_id",
      type: "string",
    },
    user_applicant: {
      ...oapi.schema("MinimalUser"),
      nullable: true,
      title: "OrderApplicant.user_applicant",
    },
    org_applicant: {
      ...oapi.schema("MinimalContractor"),
      nullable: true,
      title: "OrderApplicant.org_applicant",
    },
    timestamp: {
      title: "OrderApplicant.timestamp",
      type: "number",
    },
    message: {
      title: "OrderApplicant.message",
      type: "string",
    },
  },
  required: [
    "order_id",
    "user_applicant",
    "org_applicant",
    "timestamp",
    "message",
  ],
  additionalProperties: false,
  title: "OrderApplicant",
  type: "object",
})

oapi.schema("OfferMarketListing", {
  properties: {
    quantity: {
      title: "OfferMarketListing.quantity",
      type: "number",
    },
    listing_id: {
      title: "OfferMarketListing.listing_id",
      type: "string",
    },
    listing: {
      $ref: "#/components/schemas/UniqueListing",
      title: "OfferMarketListing.listing",
    },
  },
  required: ["quantity", "listing_id", "listing"],
  additionalProperties: false,
  title: "OfferMarketListing",
  type: "object",
})

oapi.schema("Order", {
  properties: {
    order_id: {
      title: "Order.order_id",
      type: "string",
    },
    status: {
      $ref: "#/components/schemas/OrderStatus",
      title: "Order.status",
    },
    kind: {
      type: "string",
    },
    cost: {
      title: "Order.cost",
      type: "number",
      minimum: 0,
    },
    rush: {
      title: "Order.rush",
      type: "boolean",
    },
    assigned_to: {
      title: "Order.assigned_to",
      type: "string",
      nullable: true,
    },
    contractor: {
      title: "Order.contractor",
      type: "string",
      nullable: true,
    },
    customer: {
      title: "Order.customer",
      type: "string",
    },
    title: {
      title: "Order.title",
      type: "string",
    },
    description: {
      title: "Order.description",
      type: "string",
    },
    discord_thread_id: {
      title: "Order.discord_thread_id",
      type: "string",
      nullable: true,
    },
    discord_server_id: {
      title: "Order.discord_server_id",
      type: "string",
      nullable: true,
    },
    timestamp: {
      title: "Order.timestamp",
      type: "string",
    },
    applicants: {
      items: {
        ...oapi.schema("OrderApplicant"),
        title: "Order.applicants.[]",
      },
      title: "Order.applicants",
      type: "array",
    },
    market_listings: {
      items: {
        ...oapi.schema("OfferMarketListing"),
        title: "Order.market_listings.[]",
      },
      title: "Order.market_listings",
      type: "array",
    },
    customer_review: {
      ...oapi.schema("OrderReview"),
      title: "Order.customer_review",
    },
    contractor_review: {
      ...oapi.schema("OrderReview"),
      title: "Order.customer_review",
    },
    template_id: {
      title: "Order.template_id",
      type: "string",
      nullable: true,
    },
    payment_type: {
      enum: ["one-time", "daily", "hourly"],
      title: "Order.payment_type",
      type: "string",
    },
    availability: {
      title: "Order.availability",
      $ref: "#/components/schemas/OrderAvailability",
    },
    offer_session_id: {
      title: "Order.offer_session_id",
      type: "string",
      nullable: true,
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
})

ordersRouter.get(
  "/:order_id",
  oapi.validPath({
    summary: "Get an order by ID",
    deprecated: false,
    description: "",
    operationId: "getOrderById",
    tags: ["Orders"],
    parameters: [
      {
        name: "order_id",
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
            schema: oapi.schema("Order"),
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [],
  }),
  rate_limit(1),
  async (req, res) => {
    try {
      const order_id = req.params["order_id"]
      let order: DBOrder
      try {
        order = await database.getOrder({ order_id: order_id })
      } catch (e) {
        res.status(404).json(createErrorResponse({ message: "Invalid order" }))
        return
      }
      const user = req.user as User | null | undefined

      if (user) {
        const unrelated = !(await is_related_to_order(order, user))

        if (unrelated) {
          res.status(403).json(
            createErrorResponse({
              message: "You are not authorized to view this order",
            }),
          )
          return
        }
      }

      if (!user) {
        res.status(403).json(
          createErrorResponse({
            message: "You are not authorized to view this order",
          }),
        )
        return
      }

      // TODO: Factor order details into another function
      res.json(
        createResponse(
          await serializeOrderDetails(order, null, true, true, true),
        ),
      )
    } catch (e) {
      logger.error(e)
    }
  },
)

ordersRouter.post(
  "/:order_id/thread",
  oapi.validPath({
    summary: "Create a new thread for the order",
    deprecated: false,
    description: "Creates a new thread if the order doesn't already have one.",
    operationId: "createANewOrderThread",
    tags: ["Order Threads"],
    parameters: [
      {
        name: "order_id",
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
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  title: "data",
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
              title: "CreateANewOrderThreadCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "409": Response409,
    },
    security: [],
  }),
  verifiedUser,
  userAuthorized,
  related_to_order,
  async (req, res) => {
    if (req.order!.thread_id) {
      res
        .status(409)
        .json(createErrorResponse({ message: "Order already has a thread!" }))
      return
    }

    try {
      const bot_response = await createThread(req.order!)
      if (bot_response.result.thread?.thread_id) {
        await database.updateOrder(req.order!.order_id, {
          thread_id: bot_response.result.thread.thread_id,
        })
      } else {
        logger.error("Failed to create thread", bot_response)
        res.status(500).json({ message: bot_response.result.message })
        return
      }
    } catch (e) {
      logger.error("Failed to create thread", e)
      res.status(500).json({ message: "An unknown error occurred" })
      return
    }
    res.status(201).json(
      createResponse({
        result: "Success",
      }),
    )
  },
)
