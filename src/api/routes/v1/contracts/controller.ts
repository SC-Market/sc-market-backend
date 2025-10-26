import { RequestHandler } from "express"
import { createOffer as createOffer } from "../orders/helpers.js"
import { database as database } from "../../../../clients/database/knex-db.js"
import { User as User } from "../api-models.js"
import { createErrorResponse as createErrorResponse } from "../util/response.js"
import { createResponse as createResponse } from "../util/response.js"
import { DBPublicContract as DBPublicContract } from "./types.js"
import { has_permission as has_permission } from "../util/permissions.js"
import { DBContractor as DBContractor } from "../../../../clients/database/db-models.js"
import { serializePublicContract as serializePublicContract } from "./serializers.js"

export const contracts_post_root: RequestHandler = async (req, res) => {
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
}

export const contracts_post_contract_id_offers: RequestHandler = async (
  req,
  res,
  next,
) => {
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

  // Check if customer is blocked by contractor
  const isBlocked = await database.checkIfBlockedForOrder(
    req.contract!.customer_id,
    contractor?.contractor_id || null,
    contractor ? null : user?.user_id,
  )
  if (isBlocked) {
    res.status(403).json(
      createErrorResponse({
        message:
          "You are blocked from creating offers with this contractor or user",
      }),
    )
    return
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
}

export const contracts_get_contract_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const contract = req.contract!

  res.status(200).json(createResponse(await serializePublicContract(contract)))
}

export const contracts_get_root: RequestHandler = async (req, res, next) => {
  const contracts = await database
    .knex<DBPublicContract>("public_contracts")
    .where({ status: "active" })
    .orderBy("timestamp", "DESC")
    .select()

  res
    .status(200)
    .json(
      createResponse(await Promise.all(contracts.map(serializePublicContract))),
    )
}
