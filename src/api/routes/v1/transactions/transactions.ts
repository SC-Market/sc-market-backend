import express, { NextFunction, Request, Response } from "express"
import { userAuthorized, requireOrdersRead } from "../../../middleware/auth.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  DBContractor,
  DBTransaction,
} from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import AsyncLock from "async-lock"
import { has_permission } from "../util/permissions.js"
import { oapi, Response400, Response401, Response403, Response500 } from "../openapi.js"

export const transactionRouter = express.Router()

// OpenAPI Schema Definitions
oapi.schema("CreateTransactionRequest", {
  type: "object",
  properties: {
    amount: { type: "number", minimum: 1, description: "Transaction amount" },
    contractor_recipient_id: { type: "string", nullable: true, description: "Recipient contractor spectrum ID" },
    user_recipient_id: { type: "string", nullable: true, description: "Recipient username" },
    note: { type: "string", nullable: true, description: "Transaction note" }
  },
  required: ["amount"]
})

oapi.schema("Transaction", {
  type: "object",
  properties: {
    transaction_id: { type: "string" },
    kind: { type: "string", enum: ["Payment", "Refund", "Commission"] },
    timestamp: { type: "number", description: "Unix timestamp" },
    amount: { type: "number" },
    status: { type: "string", enum: ["Pending", "Completed", "Failed", "Cancelled"] },
    contractor_sender_id: { type: "string", nullable: true },
    contractor_recipient_id: { type: "string", nullable: true },
    user_sender_id: { type: "string", nullable: true },
    user_recipient_id: { type: "string", nullable: true }
  },
  required: ["transaction_id", "kind", "timestamp", "amount", "status"]
})

transactionRouter.get(
  "/:transaction_id",
  oapi.validPath({
    summary: "Get transaction by ID",
    description: "Get a specific transaction by its ID (user must be related to the transaction)",
    operationId: "getTransaction",
    tags: ["Transactions"],
    parameters: [
      {
        name: "transaction_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Transaction ID"
      }
    ],
    responses: {
      "200": {
        description: "Transaction retrieved successfully",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Transaction" }
          }
        }
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500
    },
    security: [{ bearerAuth: [] }]
  }),
  userAuthorized,
  requireOrdersRead,
  async (req, res, next) => {
    const transaction_id = req.params["transaction_id"]
    let transaction: DBTransaction
    try {
      transaction = await database.getTransaction({
        transaction_id: transaction_id,
      })
    } catch (e) {
      res.status(400).json({ error: "Invalid transaction" })
      return
    }
    const user = req.user as User

    const related = [
      transaction.user_sender_id,
      transaction.user_recipient_id,
    ].includes(user.user_id)
    if (!related) {
      res
        .status(403)
        .json({ error: "You are not authorized to view this transaction" })
      return
    }

    // TODO: Factor transaction details into another function
    res.json({
      transaction_id: transaction.transaction_id,
      kind: transaction.kind,
      timestamp: +transaction.timestamp,
      amount: +transaction.amount,
      status: transaction.status,
      contractor_sender_id:
        transaction.contractor_sender_id &&
        (
          await database.getContractor({
            contractor_id: transaction.contractor_sender_id,
          })
        ).spectrum_id,
      contractor_recipient_id:
        transaction.contractor_recipient_id &&
        (
          await database.getContractor({
            contractor_id: transaction.contractor_recipient_id,
          })
        ).spectrum_id,
      user_sender_id:
        transaction.user_sender_id &&
        (await database.getUser({ user_id: transaction.user_sender_id }))
          .username,
      user_recipient_id:
        transaction.user_recipient_id &&
        (await database.getUser({ user_id: transaction.user_recipient_id }))
          .username,
    })
  },
)

const userTransactionLock = new AsyncLock()
const contractorTransactionLock = new AsyncLock()

export async function lockUserTransaction(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user as User
  await userTransactionLock.acquire(user.user_id, next)
}

export async function lockContractorTransaction(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const spectrum_id = req.params["spectrum_id"]
  await contractorTransactionLock.acquire(spectrum_id, next)
}

