import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import { Response404 as Response404 } from "../openapi.js"
import {
  Response429Write,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"
import { orderTypes as orderTypes } from "../orders/helpers.js"
import { PAYMENT_TYPES as PAYMENT_TYPES } from "../types/payment-types.js"

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
      enum: PAYMENT_TYPES,
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
      enum: PAYMENT_TYPES,
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
      enum: PAYMENT_TYPES,
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

export const contracts_post_root_spec = oapi.validPath({
  summary: "Create a public contract",
  deprecated: false,
  description: "",
  operationId: "createPublicContract",
  tags: ["PublicContracts", "Public Contracts"],
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
})

export const contracts_post_contract_id_offers_spec = oapi.validPath({
  summary: "Create an offer on a public contract",
  deprecated: false,
  description: "",
  operationId: "createContractOffer",
  tags: ["PublicContracts", "Public Contracts", "Offers"],
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
})

export const contracts_get_contract_id_spec = oapi.validPath({
  summary: "Get a public contract",
  deprecated: false,
  description: "",
  operationId: "getPublicContract",
  tags: ["PublicContracts", "Public Contracts"],
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
})

export const contracts_get_root_spec = oapi.validPath({
  summary: "Get public contracts",
  deprecated: false,
  description: "",
  operationId: "getPublicContracts",
  tags: ["PublicContracts", "Public Contracts"],
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
})
