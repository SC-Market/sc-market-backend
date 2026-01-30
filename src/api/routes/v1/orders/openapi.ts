import { oapi } from "../openapi.js"
import {
  Response400,
  Response401,
  Response403,
  Response404,
  Response409,
  Response429Read,
  Response429Write,
  RateLimitHeaders,
} from "../openapi.js"
import { PAYMENT_TYPES } from "../types/payment-types.js"
import { ORDER_SEARCH_SORT_METHODS, ORDER_SEARCH_STATUS } from "./types.js"
import { orderTypes } from "./helpers.js"

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
      enum: PAYMENT_TYPES,
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
      enum: PAYMENT_TYPES,
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
    discord_invite: {
      title: "Order.discord_invite",
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
      enum: PAYMENT_TYPES,
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

export const post_root_spec = oapi.validPath({
  summary: "Create a new order",
  deprecated: false,
  description: "Create a new order with the specified details.",
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "429": Response429Write,
  },
  security: [],
})

export const get_search_spec = oapi.validPath({
  summary: "Search orders",
  deprecated: false,
  description: "Search orders with various filters.",
  operationId: "searchOrders",
  tags: ["Orders"],
  parameters: [
    {
      name: "contractor",
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
    {
      name: "buyer_username",
      in: "query",
      description: "Filter by buyer (customer) username (for seller view)",
      required: false,
      schema: {
        type: "string",
        minLength: 3,
        maxLength: 50,
      },
    },
    {
      name: "seller_username",
      in: "query",
      description:
        "Filter by seller username (contractor spectrum_id or assigned user username) (for buyer view)",
      required: false,
      schema: {
        type: "string",
        minLength: 3,
        maxLength: 50,
      },
    },
    {
      name: "has_market_listings",
      in: "query",
      description: "Filter orders that have market listings attached",
      required: false,
      schema: {
        type: "boolean",
      },
    },
    {
      name: "has_service",
      in: "query",
      description: "Filter orders that have a service attached",
      required: false,
      schema: {
        type: "boolean",
      },
    },
    {
      name: "cost_min",
      in: "query",
      description: "Minimum cost filter",
      required: false,
      schema: {
        type: "integer",
        minimum: 0,
      },
    },
    {
      name: "cost_max",
      in: "query",
      description: "Maximum cost filter",
      required: false,
      schema: {
        type: "integer",
        minimum: 0,
      },
    },
    {
      name: "date_from",
      in: "query",
      description: "Filter orders created after this date (ISO 8601 format)",
      required: false,
      schema: {
        type: "string",
        format: "date-time",
      },
    },
    {
      name: "date_to",
      in: "query",
      description: "Filter orders created before this date (ISO 8601 format)",
      required: false,
      schema: {
        type: "string",
        format: "date-time",
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Write,
  },
  security: [],
})

export const get_contractor_spectrum_id_metrics_spec = oapi.validPath({
  summary: "Get contractor order metrics",
  deprecated: false,
  description:
    "Returns aggregated metrics for orders placed with a specific contractor.",
  operationId: "getContractorOrderMetrics",
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
                type: "object",
                properties: {
                  total_orders: {
                    type: "integer",
                    description: "Total number of orders",
                  },
                  total_value: {
                    type: "integer",
                    description: "Total value of all orders",
                  },
                  active_value: {
                    type: "integer",
                    description:
                      "Total value of active orders (not-started + in-progress)",
                  },
                  completed_value: {
                    type: "integer",
                    description: "Total value of completed orders (fulfilled)",
                  },
                  status_counts: {
                    type: "object",
                    properties: {
                      "not-started": { type: "integer" },
                      "in-progress": { type: "integer" },
                      fulfilled: { type: "integer" },
                      cancelled: { type: "integer" },
                    },
                    description: "Count of orders by status",
                  },
                  recent_activity: {
                    type: "object",
                    properties: {
                      orders_last_7_days: { type: "integer" },
                      orders_last_30_days: { type: "integer" },
                      value_last_7_days: { type: "integer" },
                      value_last_30_days: { type: "integer" },
                    },
                    description: "Recent activity metrics",
                  },
                  top_customers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        username: { type: "string" },
                        order_count: { type: "integer" },
                        total_value: { type: "integer" },
                      },
                    },
                    description: "Top customers by order count",
                  },
                },
                required: [
                  "total_orders",
                  "total_value",
                  "active_value",
                  "completed_value",
                  "status_counts",
                  "recent_activity",
                ],
                title: "ContractorOrderMetrics",
              },
            },
            required: ["data"],
            type: "object",
            title: "GetContractorOrderMetricsOk",
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Write,
  },
  security: [],
})

