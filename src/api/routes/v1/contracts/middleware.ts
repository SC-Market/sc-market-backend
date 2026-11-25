import { database } from "../../../../clients/database/knex-db.js"
import { DBPublicContract } from "./types.js"
import { createErrorResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { isUuid } from "../util/uuid-params.js"
import logger from "../../../../logger/logger.js"
import { NextFunction, Request, Response } from "express"

export async function valid_public_contract(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const contract_id = req.params["contract_id"]

  // public_contracts.id is a uuid: a malformed id (scanners request the
  // OpenAPI template "{contract_id}" literally) cannot name a contract, and
  // binding it would make Postgres reject the cast (22P02) -> unhandled 500.
  if (!isUuid(contract_id)) {
    res
      .status(404)
      .json(createErrorResponse({ message: "Invalid public contract" }))
    return
  }

  let contract: DBPublicContract | undefined
  try {
    contract = await database
      .knex<DBPublicContract>("public_contracts")
      .where({ id: contract_id, status: "active" })
      .first()
  } catch (error) {
    // Express 4 does not catch async rejections: answer here.
    logger.error("Failed to load public contract", { contract_id, error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
    return
  }

  if (!contract) {
    res
      .status(404)
      .json(createErrorResponse({ message: "Invalid public contract" }))
    return
  }

  req.contract = contract

  next()
}
