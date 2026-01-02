import { RequestHandler } from "express"
import { User as User } from "../api-models.js"
import { database as database } from "../../../../clients/database/knex-db.js"
import * as deliveryDb from "./database.js"
import * as shipDb from "../ships/database.js"
import * as orderDb from "../orders/database.js"
import * as contractorDb from "../contractors/database.js"
import { has_permission as has_permission } from "../util/permissions.js"
import {
  createErrorResponse,
  createResponse,
  createForbiddenErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"

export const delivery_post_create: RequestHandler = async (req, res, next) => {
  const user = req.user as User

  const {
    start,
    end,
    order_id,
    ship_id,
  }: {
    start: string
    end: string
    order_id: string
    ship_id: string
  } = req.body

  if (!start || !end || !order_id || !ship_id) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Missing required fields",
        ),
      )
    return
  }

  const contractors = await contractorDb.getUserContractors({
    user_id: user.user_id,
  })
  const order = await orderDb.getOrder({ order_id })
  let contractor
  let manageOrders
  if (order.contractor_id) {
    contractor = contractors.find(
      (c) => c.contractor_id === order.contractor_id,
    )
    manageOrders = await has_permission(
      contractor!.contractor_id,
      user.user_id,
      "manage_market",
    )
  }
  const unrelated = !(order.assigned_id === user.user_id || manageOrders)

  if (unrelated) {
    res
      .status(403)
      .json(
        createForbiddenErrorResponse(
          "You are not allowed to create a delivery for this order",
        ),
      )
    return
  }

  const ship = await shipDb.getShip({ ship_id })

  if (!ship || ship.owner !== user.user_id) {
    res
      .status(403)
      .json(
        createForbiddenErrorResponse(
          "You are not allowed to create a delivery for this ship",
        ),
      )
    return
  }

  await deliveryDb.createDelivery({
    departure: start,
    destination: end,
    order_id: order_id,
    ship_id: ship_id,
    progress: 0,
    status: "pending",
  })

  res.json(createResponse({ result: "Success" }))
}

export const deliveries_get_mine: RequestHandler = async (req, res, next) => {
  const user = req.user as User
  const orders = await deliveryDb.getDeliveries({ customer_id: user.user_id })

  res.json(
    await Promise.all(
      orders.map(async (delivery: any) => ({
        ...delivery,
        order: await orderDb.getOrder({ order_id: delivery.order_id }),
        ship: await shipDb.getShip({ ship_id: delivery.ship_id }),
      })),
    ),
  )
}