export const get_contractor_spectrum_id_data_spec = oapi.validPath({
  summary: "Get comprehensive contractor order data",
  deprecated: false,
  description:
    "Returns comprehensive order data including metrics, trend data, and recent orders for a specific contractor.",
  operationId: "getContractorOrderData",
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
    {
      name: "include_trends",
      in: "query",
      description: "Whether to include pre-computed trend data",
      required: false,
      schema: {
        type: "boolean",
        default: true,
      },
    },
    {
      name: "assigned_only",
      in: "query",
      description: "Whether to only include assigned orders (for user trends)",
      required: false,
      schema: {
        type: "boolean",
        default: false,
      },
    },
  ],
  responses: {
    200: {
      description: "Comprehensive contractor order data",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  metrics: {
                    type: "object",
                    properties: {
                      total_orders: { type: "number" },
                      total_value: { type: "number" },
                      active_value: { type: "number" },
                      completed_value: { type: "number" },
                      status_counts: {
                        type: "object",
                        properties: {
                          "not-started": { type: "number" },
                          "in-progress": { type: "number" },
                          fulfilled: { type: "number" },
                          cancelled: { type: "number" },
                        },
                      },
                      recent_activity: {
                        type: "object",
                        properties: {
                          orders_last_7_days: { type: "number" },
                          orders_last_30_days: { type: "number" },
                          value_last_7_days: { type: "number" },
                          value_last_30_days: { type: "number" },
                        },
                      },
                      top_customers: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            username: { type: "string" },
                            order_count: { type: "number" },
                            total_value: { type: "number" },
                          },
                        },
                      },
                      trend_data: {
                        type: "object",
                        properties: {
                          daily_orders: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                date: { type: "string" },
                                count: { type: "number" },
                              },
                            },
                          },
                          daily_value: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                date: { type: "string" },
                                value: { type: "number" },
                              },
                            },
                          },
                          status_trends: {
                            type: "object",
                            properties: {
                              "not-started": {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    date: { type: "string" },
                                    count: { type: "number" },
                                  },
                                },
                              },
                              "in-progress": {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    date: { type: "string" },
                                    count: { type: "number" },
                                  },
                                },
                              },
                              fulfilled: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    date: { type: "string" },
                                    count: { type: "number" },
                                  },
                                },
                              },
                              cancelled: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    date: { type: "string" },
                                    count: { type: "number" },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  recent_orders: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        order_id: { type: "string" },
                        timestamp: { type: "string" },
                        status: { type: "string" },
                        cost: { type: "number" },
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
    },
    401: Response401,
    403: Response403,
    404: Response404,
    429: Response429Read,
  },
})

export const get_user_data_spec = oapi.validPath({
  summary: "Get comprehensive user order data",
  deprecated: false,
  description:
    "Returns comprehensive order data including metrics, trend data, and recent orders for the current user's assigned orders.",
  operationId: "getUserOrderData",
  tags: ["Orders"],
  parameters: [
    {
      name: "include_trends",
      in: "query",
      description: "Whether to include pre-computed trend data",
      required: false,
      schema: {
        type: "boolean",
        default: true,
      },
    },
  ],
  responses: {
    200: {
      description: "Comprehensive user order data",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  metrics: {
                    type: "object",
                    properties: {
                      total_orders: { type: "number" },
                      total_value: { type: "number" },
                      active_value: { type: "number" },
                      completed_value: { type: "number" },
                      status_counts: {
                        type: "object",
                        properties: {
                          "not-started": { type: "number" },
                          "in-progress": { type: "number" },
                          fulfilled: { type: "number" },
                          cancelled: { type: "number" },
                        },
                      },
                      recent_activity: {
                        type: "object",
                        properties: {
                          orders_last_7_days: { type: "number" },
                          orders_last_30_days: { type: "number" },
                          value_last_7_days: { type: "number" },
                          value_last_30_days: { type: "number" },
                        },
                      },
                      top_customers: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            username: { type: "string" },
                            order_count: { type: "number" },
                            total_value: { type: "number" },
                          },
                        },
                      },
                      trend_data: {
                        type: "object",
                        properties: {
                          daily_orders: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                date: { type: "string" },
                                count: { type: "number" },
                              },
                            },
                          },
                          daily_value: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                date: { type: "string" },
                                value: { type: "number" },
                              },
                            },
                          },
                          status_trends: {
                            type: "object",
                            properties: {
                              "not-started": {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    date: { type: "string" },
                                    count: { type: "number" },
                                  },
                                },
                              },
                              "in-progress": {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    date: { type: "string" },
                                    count: { type: "number" },
                                  },
                                },
                              },
                              fulfilled: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    date: { type: "string" },
                                    count: { type: "number" },
                                  },
                                },
                              },
                              cancelled: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    date: { type: "string" },
                                    count: { type: "number" },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  recent_orders: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        order_id: { type: "string" },
                        timestamp: { type: "string" },
                        status: { type: "string" },
                        cost: { type: "number" },
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
    },
    401: Response401,
    403: Response403,
    429: Response429Read,
  },
})

