import express from "express"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
} from "../openapi.js"
import { verifiedUser } from "../../../middleware/auth.js"
import { createOffer, orderTypes, paymentTypes } from "../orders/helpers.js"
import { database } from "../../../../clients/database/knex-db.js"
import { User } from "../api-models.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { DBPublicContract } from "./types.js"
import { has_permission } from "../util/permissions.js"
import { DBContractor } from "../../../../clients/database/db-models.js"
import { valid_public_contract } from "./middleware.js"
import { serializePublicContract } from "./serializers.js"

export const contractsRouter = express.Router()

oapi.schema("PublicContractBody", {
  properties: {
    title: {
      title: "PublicContractBody.title",
      type: "string",
      maxLength: 100,
      minLength: 1,
    },
    description: {
      title: "PublicContractBody.description",
      type: "string",
      maxLength: 2000,
    },
    kind: {
      enum: orderTypes,
      title: "PublicContractBody.kind",
      type: "string",
    },
    collateral: {
      title: "PublicContractBody.collateral",
      type: "integer",
      minimum: 0,
    },
    departure: {
      title: "PublicContractBody.departure",
      type: "string",
      nullable: true,
      maxLength: 30,
    },
    destination: {
      title: "PublicContractBody.destination",
      type: "string",
      nullable: true,
      maxLength: 30,
    },
    cost: {
      title: "PublicContractBody.cost",
      type: "integer",
      minimum: 0,
    },
    payment_type: {
      enum: paymentTypes,
      title: "PublicContractBody.payment_type",
      type: "string",
    },
  },
  required: [
    "title",
    // "rush",
    "description",
    "kind",
    "collateral",
    // "departure",
    // "destination",
    "cost",
    "payment_type",
  ],
  additionalProperties: false,
  title: "PublicContractBody",
  type: "object",
})

