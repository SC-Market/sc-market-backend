import { database } from "../database/knex-db.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"
import * as chatDb from "../../api/routes/v1/chats/database.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import * as marketDb from "../../api/routes/v1/market/database.js"
import * as offerDb from "../../api/routes/v1/offers/database.js"
import express from "express"
import { serializeMessage } from "../../api/routes/v1/chats/serializers.js"
import { handleStatusUpdate } from "../../api/routes/v1/orders/helpers.js"
import { serializeAssignedOrder } from "../../api/routes/v1/orders/serializers.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"
import { User } from "../../api/routes/v1/api-models.js"
import {
  convertQuery,
  handle_quantity_update,
} from "../../api/routes/v1/market/helpers.js"
import { chatServer } from "../messaging/websocket.js"
import logger from "../../logger/logger.js"

export const threadRouter = express.Router()

threadRouter.get("/all", async (req, res) => {
  const thread_ids = await orderDb.getAllThreads()
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
    user = await profileDb.getUserByDiscordId(author_id)
    if (!user) {
      res.status(404).json({ error: "User not found" })
      return
    }
  } catch (e) {
    finalContent = `[${name}]: ${content}`
  }

  let chat

  let order
  try {
    order = await orderDb.getOrder({ thread_id })
    chat = await chatDb.getChat({ order_id: order.order_id })
  } catch (e) {
    const [session] = await offerDb.getOfferSessions({ thread_id })
    if (!session) {
      res.json({ result: "Success" })
      return
    }

    chat = await chatDb.getChat({ session_id: session.id })
  }

  const message = await chatDb.insertMessage({
    author: user?.user_id || null,
    chat_id: chat.chat_id,
    content: finalContent,
  })

  chatServer.emitMessage(await serializeMessage(message))

  if (user) {
    marketDb.upsertDailyActivity(user.user_id)
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
      order = await orderDb.getOrder({ thread_id })
    } else {
      order = await orderDb.getOrder({ order_id })
    }
  } catch (e) {
    logger.error("Error fetching order by thread_id or order_id", { error: e })
    res.status(400).json({ error: "Invalid order" })
    return
  }

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.status(404).json({ error: "User not found" })
    return
  }
  req.order = order
  req.user = user

  await handleStatusUpdate(req, res, status)
  
  // Send response if handleStatusUpdate didn't send one (no error occurred)
  if (!res.headersSent) {
    res.status(200).json({ result: "Success" })
  }
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

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  let listing
  try {
    listing = await marketDb.getMarketListing({ listing_id })
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

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  const orders = await orderDb.getRelatedActiveOrders(user.user_id)

  const contractors = await contractorDb.getUserContractors({
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

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  const contractors = await contractorDb.getUserContractors({
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

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  const listings = await marketDb.searchMarket(
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
      user = await profileDb.getUserByDiscordId(discord_id)
      if (!user) {
        res.status(404).json({ error: "User not found" })
        return
      }
    } catch (e) {
      res.json({ result: "Success", thread_ids: [] })
      return
    }

    const spectrum_id = req.params["spectrum_id"]
    const contractor = await contractorDb.getContractor({
      spectrum_id: spectrum_id,
    })
    if (!contractor) {
      res.status(400).json({ error: "Invalid contractor" })
      return
    }

    const contractors = await contractorDb.getUserContractors({
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

    const listings = await marketDb.searchMarket(
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

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.json({ result: "Success", thread_ids: [] })
    return
  }

  const orders = await orderDb.getRelatedOrders(user.user_id)
  const offers = await offerDb.getRelatedOffers(user.user_id)
  const thread_ids = orders
    .map((o) => o.thread_id)
    .filter((o) => o)
    .concat(offers.map((o) => o.thread_id).filter((o) => o))

  res.json({ result: "Success", thread_ids })
})