export const post_order_id_review_spec = oapi.validPath({
  summary: "Leave a review on an order",
  deprecated: false,
  description: "Leave a review on a completed order.",
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
              minimum: 1,
              maximum: 5,
              multipleOf: 1,
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
})

export const post_order_id_reviews_review_id_request_revision_spec =
  oapi.validPath({
    summary: "Request revision for a review",
    description:
      "Request a revision for an existing review. Rate limited to prevent spam.",
    operationId: "requestReviewRevision",
    tags: ["Order Reviews"],
    parameters: [
      {
        name: "order_id",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      {
        name: "review_id",
        in: "path",
        required: true,
        schema: { type: "string" },
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
                maxLength: 500,
                description:
                  "Optional message explaining why the revision is requested",
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Revision requested successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    review_id: { type: "string" },
                    revision_requested: { type: "boolean" },
                    revision_requested_at: {
                      type: "string",
                      format: "date-time",
                    },
                    revision_message: {
                      type: "string",
                      nullable: true,
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
      "404": Response404,
      "409": Response409,
      "429": Response429Write,
    },
  })

export const put_order_id_reviews_review_id_spec = oapi.validPath({
  summary: "Update a review after revision request",
  description:
    "Update a review after a revision has been requested. Rate limited to prevent spam.",
  operationId: "updateOrderReview",
  tags: ["Order Reviews"],
  parameters: [
    {
      name: "order_id",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "review_id",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              minLength: 10,
              maxLength: 2000,
            },
            rating: {
              type: "number",
              minimum: 1,
              maximum: 5,
              multipleOf: 1,
            },
          },
          required: ["content", "rating"],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "Review updated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  review_id: { type: "string" },
                  last_modified_at: { type: "string", format: "date-time" },
                  revision_requested: { type: "boolean" },
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
  },
})

export const put_order_id_spec = oapi.validPath({
  summary: "Update an order",
  deprecated: false,
  description: "Update an existing order. Rate limited to prevent abuse.",
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
})

export const post_order_id_applicants_spec = oapi.validPath({
  summary: "Apply to an open contract",
  deprecated: true,
  description:
    "Deprecated - Use public contract offers. Rate limited to prevent spam.",
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
})

export const post_order_id_applicants_contractors_spectrum_id_spec =
  oapi.validPath({
    summary: "Accept a contractor application on an order",
    deprecated: true,
    description:
      "Deprecated - Use public contract offers. Rate limited to prevent spam.",
    operationId: "acceptContractorApplicationOnOrder",
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
  })

export const post_order_id_applicants_users_username_spec = oapi.validPath({
  summary: "Accept a user application on an order",
  deprecated: true,
  description:
    "Deprecated - Use public contract offers. Rate limited to prevent spam.",
  operationId: "acceptUserApplicationOnOrder",
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
})

export const get_order_id_spec = oapi.validPath({
  summary: "Get an order by ID",
  deprecated: false,
  description:
    "Retrieve a specific order by its ID. Rate limited to prevent abuse.",
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
})

export const post_order_id_thread_spec = oapi.validPath({
  summary: "Create a new thread for the order",
  deprecated: false,
  description:
    "Creates a new thread if the order doesn't already have one. Rate limited to prevent spam.",
  operationId: "createOrderThread",
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
})