transactionRouter.post("/create", 
  oapi.validPath({
    summary: "Create a new transaction",
    description: "Create a transaction between users or contractors",
    operationId: "createTransaction",
    tags: ["Transactions"],
    requestBody: {
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CreateTransactionRequest" }
        }
      }
    },
    responses: {
      "200": {
        description: "Transaction created successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                result: { type: "string", example: "Success" }
              }
            }
          }
        }
      },
      "400": Response400,
      "401": Response401,
      "500": Response500
    },
    security: [{ bearerAuth: [] }]
  }),
  userAuthorized, 
  async (req, res, next) => {
  const user = req.user as User

  const {
    amount,
    contractor_recipient_id,
    user_recipient_id,
    note,
  }: {
    amount: number
    contractor_recipient_id: string | null | undefined
    user_recipient_id: string | null | undefined
    note: string | null | undefined
  } = req.body

  if (!amount || (!contractor_recipient_id && !user_recipient_id)) {
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  if (contractor_recipient_id && user_recipient_id) {
    res.status(400).json({
      error: "Must provide either contractor_recipient_id or user_recipient_id",
    })
    return
  }

  if (amount < 1) {
    res.status(400).json({ error: "Invalid transaction amount" })
    return
  }

  let target_contractor: DBContractor | null | undefined
  if (contractor_recipient_id) {
    try {
      target_contractor = await database.getContractor({
        spectrum_id: contractor_recipient_id,
      })
    } catch {
      res.status(400).json({ error: "Invalid contractor" })
      return
    }
  }

  let target_user: User | null | undefined
  if (user_recipient_id) {
    try {
      target_user = await database.getUser({ username: user_recipient_id })
    } catch {
      res.status(400).json({ error: "Invalid contractor" })
      return
    }
  }

  if (target_user?.user_id === user.user_id) {
    res.status(400).json({ error: "Cannot send money to yourself" })
    return
  }

  if (+user!.balance! < amount) {
    res.status(400).json({ error: "Insufficient funds" })
    return
  }
  await database.decrementUserBalance(user.user_id, amount)

  if (contractor_recipient_id) {
    await database.incrementContractorBalance(
      target_contractor!.contractor_id,
      amount,
    )
  } else if (user_recipient_id) {
    await database.incrementUserBalance(target_user!.user_id, amount)
  }

  await database.createTransaction({
    amount: amount,
    note: note || "",
    kind: "Payment",
    status: "Completed",
    contractor_sender_id: null,
    contractor_recipient_id:
      target_contractor && target_contractor.contractor_id,
    user_sender_id: user.user_id,
    user_recipient_id: target_user && target_user.user_id,
  })

  res.json({ result: "Success" })
})

transactionRouter.post(
  "/contractor/:spectrum_id/create",
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
        description: "Contractor spectrum ID"
      }
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              amount: { type: "number", minimum: 1, description: "Transaction amount" },
              contractor_recipient_id: { type: "string", nullable: true, description: "Recipient contractor spectrum ID" },
              user_recipient_id: { type: "string", nullable: true, description: "Recipient username" }
            },
            required: ["amount"]
          }
        }
      }
    },
    responses: {
      "200": {
        description: "Contractor transaction created successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                result: { type: "string", example: "Success" }
              }
            }
          }
        }
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500
    },
    security: [{ bearerAuth: [] }]
  }),
  userAuthorized,
  async (req, res, next) => {
    const spectrum_id = req.params["spectrum_id"]
    const user = req.user as User

    const contractor = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    if (!contractor) {
      res.status(400).json({ error: "Invalid contractor" })
      return
    }

    if (
      await has_permission(
        contractor.contractor_id,
        user.user_id,
        "manage_market",
      )
    ) {
      res.status(403).json({
        error:
          "You are not authorized to create transactions on behalf of this contractor!",
      })
      return
    }

    const {
      amount,
      contractor_recipient_id,
      user_recipient_id,
    }: {
      amount: number
      contractor_recipient_id: string | null | undefined
      user_recipient_id: string | null | undefined
    } = req.body

    if (!amount || (!contractor_recipient_id && !user_recipient_id)) {
      res.status(400).json({ error: "Missing required fields" })
      return
    }

    if (contractor_recipient_id && user_recipient_id) {
      res.status(400).json({
        error:
          "Must provide either contractor_recipient_id or user_recipient_id",
      })
      return
    }

    if (amount < 1) {
      res.status(400).json({ error: "Invalid transaction amount" })
      return
    }

    let target_contractor: DBContractor | null | undefined
    if (contractor_recipient_id) {
      try {
        target_contractor = await database.getContractor({
          spectrum_id: contractor_recipient_id,
        })
      } catch {
        res.status(400).json({ error: "Invalid contractor" })
        return
      }
    }

    if (target_contractor?.contractor_id === contractor.contractor_id) {
      res.status(400).json({ error: "Cannot send money to yourself" })
      return
    }

    let target_user: User | null | undefined
    if (user_recipient_id) {
      try {
        target_user = await database.getUser({ username: user_recipient_id })
      } catch {
        res.status(400).json({ error: "Invalid contractor" })
        return
      }
    }

    if (+contractor.balance < amount) {
      res.status(400).json({ error: "Insufficient funds" })
      return
    }

    await database.decrementContractorBalance(contractor.contractor_id, amount)

    if (contractor_recipient_id) {
      await database.incrementContractorBalance(
        target_contractor!.contractor_id,
        amount,
      )
    } else if (user_recipient_id) {
      await database.incrementUserBalance(target_user!.user_id, amount)
    }

    await database.createTransaction({
      amount: amount,
      kind: "Payment",
      status: "Completed",
      contractor_sender_id: contractor.contractor_id,
      contractor_recipient_id:
        target_contractor && target_contractor.contractor_id,
      user_sender_id: null,
      user_recipient_id: target_user && target_user.user_id,
    })
    // TODO: Make the above an atomic function in PSQL, so that the same dollar isn't spent twice
    res.json({ result: "Success" })
  },
)

