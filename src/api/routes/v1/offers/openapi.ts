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
import { OFFER_SEARCH_SORT_METHODS, OFFER_SEARCH_STATUS } from "./types.js"

oapi.schema("OfferSessionStatus", {
  enum: ["closed", "open"],
  title: "OfferSessionStatus",
  type: "string",
})

oapi.schema("OfferStatus", {
  enum: ["rejected", "accepted", "counteroffered", "cancelled"],
  title: "OfferStatus",
  type: "string",
})

oapi.schema("OfferBodyMarketListing", {
  properties: {
    quantity: {
      title: "OfferBodyMarketListing.quantity",
      type: "number",
    },
    listing_id: {
      title: "OfferBodyMarketListing.listing_id",
      type: "string",
    },
  },
  required: ["quantity", "listing_id"],
  title: "OfferBodyMarketListing",
  type: "object",
})

oapi.schema("Offer", {
  properties: {
    id: {
      title: "Offer.id",
      type: "string",
    },
    session_id: {
      title: "Offer.session_id",
      type: "string",
    },
    actor: {
      ...oapi.schema("MinimalUser"),
      title: "Offer.actor",
    },
    kind: {
      title: "Offer.kind",
      type: "string",
    },
    cost: {
      title: "Offer.cost",
      type: "integer",
      minimum: 0,
    },
    title: {
      title: "Offer.title",
      type: "string",
      minLength: 1,
      maxLength: 100,
    },
    description: {
      title: "Offer.description",
      type: "string",
      minLength: 0,
      maxLength: 2000,
    },
    timestamp: {
      title: "Offer.timestamp",
      type: "string",
    },
    status: {
      $ref: "#/components/schemas/OfferStatus",
      title: "Offer.status",
    },
    collateral: {
      title: "Offer.cost",
      type: "integer",
      minimum: 0,
      nullable: true,
    },
    service: {
      title: "Offer.service",
      $ref: "#/components/schemas/Service",
      nullable: true,
    },
    market_listings: {
      items: {
        ...oapi.schema("OfferBodyMarketListing"),
        title: "Offer.market_listings.[]",
      },
      title: "Offer.market_listings",
      type: "array",
    },
    payment_type: {
      title: "Offer.payment_type",
      type: "string",
      enum: PAYMENT_TYPES,
    },
  },
  additionalProperties: false,
  title: "Offer",
  type: "object",
})

oapi.schema("CounterOfferBody", {
  properties: {
    session_id: {
      title: "CounterOfferBody.session_id",
      type: "string",
    },
    title: {
      title: "CounterOfferBody.title",
      type: "string",
      minLength: 1,
      maxLength: 100,
    },
    kind: {
      title: "CounterOfferBody.kind",
      type: "string",
    },
    cost: {
      title: "CounterOfferBody.cost",
      type: "integer",
      minimum: 0,
    },
    description: {
      title: "CounterOfferBody.description",
      type: "string",
      minLength: 0,
      maxLength: 2000,
    },
    timestamp: {
      title: "CounterOfferBody.timestamp",
      type: "string",
    },
    service_id: {
      type: "string",
      title: "CounterOfferBody.status",
      nullable: true,
    },
    market_listings: {
      items: {
        ...oapi.schema("OfferBodyMarketListing"),
        title: "CounterOfferBody.market_listings.[]",
      },
      title: "CounterOfferBody.market_listings",
      type: "array",
    },
    payment_type: {
      title: "CounterOfferBody.payment_type",
      type: "string",
      enum: PAYMENT_TYPES,
    },
    status: {
      type: "string",
      enum: ["counteroffered"],
    },
  },
  additionalProperties: false,
  title: "CounterOfferBody",
  type: "object",
})

