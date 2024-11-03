import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { has_permission } from "../util/permissions.js"

export const deliveryRouter = express.Router()

/* TODO:
 *  - Allow a user to fetch a delivery iff:
 *      - The user is related to the delivery
 *      - The user owns the vehicle
 *      - The delivery is related to the organization and the user is an admin
 *  - Allow a user to fetch all deliveries related to their vehicles
 *  - Allow a user to fetch all deliveries related to their orders
 *  - Allow a user to fetch all deliveries related to their organization
 *  - Multiple orders per delivery
 */

deliveryRouter.post("/create", userAuthorized, async (req, res, next) => {
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
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  const contractors = await database.getUserContractors({
    user_id: user.user_id,
  })
  const order = await database.getOrder({ order_id })
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
    res.status(403).json({
      error: "You are not allowed to create a delivery for this order",
    })
    return
  }

  const ship = await database.getShip({ ship_id })

  if (!ship || ship.owner !== user.user_id) {
    res
      .status(403)
      .json({ error: "You are not allowed to create a delivery for this ship" })
    return
  }

  await database.createDelivery({
    departure: start,
    destination: end,
    order_id: order_id,
    ship_id: ship_id,
    progress: 0,
    status: "pending",
  })

  res.status(200).json({ result: "Success" })
})

export const deliveriesRouter = express.Router()

deliveriesRouter.get("/mine", userAuthorized, async (req, res, next) => {
  const user = req.user as User
  const orders = await database.getDeliveries({ customer_id: user.user_id })

  res.status(200).json(
    await Promise.all(
      orders.map(async (delivery) => ({
        ...delivery,
        order: await database.getOrder({ order_id: delivery.order_id }),
        ship: await database.getShip({ ship_id: delivery.ship_id }),
      })),
    ),
  )
})