export const transactionsRouter = express.Router()

transactionsRouter.get("/mine", 
  oapi.validPath({
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
              items: { $ref: "#/components/schemas/Transaction" }
            }
          }
        }
      },
      "401": Response401,
      "500": Response500
    },
    security: [{ bearerAuth: [] }]
  }),
  userAuthorized, 
  async (req, res, next) => {
  const user = req.user as User
  const transactions = await database.getUserTransactions(user.user_id)

  res.json(
    await Promise.all(
      transactions.map(async (transaction) => ({
        transaction_id: transaction.transaction_id,
        kind: transaction.kind,
        timestamp: +transaction.timestamp,
        amount: +transaction.amount,
        status: transaction.status,
        contractor_sender_id:
          transaction.contractor_sender_id &&
          (
            await database.getContractor({
              contractor_id: transaction.contractor_sender_id,
            })
          ).spectrum_id,
        contractor_recipient_id:
          transaction.contractor_recipient_id &&
          (
            await database.getContractor({
              contractor_id: transaction.contractor_recipient_id,
            })
          ).spectrum_id,
        user_sender_id:
          transaction.user_sender_id &&
          (await database.getUser({ user_id: transaction.user_sender_id }))
            .username,
        user_recipient_id:
          transaction.user_recipient_id &&
          (await database.getUser({ user_id: transaction.user_recipient_id }))
            .username,
      })),
    ),
  )
})

transactionsRouter.get(
  "/contractor/:spectrum_id",
  oapi.validPath({
    summary: "Get contractor transactions",
    description: "Get all transactions for a specific contractor (requires contractor membership)",
    operationId: "getContractorTransactions",
    tags: ["Transactions"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Contractor spectrum ID"
      }
    ],
    responses: {
      "200": {
        description: "Contractor transactions retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: { $ref: "#/components/schemas/Transaction" }
            }
          }
        }
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500
    },
    security: [{ bearerAuth: [] }]
  }),
  userAuthorized,
  async (req, res, next) => {
    const spectrum_id = req.params["spectrum_id"]
    const contractor = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    if (!contractor) {
      res.status(400).json({ error: "Invalid contractor" })
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
        .json({ error: "You are not authorized to view these transactions" })
      return
    }

    const transactions = await database.getContractorTransactions(
      contractor.contractor_id,
    )

    res.json(
      await Promise.all(
        transactions.map(async (transaction) => ({
          transaction_id: transaction.transaction_id,
          kind: transaction.kind,
          timestamp: +transaction.timestamp,
          amount: +transaction.amount,
          status: transaction.status,
          contractor_sender_id:
            transaction.contractor_sender_id &&
            (
              await database.getContractor({
                contractor_id: transaction.contractor_sender_id,
              })
            ).spectrum_id,
          contractor_recipient_id:
            transaction.contractor_recipient_id &&
            (
              await database.getContractor({
                contractor_id: transaction.contractor_recipient_id,
              })
            ).spectrum_id,
          user_sender_id:
            transaction.user_sender_id &&
            (await database.getUser({ user_id: transaction.user_sender_id }))
              .username,
          user_recipient_id:
            transaction.user_recipient_id &&
            (await database.getUser({ user_id: transaction.user_recipient_id }))
              .username,
        })),
      ),
    )
  },
)
