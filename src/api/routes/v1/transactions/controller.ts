import { RequestHandler } from "express"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"
import * as transactionDb from "./database.js"
import { DBContractor as DBContractor } from "../../../../clients/database/db-models.js"
import { DBTransaction as DBTransaction } from "../../../../clients/database/db-models.js"
import { User as User } from "../api-models.js"
import { has_permission as has_permission } from "../util/permissions.js"
import logger from "../../../../logger/logger.js"
import { withTransaction } from "../../../../clients/database/transaction.js"

export const transaction_get_transaction_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const transaction_id = req.params["transaction_id"]
  let transaction: DBTransaction
  try {
    transaction = await transactionDb.getTransaction({
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
        await contractorDb.getContractor({
          contractor_id: transaction.contractor_sender_id,
        })
      ).spectrum_id,
    contractor_recipient_id:
      transaction.contractor_recipient_id &&
      (
        await contractorDb.getContractor({
          contractor_id: transaction.contractor_recipient_id,
        })
      ).spectrum_id,
    user_sender_id:
      transaction.user_sender_id &&
      (await profileDb.getUser({ user_id: transaction.user_sender_id }))
        .username,
    user_recipient_id:
      transaction.user_recipient_id &&
      (await profileDb.getUser({ user_id: transaction.user_recipient_id }))
        .username,
  })
}

export const transaction_post_create: RequestHandler = async (
  req,
  res,
  next,
) => {
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
      target_contractor = await contractorDb.getContractor({
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
      target_user = await profileDb.getUser({ username: user_recipient_id })
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

  // Wrap all balance operations in a transaction for atomicity
  try {
    await withTransaction(
      async (trx) => {
        // Decrement sender balance
        await profileDb.decrementUserBalance(user.user_id, amount, trx)

        // Increment recipient balance
        if (contractor_recipient_id) {
          await contractorDb.incrementContractorBalance(
            target_contractor!.contractor_id,
            amount,
            trx,
          )
        } else if (user_recipient_id) {
          await profileDb.incrementUserBalance(
            target_user!.user_id,
            amount,
            trx,
          )
        }

        // Create transaction record
        await transactionDb.createTransaction(
          {
            amount: amount,
            note: note || "",
            kind: "Payment",
            status: "Completed",
            contractor_sender_id: null,
            contractor_recipient_id:
              target_contractor && target_contractor.contractor_id,
            user_sender_id: user.user_id,
            user_recipient_id: target_user && target_user.user_id,
          },
          trx,
        )
      },
      {
        isolationLevel: "SERIALIZABLE", // Use highest isolation for financial operations
      },
    )

    res.json({ result: "Success" })
  } catch (error) {
    logger.error("Transaction creation failed", { error, user_id: user.user_id })
    res.status(500).json({ error: "Transaction failed" })
  }
}

export const transaction_post_contractor_spectrum_id_create: RequestHandler =
  async (req, res, next) => {
    const spectrum_id = req.params["spectrum_id"]
    const user = req.user as User

    const contractor = await contractorDb.getContractor({
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
        target_contractor = await contractorDb.getContractor({
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
        target_user = await profileDb.getUser({ username: user_recipient_id })
      } catch {
        res.status(400).json({ error: "Invalid contractor" })
        return
      }
    }

    if (+contractor.balance < amount) {
      res.status(400).json({ error: "Insufficient funds" })
      return
    }

    // Wrap all balance operations in a transaction for atomicity
    try {
      await withTransaction(
        async (trx) => {
          // Decrement sender balance
          await contractorDb.decrementContractorBalance(
            contractor.contractor_id,
            amount,
            trx,
          )

          // Increment recipient balance
          if (contractor_recipient_id) {
            await contractorDb.incrementContractorBalance(
              target_contractor!.contractor_id,
              amount,
              trx,
            )
          } else if (user_recipient_id) {
            await profileDb.incrementUserBalance(
              target_user!.user_id,
              amount,
              trx,
            )
          }

          // Create transaction record
          await transactionDb.createTransaction(
            {
              amount: amount,
              kind: "Payment",
              status: "Completed",
              contractor_sender_id: contractor.contractor_id,
              contractor_recipient_id:
                target_contractor && target_contractor.contractor_id,
              user_sender_id: null,
              user_recipient_id: target_user && target_user.user_id,
            },
            trx,
          )
        },
        {
          isolationLevel: "SERIALIZABLE", // Use highest isolation for financial operations
        },
      )

      res.json({ result: "Success" })
    } catch (error) {
      logger.error("Contractor transaction creation failed", {
        error,
        contractor_id: contractor.contractor_id,
      })
      res.status(500).json({ error: "Transaction failed" })
    }
  }

export const transactions_get_mine: RequestHandler = async (req, res, next) => {
  const user = req.user as User
  const transactions = await transactionDb.getUserTransactions(user.user_id)

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
            await contractorDb.getContractor({
              contractor_id: transaction.contractor_sender_id,
            })
          ).spectrum_id,
        contractor_recipient_id:
          transaction.contractor_recipient_id &&
          (
            await contractorDb.getContractor({
              contractor_id: transaction.contractor_recipient_id,
            })
          ).spectrum_id,
        user_sender_id:
          transaction.user_sender_id &&
          (await profileDb.getUser({ user_id: transaction.user_sender_id }))
            .username,
        user_recipient_id:
          transaction.user_recipient_id &&
          (await profileDb.getUser({ user_id: transaction.user_recipient_id }))
            .username,
      })),
    ),
  )
}

export const transactions_get_contractor_spectrum_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const spectrum_id = req.params["spectrum_id"]
  const contractor = await contractorDb.getContractor({
    spectrum_id: spectrum_id,
  })
  if (!contractor) {
    res.status(400).json({ error: "Invalid contractor" })
    return
  }

  const user = req.user as User
  const contractors = await contractorDb.getUserContractors({
    "contractor_members.user_id": user.user_id,
  })

  if (
    contractors.filter(
      (c: DBContractor) => c.contractor_id === contractor.contractor_id,
    ).length === 0
  ) {
    res
      .status(403)
      .json({ error: "You are not authorized to view these transactions" })
    return
  }

  const transactions = await transactionDb.getContractorTransactions(
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
            await contractorDb.getContractor({
              contractor_id: transaction.contractor_sender_id,
            })
          ).spectrum_id,
        contractor_recipient_id:
          transaction.contractor_recipient_id &&
          (
            await contractorDb.getContractor({
              contractor_id: transaction.contractor_recipient_id,
            })
          ).spectrum_id,
        user_sender_id:
          transaction.user_sender_id &&
          (await profileDb.getUser({ user_id: transaction.user_sender_id }))
            .username,
        user_recipient_id:
          transaction.user_recipient_id &&
          (await profileDb.getUser({ user_id: transaction.user_recipient_id }))
            .username,
      })),
    ),
  )
}
