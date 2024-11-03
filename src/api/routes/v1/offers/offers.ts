import { userAuthorized, verifiedUser } from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  serializeOfferSession,
  serializeOfferSessionStub,
} from "./serializers.js"

import express from "express"
import { initiateOrder, paymentTypes } from "../orders/helpers.js"
import { verify_listings } from "../market/market.js"
import {
  dispatchOfferNotifications,
  sendOfferStatusNotification,
} from "../util/notifications.js"
import { CounterOfferBody } from "./types.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
  Response409,
} from "../openapi.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { createThread } from "../util/discord.js"
import logger from "../../../../logger/logger.js"
import { can_respond_to_offer, related_to_offer } from "./middleware.js"
import { org_authorized } from "../contractors/middleware.js"

export const offersRouter = express.Router()
export const offerRouter = express.Router()

oapi.schema("OfferSessionStatus", {
  enum: ["closed", "open"],
  title: "OfferSessionStatus",
  type: "string",
})

oapi.schema("OfferStatus", {
  enum: ["rejected", "accepted", "counteroffered"],
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
  additionalProperties: false,
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
      enum: paymentTypes,
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
      enum: paymentTypes,
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
      enum: paymentTypes,
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

offerRouter.get(
  "/:session_id",
  oapi.validPath({
    summary: "Get an offer by ID",
    deprecated: false,
    description: "",
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
  related_to_offer,
  async (req, res) => {
    res
      .status(200)
      .json(createResponse(await serializeOfferSession(req.offer_session!)))
  },
)

offersRouter.get(
  "/received",
  oapi.validPath({
    summary: "Get received offers",
    deprecated: false,
    description: "",
    operationId: "getReceivedOffers",
    tags: ["Offers"],
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
                  items: oapi.schema("OfferSessionStub"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetOffersReceivedOk",
            },
          },
        },
        headers: {},
      },
      "401": Response401,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res) => {
    const user = req.user as User
    const offers = await database.getOfferSessions({
      assigned_id: user.user_id,
    })

    res
      .status(200)
      .json(
        createResponse(
          await Promise.all(offers.map(serializeOfferSessionStub)),
        ),
      )
  },
)

offersRouter.get(
  "/contractor/:spectrum_id/received",
  oapi.validPath({
    summary: "Get received offers for a contractor",
    deprecated: false,
    description: "",
    operationId: "getReceivedOffersOrg",
    tags: ["Offers"],
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
                  items: oapi.schema("OfferSessionStub"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetOffersReceivedOrgOk",
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
  org_authorized,
  async (req, res) => {
    const offers = await database.getOfferSessions({
      contractor_id: req.contractor!.contractor_id,
    })

    res
      .status(200)
      .json(
        createResponse(
          await Promise.all(offers.map(serializeOfferSessionStub)),
        ),
      )
  },
)

offersRouter.get(
  "/sent",
  oapi.validPath({
    summary: "Get sent offers",
    deprecated: false,
    description: "",
    operationId: "getSentOffers",
    tags: ["Offers"],
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
                  items: oapi.schema("OfferSessionStub"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetOffersSentOk",
            },
          },
        },
        headers: {},
      },
      "401": Response401,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res) => {
    const user = req.user as User
    const offers = await database.getOfferSessions({
      customer_id: user.user_id,
    })

    res
      .status(200)
      .json(
        createResponse(
          await Promise.all(offers.map(serializeOfferSessionStub)),
        ),
      )
  },
)

offerRouter.put(
  "/:session_id",
  userAuthorized,
  related_to_offer,
  can_respond_to_offer,
  oapi.validPath({
    summary: "Update an offer",
    deprecated: false,
    description: "",
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
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
  }),
  async (req, res) => {
    const session = req.offer_session!
    const status = req.body.status as "accepted" | "rejected" | "counteroffered"

    const nameMap = new Map([
      ["accepted" as const, "Accepted" as const],
      ["rejected" as const, "Rejected" as const],
      ["counteroffered" as const, "Counter-Offered" as const],
    ])

    if (["accepted", "rejected"].includes(status)) {
      await database.updateOfferSession(session.id, { status: "closed" })
      await database.updateOrderOffer(req.most_recent_offer!.id, {
        status,
      })

      await sendOfferStatusNotification(session, nameMap.get(status)!)

      if (status === "accepted") {
        const order = await initiateOrder(session)

        res.status(200).json(createResponse({ order_id: order.order_id }))
      } else {
        res.status(200).json(createResponse({ result: "Success" }))
        return
      }
    } else {
      const user = req.user as User
      const customer = await database.getUser({ user_id: session.customer_id })
      const body = req.body as CounterOfferBody

      const listings = await verify_listings(
        res,
        body.market_listings,
        customer,
      )
      if (listings === undefined) {
        return
      }

      if (body.service_id) {
        const service = await database.getService({
          service_id: body.service_id,
        })

        if (!service) {
          res
            .status(400)
            .json(createErrorResponse({ error: "Invalid service" }))
          return
        }

        if (service.user_id && service.user_id !== session.assigned_id) {
          res
            .status(400)
            .json(createErrorResponse({ error: "Invalid service" }))
          return
        }

        if (
          service.contractor_id &&
          service.contractor_id !== session.contractor_id
        ) {
          res
            .status(400)
            .json(createErrorResponse({ error: "Invalid service" }))
          return
        }
      }

      const [offer] = await database.createOrderOffer({
        session_id: session.id,
        actor_id: user.user_id,
        kind: body.kind,
        cost: body.cost,
        title: body.title,
        description: body.description,
        service_id: body.service_id || undefined,
        payment_type: body.payment_type as "one-time" | "hourly" | "daily",
      })

      if (listings.length) {
        await database.insertOfferMarketListing(
          listings.map((l) => ({
            listing_id: l.listing.listing.listing_id,
            quantity: l.quantity,
            offer_id: offer.id,
          })),
        )
      }

      await database.updateOrderOffer(req.most_recent_offer!.id, {
        status: "counteroffered",
      })

      try {
        await dispatchOfferNotifications(session, "counteroffer")
      } catch (e) {
        console.error(e)
      }

      res.status(200).json(createResponse({ status: "Success" }))
    }
  },
)

offersRouter.post(
  "/:session_id/thread",
  oapi.validPath({
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
  related_to_offer,
  async (req, res) => {
    if (req.offer_session!.thread_id) {
      res
        .status(409)
        .json(createErrorResponse({ message: "Offer already has a thread!" }))
      return
    }

    try {
      const bot_response = await createThread(req.offer_session!)
      await database.updateOfferSession(req.offer_session!.id, {
        thread_id: bot_response.result.thread.thread_id,
      })
    } catch (e) {
      logger.error("Failed to create thread", e)
      res
        .status(500)
        .json(createErrorResponse({ message: "An unknown error occurred" }))
      return
    }
    res.status(201).json(
      createResponse({
        result: "Success",
      }),
    )
  },
)
