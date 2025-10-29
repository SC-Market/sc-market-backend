import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import { Response500 as Response500, Response429Write, Response429Read, RateLimitHeaders } from "../openapi.js"

oapi.schema("CreateTransactionRequest", {
  type: "object",
  properties: {
    amount: { type: "number", minimum: 1, description: "Transaction amount" },
    contractor_recipient_id: {
      type: "string",
      nullable: true,
      description: "Recipient contractor spectrum ID",
    },
    user_recipient_id: {
      type: "string",
      nullable: true,
      description: "Recipient username",
    },
    note: { type: "string", nullable: true, description: "Transaction note" },
  },
  required: ["amount"],
})

oapi.schema("Transaction", {
  type: "object",
  properties: {
    transaction_id: { type: "string" },
    kind: { type: "string", enum: ["Payment", "Refund", "Commission"] },
    timestamp: { type: "number", description: "Unix timestamp" },
    amount: { type: "number" },
    status: {
      type: "string",
      enum: ["Pending", "Completed", "Failed", "Cancelled"],
    },
    contractor_sender_id: { type: "string", nullable: true },
    contractor_recipient_id: { type: "string", nullable: true },
    user_sender_id: { type: "string", nullable: true },
    user_recipient_id: { type: "string", nullable: true },
  },
  required: ["transaction_id", "kind", "timestamp", "amount", "status"],
})

export const transaction_get_transaction_id_spec = oapi.validPath({
  summary: "Get transaction by ID",
  description:
    "Get a specific transaction by its ID (user must be related to the transaction)",
  operationId: "getTransaction",
  tags: ["Transactions"],
  parameters: [
    {
      name: "transaction_id",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Transaction ID",
    },
  ],
  responses: {
    "200": {
      description: "Transaction retrieved successfully",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Transaction" },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "500": Response500,
    "429": Response429Read,
  },
  security: [{ bearerAuth: [] }],
})

export const transaction_post_create_spec = oapi.validPath({
  summary: "Create a new transaction",
  description: "Create a transaction between users or contractors",
  operationId: "createTransaction",
  tags: ["Transactions"],
  requestBody: {
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/CreateTransactionRequest" },
      },
    },
  },
  responses: {
    "200": {
      description: "Transaction created successfully",
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "500": Response500,
    "429": Response429Write,
  },
  security: [{ bearerAuth: [] }],
})

export const transaction_post_contractor_spectrum_id_create_spec =
  oapi.validPath({
    summary: "Create contractor transaction",
    description: "Create a transaction on behalf of a contractor",
    operationId: "createContractorTransaction",
    tags: ["Transactions"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Contractor spectrum ID",
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              amount: {
                type: "number",
                minimum: 1,
                description: "Transaction amount",
              },
              contractor_recipient_id: {
                type: "string",
                nullable: true,
                description: "Recipient contractor spectrum ID",
              },
              user_recipient_id: {
                type: "string",
                nullable: true,
                description: "Recipient username",
              },
            },
            required: ["amount"],
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Contractor transaction created successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                result: { type: "string", example: "Success"               },
            },
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "500": Response500,
    "429": Response429Write,
    },
    security: [{ bearerAuth: [] }],
  })

export const transactions_get_mine_spec = oapi.validPath({
  summary: "Get user's transactions",
  description: "Get all transactions for the authenticated user",
  operationId: "getMyTransactions",
  tags: ["Transactions"],
  responses: {
    "200": {
      description: "User's transactions retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/Transaction" },
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "401": Response401,
    "500": Response500,
    "429": Response429Read,
  },
  security: [{ bearerAuth: [] }],
})

export const transactions_get_contractor_spectrum_id_spec = oapi.validPath({
  summary: "Get contractor transactions",
  description:
    "Get all transactions for a specific contractor (requires contractor membership)",
  operationId: "getContractorTransactions",
  tags: ["Transactions"],
  parameters: [
    {
      name: "spectrum_id",
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Contractor spectrum ID",
    },
  ],
  responses: {
    "200": {
      description: "Contractor transactions retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/Transaction" },
          },
        },
      },
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "500": Response500,
    "429": Response429Read,
  },
  security: [{ bearerAuth: [] }],
})
