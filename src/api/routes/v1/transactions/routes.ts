import express, { NextFunction, Request, Response } from "express"
import { userAuthorized, requireOrdersRead } from "../../../middleware/auth.js"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import { User } from "../api-models.js"
import AsyncLock from "async-lock"

import {
  transaction_get_transaction_id,
  transaction_post_create,
  transaction_post_contractor_spectrum_id_create,
  transactions_get_mine,
  transactions_get_contractor_spectrum_id,
} from "./controller.js"

import {
  transaction_get_transaction_id_spec,
  transaction_post_create_spec,
  transaction_post_contractor_spectrum_id_create_spec,
  transactions_get_mine_spec,
  transactions_get_contractor_spectrum_id_spec,
} from "./openapi.js"

export const transactionRouter = express.Router()

transactionRouter.get(
  "/:transaction_id",
  userAuthorized,
  requireOrdersRead,
  readRateLimit,
  transaction_get_transaction_id_spec,
  transaction_get_transaction_id,
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

transactionRouter.post(
  "/create",
  userAuthorized,
  writeRateLimit,
  transaction_post_create_spec,
  transaction_post_create,
)

transactionRouter.post(
  "/contractor/:spectrum_id/create",
  userAuthorized,
  writeRateLimit,
  transaction_post_contractor_spectrum_id_create_spec,
  transaction_post_contractor_spectrum_id_create,
)

export const transactionsRouter = express.Router()

transactionsRouter.get(
  "/mine",
  userAuthorized,
  readRateLimit,
  transactions_get_mine_spec,
  transactions_get_mine,
)

transactionsRouter.get(
  "/contractor/:spectrum_id",
  userAuthorized,
  readRateLimit,
  transactions_get_contractor_spectrum_id_spec,
  transactions_get_contractor_spectrum_id,
)
