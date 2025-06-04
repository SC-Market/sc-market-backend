import { database } from "../database/knex-db.js"
import express from "express"
import { envoyManager } from "../messaging/envoy.js"
import { serializeMessage } from "../../api/routes/v1/chats/serializers.js"
import { handleStatusUpdate } from "../../api/routes/v1/orders/helpers.js"
import { serializeAssignedOrder } from "../../api/routes/v1/orders/serializers.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"
import { User } from "../../api/routes/v1/api-models.js"
import {
  convertQuery,
  handle_quantity_update,
} from "../../api/routes/v1/market/helpers.js"

export const threadRouter = express.Router()

threadRouter.get("/all", async (req, res) => {
  const thread_ids = await database.getAllThreads()
  res.json({
    result: "Success",
    thread_ids: thread_ids.map((t) => t.thread_id),
  })
})

threadRouter.post("/message", async (req, res) => {
  const {
    author_id,
    thread_id,
    name,
    content,
  }: {
    author_id: string
    name: string
    thread_id: string
    content: string
  } = req.body

  let finalContent = content
  let user = null
  try {
    user = await database.getUser({ discord_id: author_id })
  } catch (e) {
    finalContent = `[${name}]: ${content}`
  }

  let chat

  let order
  try {
    order = await database.getOrder({ thread_id })
    chat = await database.getChat({ order_id: order.order_id })
  } catch (e) {
    const [session] = await database.getOfferSessions({ thread_id })
    if (!session) {
      res.json({ result: "Success" })
      return
    }

    chat = await database.getChat({ session_id: session.id })
  }

  const message = await database.insertMessage({
    author: user?.user_id || null,
    chat_id: chat.chat_id,
    content: finalContent,
  })

  envoyManager.envoy.emitMessage(await serializeMessage(message))

  if (user) {
    database.upsertDailyActivity(user.user_id)
  }

  res.json({ result: "Success" })
})

threadRouter.post("/order/status", async (req, res) => {
  const {
    thread_id,
    discord_id,
    order_id,
    status,
  }: {
    thread_id?: string
    discord_id: string
    order_id?: string
    status: string
  } = req.body

  if (!thread_id && !order_id) {
    res.status(400).json({ error: "Invalid order" })
    return
  }
  if (thread_id && order_id) {
    res.status(400).json({ error: "Invalid order" })
    return
  }

  let order
  try {
    if (thread_id) {
      order = await database.getOrder({ thread_id })
    } else {
      order = await database.getOrder({ order_id })
    }
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid order" })
    return
  }

  const user = await database.getUser({ discord_id })
  req.order = order
  req.user = user

  await handleStatusUpdate(req, res, status)
})

threadRouter.post("/market/quantity/:opt", async (req, res) => {
  const opt = req.params.opt

  const {
    discord_id,
    listing_id,
    quantity,
  }: {
    discord_id: string
    listing_id: string
    quantity: number
  } = req.body

  let user
  try {
    user = await database.getUser({ discord_id: discord_id })
  } catch (e) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  let listing
  try {
    listing = await database.getMarketListing({ listing_id })
  } catch {
    res.status(400).json({ error: "Invalid listing" })
    return
  }

  let new_quantity = quantity
  if (opt === "add") {
    new_quantity = listing.quantity_available + quantity
  } else if (opt === "sub") {
    new_quantity = listing.quantity_available - quantity
    if (new_quantity < 0) {
      res.status(400).json({ error: "Invalid quantity" })
      return
    }
  }

  await handle_quantity_update(res, user, listing, new_quantity)
})

threadRouter.get("/user/:discord_id/assigned", async (req, res) => {
  const discord_id = req.params.discord_id

  let user
  try {
    user = await database.getUser({ discord_id: discord_id })
  } catch (e) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  const orders = await database.getRelatedActiveOrders(user.user_id)

  const contractors = await database.getUserContractors({
    "contractor_members.user_id": user.user_id,
  })

  res.json({
    result: "Success",
    orders: await Promise.all(
      orders.map((o) => serializeAssignedOrder(o, contractors)),
    ),
  })
})

threadRouter.get("/user/:discord_id/contractors", async (req, res) => {
  const discord_id = req.params.discord_id

  let user
  try {
    user = await database.getUser({ discord_id: discord_id })
  } catch (e) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  const contractors = await database.getUserContractors({
    user_id: user.user_id,
  })

  const filteredContractors = []
  for (const contractor of contractors) {
    if (
      await has_permission(
        contractor.contractor_id,
        user.user_id,
        "manage_stock",
      )
    ) {
      filteredContractors.push(contractor)
    }
  }

  res.json({
    result: "Success",
    contractors: filteredContractors,
  })
})

threadRouter.get("/user/:discord_id/listings", async (req, res) => {
  const discord_id = req.params.discord_id

  let user: User
  try {
    user = await database.getUser({ discord_id: discord_id })
  } catch (e) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  const listings = await database.searchMarket(
    await convertQuery({ page_size: "100" }),
    (qb: any) =>
      qb
        .where("user_seller_id", "=", user.user_id)
        .andWhere("status", "!=", "archived"),
  )

  res.json({
    result: "Success",
    listings,
  })
})

threadRouter.get(
  "/user/:discord_id/listings/:spectrum_id",
  async (req, res) => {
    const discord_id = req.params.discord_id

    let user
    try {
      user = await database.getUser({ discord_id: discord_id })
    } catch (e) {
      res.json({ result: "Success", thread_ids: [] })
      return
    }

    const spectrum_id = req.params["spectrum_id"]
    const contractor = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    if (!contractor) {
      res.status(400).json({ error: "Invalid contractor" })
      return
    }

    const contractors = await database.getUserContractors({
      "contractor_members.user_id": user.user_id,
    })

    if (
      contractors.filter((c) => c.contractor_id === contractor.contractor_id)
        .length === 0
    ) {
      res
        .status(403)
        .json({ error: "You are not authorized to view these listings" })
      return
    }

    const listings = await database.searchMarket(
      await convertQuery({ page_size: "100" }),
      (qb: any) =>
        qb
          .where("contractor_seller_id", "=", contractor.contractor_id)
          .andWhere("status", "!=", "archived"),
    )

    res.json({
      result: "Success",
      listings,
    })
  },
)

threadRouter.get("/user/:discord_id", async (req, res) => {
  const discord_id = req.params.discord_id

  let user
  try {
    user = await database.getUser({ discord_id: discord_id })
  } catch (e) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  const orders = await database.getRelatedOrders(user.user_id)
  const offers = await database.getRelatedOffers(user.user_id)
  const thread_ids = orders
    .map((o) => o.thread_id)
    .filter((o) => o)
    .concat(offers.map((o) => o.thread_id).filter((o) => o))

  res.json({ result: "Success", thread_ids })
})