contractsRouter.post(
  "",
  oapi.validPath({
    summary: "Create a public contract",
    deprecated: false,
    description: "",
    operationId: "createPublicContract",
    tags: ["Public Contracts"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("PublicContractBody"),
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
                    contract_id: {
                      nullable: false,
                      title: "contract_id",
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
  async (req, res) => {
    const [contract] = await database.insertPublicContract({
      title: req.body.title,
      description: req.body.description,
      // rush: req.body.rush,
      departure: req.body.departure,
      destination: req.body.destination,
      cost: req.body.cost,
      payment_type: req.body.payment_type,
      kind: req.body.kind,
      collateral: req.body.collateral,
      customer_id: (req.user as User).user_id,
    })

    res.status(201).json(createResponse({ contract_id: contract.id }))
    return
  },
)

oapi.schema("PublicContractOfferBody", {
  properties: {
    title: {
      title: "PublicContractBody.title",
      type: "string",
      maxLength: 100,
      minLength: 1,
    },
    // rush: {
    //   title: "PublicContractBody.rush",
    //   type: "boolean",
    // },
    description: {
      title: "PublicContractBody.description",
      type: "string",
      maxLength: 2000,
    },
    kind: {
      enum: orderTypes,
      title: "PublicContractBody.kind",
      type: "string",
    },
    collateral: {
      title: "PublicContractBody.collateral",
      type: "integer",
      minimum: 0,
    },
    departure: {
      title: "PublicContractBody.departure",
      type: "string",
      nullable: true,
      maxLength: 30,
    },
    destination: {
      title: "PublicContractBody.destination",
      type: "string",
      nullable: true,
      maxLength: 30,
    },
    cost: {
      title: "PublicContractBody.cost",
      type: "integer",
      minimum: 0,
    },
    payment_type: {
      enum: paymentTypes,
      title: "PublicContractBody.payment_type",
      type: "string",
    },
    contractor: {
      title: "contractor",
      type: "string",
      description: "The contractor to apply on behalf of",
    },
  },
  required: [],
  additionalProperties: false,
  title: "PublicContractOfferBody",
  type: "object",
})

contractsRouter.post(
  "/:contract_id/offers",
  verifiedUser,
  valid_public_contract,
  oapi.validPath({
    summary: "Create an offer on a public contract",
    deprecated: false,
    description: "",
    operationId: "createContractOffer",
    tags: ["Public Contracts", "Offers"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("PublicContractOfferBody"),
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
  async (req, res, next) => {
    const user = req.user as User

    if (req.contract!.customer_id === user.user_id && !req.body.contractor) {
      res.status(400).json(
        createErrorResponse({
          message: "You cannot create an offer on your own contract",
        }),
      )
      return
    }

    let contractor: DBContractor | null = null
    if (req.body.contractor) {
      try {
        contractor = await database.getContractor({
          spectrum_id: req.body.contractor,
        })
      } catch {
        res
          .status(400)
          .json(createErrorResponse({ message: "Invalid contractor" }))
        return
      }
      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_orders",
        ))
      ) {
        res.status(403).json(
          createErrorResponse({
            message:
              "You do not have permission to make offers on behalf of this contractor",
          }),
        )
        return
      }
    }

    const { session } = await createOffer(
      {
        assigned_id: contractor ? null : user?.user_id,
        contractor_id: contractor?.contractor_id,
        customer_id: req.contract!.customer_id,
      },
      {
        actor_id: user.user_id,
        kind: req.body.kind,
        description: req.body.description,
        cost: req.body.cost,
        title: req.body.title,
        // rush: contract.rush,
        // TODO: Departure / destination
        // departure: departure,
        // destination: destination,
        collateral: req.body.collateral || 0,
        payment_type: req.body.payment_type as "one-time" | "hourly" | "daily",
      },
    )

    await database.insertContractOffers({
      contract_id: req.contract!.id,
      session_id: session.id,
    })

    res.status(201).json(
      createResponse({
        session_id: session.id,
      }),
    )
  },
)

oapi.schema("PublicContract", {
  properties: {
    title: {
      title: "PublicContract.title",
      type: "string",
      maxLength: 100,
      minLength: 1,
    },
    description: {
      title: "PublicContract.description",
      type: "string",
      maxLength: 2000,
    },
    kind: {
      enum: orderTypes,
      title: "PublicContract.kind",
      type: "string",
    },
    collateral: {
      title: "PublicContract.collateral",
      type: "integer",
      minimum: 0,
    },
    departure: {
      title: "PublicContract.departure",
      type: "string",
      nullable: true,
      maxLength: 30,
    },
    destination: {
      title: "PublicContract.destination",
      type: "string",
      nullable: true,
      maxLength: 30,
    },
    cost: {
      title: "PublicContract.cost",
      type: "integer",
      minimum: 0,
    },
    payment_type: {
      enum: paymentTypes,
      title: "PublicContract.payment_type",
      type: "string",
    },
    customer: {
      title: "PublicContract.customer",
      ...oapi.schema("MinimalUser"),
    },
  },
  required: [
    "title",
    "description",
    "kind",
    "collateral",
    "departure",
    "destination",
    "cost",
    "payment_type",
    "customer",
  ],
  additionalProperties: false,
  title: "PublicContractBody",
  type: "object",
})

contractsRouter.get(
  "/:contract_id",
  valid_public_contract,
  oapi.validPath({
    summary: "Get a public contract",
    deprecated: false,
    description: "",
    operationId: "getPublicContract",
    tags: ["Public Contracts"],
    parameters: [
      {
        name: "contract_id",
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
            schema: oapi.schema("PublicContract"),
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  async (req, res, next) => {
    const user = req.user as User
    const contract = req.contract!

    res
      .status(200)
      .json(createResponse(await serializePublicContract(contract)))
  },
)

contractsRouter.get(
  "",
  oapi.validPath({
    summary: "Get public contracts",
    deprecated: false,
    description: "",
    operationId: "getPublicContracts",
    tags: ["Public Contracts"],
    parameters: [],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              items: oapi.schema("PublicContract"),
              type: "array",
              title: "Public Contracts",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  async (req, res, next) => {
    const contracts = await database
      .knex<DBPublicContract>("public_contracts")
      .where({ status: "active" })
      .orderBy("timestamp", "DESC")
      .select()

    res
      .status(200)
      .json(
        createResponse(
          await Promise.all(contracts.map(serializePublicContract)),
        ),
      )
  },
)
