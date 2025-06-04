import express, { NextFunction, Request, Response } from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  DBContractor,
  DBTransaction,
} from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import AsyncLock from "async-lock"
import { has_permission } from "../util/permissions.js"

export const transactionRouter = express.Router()

transactionRouter.get(
  "/:transaction_id",
  userAuthorized,
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

transactionRouter.post("/create", userAuthorized, async (req, res, next) => {
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

transactionsRouter.get("/mine", userAuthorized, async (req, res, next) => {
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