oapi.schema("OfferSessionDetails", {
  properties: {
    id: {
      title: "OfferSessionDetails.id",
      type: "string",
    },
    status: {
      $ref: "#/components/schemas/OfferSessionStatus",
      title: "OfferSessionDetails.status",
    },
    contractor: {
      $ref: "#/components/schemas/MinimalContractor",
      title: "OfferSessionDetails.contractor",
      nullable: true,
    },
    assigned_to: {
      $ref: "#/components/schemas/MinimalUser",
      title: "OfferSessionDetails.assigned_to",
      nullable: true,
    },
    customer: {
      $ref: "#/components/schemas/MinimalUser",
      title: "OfferSessionDetails.contractor",
    },
    discord_thread_id: {
      type: "string",
      nullable: true,
    },
    discord_server_id: {
      type: "string",
      nullable: true,
    },
    contract_id: {
      type: "string",
      nullable: true,
    },
    order_id: {
      type: "string",
      nullable: true,
      description:
        "Order ID associated with this offer session when status is 'Accepted'",
      example: "123e4567-e89b-12d3-a456-426614174000",
    },
    offers: {
      items: {
        ...oapi.schema("Offer"),
        title: "OfferSessionDetails.offers.[]",
      },
      title: "OfferSessionDetails.offers",
      type: "array",
    },
    timestamp: {
      title: "OfferSessionDetails.timestamp",
      type: "string",
    },
  },
  additionalProperties: false,
  title: "OfferSessionDetails",
  type: "object",
})

oapi.schema("OfferStub", {
  properties: {
    service_name: {
      title: "OfferStub.service_name",
      type: "string",
      nullable: true,
    },
    cost: {
      title: "OfferStub.cost",
      type: "integer",
      minimum: 0,
    },
    title: {
      title: "OfferStub.title",
      type: "string",
      maxLength: 100,
    },
    payment_type: {
      title: "OfferStub.payment_type",
      type: "string",
      enum: PAYMENT_TYPES,
    },
    count: {
      title: "OfferStub.count",
      type: "integer",
      minimum: 0,
    },
  },
  additionalProperties: false,
  title: "OfferSessionStub",
  type: "object",
})

oapi.schema("OfferSessionStub", {
  properties: {
    id: {
      title: "OfferSessionStub.id",
      type: "string",
    },
    status: {
      $ref: "#/components/schemas/OfferSessionStatus",
      title: "OfferSessionStub.status",
    },
    contractor: {
      $ref: "#/components/schemas/MinimalContractor",
      title: "OfferSessionDetails.contractor",
      nullable: true,
    },
    assigned_to: {
      $ref: "#/components/schemas/MinimalUser",
      title: "OfferSessionDetails.assigned_to",
      nullable: true,
    },
    customer: {
      $ref: "#/components/schemas/MinimalUser",
      title: "OfferSessionDetails.contractor",
    },
    most_recent_offer: {
      ...oapi.schema("OfferStub"),
      title: "OfferSessionDetails.most_recent_offer",
    },
    timestamp: {
      title: "OfferSessionDetails.timestamp",
      type: "string",
    },
  },
  additionalProperties: false,
  title: "OfferSessionStub",
  type: "object",
})

export const offer_get_session_id_spec = oapi.validPath({
  summary: "Get an offer by ID",
  deprecated: false,
  description: "Retrieve offer session details by ID.",
  operationId: "getOfferById",
  tags: ["Offers"],
  parameters: [
    {
      name: "session_id",
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
          schema: oapi.schema("OfferSessionDetails"),
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
  },
  security: [],
})

export const offer_put_session_id_spec = oapi.validPath({
  summary: "Update an offer",
  deprecated: false,
  description: "Update offer details or status.",
  operationId: "updateAnOffer",
  tags: ["Offers"],
  parameters: [
    {
      name: "session_id",
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
          anyOf: [
            {
              ...oapi.schema("CounterOfferBody"),
            },
            {
              title: "OfferStatusBody",
              type: "object",
              properties: {
                status: {
                  title: "status",
                  ...oapi.schema("OfferStatus"),
                },
              },
            },
          ],
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
            title: "UpdateTheStatusForAnOrderOk",
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
})

export const post_session_id_thread_spec = oapi.validPath({
  summary: "Create a new thread for the offer",
  deprecated: false,
  description: "Creates a new thread if the offer doesn't already have one.",
  operationId: "createANewOrderThread",
  tags: ["Offers"],
  parameters: [
    {
      name: "session_id",
      in: "path",
      description: "The ID of the offer",
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "409": Response409,
    "429": Response429Write,
  },
  security: [],
})

export const get_search_spec = oapi.validPath({
  summary: "Search offers",
  deprecated: false,
  description: "Search offers with various filters.",
  operationId: "searchOffers",
  tags: ["Offers"],
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
        enum: OFFER_SEARCH_SORT_METHODS,
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
        enum: OFFER_SEARCH_STATUS,
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
  },
  security: [],
})
