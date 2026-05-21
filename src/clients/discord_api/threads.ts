import { database, getKnex } from "../database/knex-db.js"
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
import { convertQuery } from "../../api/routes/v1/market/helpers.js"
import { chatServer } from "../messaging/websocket.js"
import logger from "../../logger/logger.js"
import { StockLotService } from "../../services/stock-lot/stock-lot.service.js"
import { withTransaction } from "../database/transaction.js"
import { getOrCreateVariant } from "../../services/market-v2/variant.service.js"
import { checkWatchlistMatches } from "../../services/watchlist/watchlist.service.js"

const stockLotService = new StockLotService()

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
    const currentStock = await stockLotService.getSimpleStock(listing.listing_id)
    new_quantity = currentStock + quantity
  } else if (opt === "sub") {
    const currentStock = await stockLotService.getSimpleStock(listing.listing_id)
    new_quantity = currentStock - quantity
    if (new_quantity < 0) {
      res.status(400).json({ error: "Invalid quantity" })
      return
    }
  }

  try {
    await stockLotService.updateSimpleStock(listing.listing_id, new_quantity)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update stock"
    res.status(400).json({ error: message })
    return
  }
  res.json({ result: "Success" })
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

// ============================================================================
// Discord Marketplace Commands (V2)
// ============================================================================

threadRouter.post("/market/price", async (req, res) => {
  const { discord_id, listing_id, price } = req.body as {
    discord_id: string
    listing_id: string
    price: number
  }

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.status(404).json({ error: "User not found. Link your Discord account on sc-market.space." })
    return
  }

  const db = getKnex()

  const listing = await db("listings").where("listing_id", listing_id).first()
  if (!listing) {
    res.status(404).json({ error: "Listing not found" })
    return
  }

  if (listing.seller_id !== user.user_id && listing.seller_type === "user") {
    res.status(403).json({ error: "You don't own this listing" })
    return
  }

  // Update base_price on the listing_items record
  await db("listing_items")
    .where("listing_id", listing_id)
    .update({ base_price: price })

  await db("listings")
    .where("listing_id", listing_id)
    .update({ updated_at: new Date() })

  // Check watchlist matches for the new price
  checkWatchlistMatches({
    listing_id,
    title: listing.title,
    price,
    quantity: 1,
  }).catch(() => {})

  res.json({ result: "Success" })
})

threadRouter.post("/market/create", async (req, res) => {
  const { discord_id, title, description, price, quantity, contractor_spectrum_id } = req.body as {
    discord_id: string
    title: string
    description: string
    price: number
    quantity: number
    contractor_spectrum_id?: string
  }

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.status(404).json({ error: "User not found. Link your Discord account on sc-market.space." })
    return
  }

  try {
    const db = getKnex()

    let seller_id = user.user_id
    let seller_type: "user" | "contractor" = "user"

    if (contractor_spectrum_id) {
      const contractor = await db("contractors").where("spectrum_id", contractor_spectrum_id).first()
      if (contractor) {
        seller_id = contractor.contractor_id
        seller_type = "contractor"
      }
    }

    const result = await withTransaction(async (trx) => {
      const [listing] = await trx("listings")
        .insert({
          seller_id,
          seller_type,
          title,
          description: description || title,
          status: "active",
          visibility: "public",
          sale_type: "fixed",
          listing_type: "single",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*")

      const [listingItem] = await trx("listing_items")
        .insert({
          listing_id: listing.listing_id,
          game_item_id: null,
          pricing_mode: "unified",
          base_price: price,
          display_order: 0,
          quantity_available: 0,
          variant_count: 0,
        })
        .returning("*")

      const variantId = await getOrCreateVariant(null, { quality_tier: undefined })

      await trx("listing_item_lots").insert({
        item_id: listingItem.item_id,
        variant_id: variantId,
        quantity_total: quantity,
        location_id: null,
        owner_id: user.user_id,
        listed: true,
        game_item_id: null,
        listing_id: listing.listing_id,
        created_at: new Date(),
        updated_at: new Date(),
      })

      return listing
    })

    // Check watchlist matches for the new listing
    checkWatchlistMatches({
      listing_id: result.listing_id,
      title,
      price,
      quantity,
    }).catch(() => {})

    res.json({ result: "Success", listing_id: result.listing_id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create listing"
    logger.error("Error creating listing from Discord", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.post("/market/buy", async (req, res) => {
  const { discord_id, listing_id, quantity, note } = req.body as {
    discord_id: string
    listing_id: string
    quantity: number
    note?: string
  }

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.status(404).json({ error: "User not found. Link your Discord account on sc-market.space." })
    return
  }

  try {
    const db = getKnex()

    const listing = await db("listings").where("listing_id", listing_id).first()
    if (!listing || listing.status !== "active") {
      res.status(400).json({ error: "Listing is not available" })
      return
    }

    if (listing.seller_id === user.user_id) {
      res.status(400).json({ error: "You can't buy your own listing" })
      return
    }

    // Create an order
    const [order] = await db("orders")
      .insert({
        buyer_id: user.user_id,
        seller_id: listing.seller_id,
        seller_type: listing.seller_type,
        listing_id: listing.listing_id,
        quantity,
        status: "placed",
        note: note || null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*")

    res.json({ result: "Success", order_id: order.order_id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to place order"
    logger.error("Error placing order from Discord", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.post("/market/offer", async (req, res) => {
  const { discord_id, listing_id, amount, quantity, message: offerMessage } = req.body as {
    discord_id: string
    listing_id: string
    amount: number
    quantity: number
    message?: string
  }

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.status(404).json({ error: "User not found. Link your Discord account on sc-market.space." })
    return
  }

  try {
    const db = getKnex()

    const listing = await db("listings").where("listing_id", listing_id).first()
    if (!listing || listing.status !== "active") {
      res.status(400).json({ error: "Listing is not available" })
      return
    }

    if (listing.seller_id === user.user_id) {
      res.status(400).json({ error: "You can't make an offer on your own listing" })
      return
    }

    // Create an offer session
    const [session] = await db("offer_sessions")
      .insert({
        buyer_id: user.user_id,
        seller_id: listing.seller_id,
        seller_type: listing.seller_type,
        listing_id: listing.listing_id,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*")

    // Create the offer
    await db("offers").insert({
      session_id: session.id,
      user_id: user.user_id,
      amount,
      quantity,
      message: offerMessage || null,
      status: "pending",
      created_at: new Date(),
    })

    res.json({ result: "Success", session_id: session.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create offer"
    logger.error("Error creating offer from Discord", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.post("/market/import-uex", async (req, res) => {
  const { discord_id, listings } = req.body as {
    discord_id: string
    listings: Array<{
      title: string
      description: string
      price: number
      quantity: number
      quality?: number
      durability?: number
      location?: string
      source?: string
    }>
  }

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.status(404).json({ error: "User not found. Link your Discord account on sc-market.space." })
    return
  }

  try {
    let imported = 0

    for (const item of listings) {
      try {
        await withTransaction(async (trx) => {
          const [listing] = await trx("listings")
            .insert({
              seller_id: user.user_id,
              seller_type: "user",
              title: item.title,
              description: item.description || item.title,
              status: "active",
              visibility: "public",
              sale_type: "fixed",
              listing_type: "single",
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning("*")

          const [listingItem] = await trx("listing_items")
            .insert({
              listing_id: listing.listing_id,
              game_item_id: null,
              pricing_mode: "unified",
              base_price: item.price,
              display_order: 0,
              quantity_available: 0,
              variant_count: 0,
            })
            .returning("*")

          // Build variant attributes from UEX data
          const variantAttrs: Record<string, any> = {}
          if (item.quality != null) {
            variantAttrs.quality_value = item.quality
          }
          if (item.source) {
            const sourceMap: Record<string, string> = {
              looted: "looted",
              pledged: "store",
            }
            variantAttrs.crafted_source = sourceMap[item.source] || "unknown"
          }

          const variantId = await getOrCreateVariant(null, Object.keys(variantAttrs).length > 0 ? variantAttrs : { quality_tier: undefined })

          await trx("listing_item_lots").insert({
            item_id: listingItem.item_id,
            variant_id: variantId,
            quantity_total: item.quantity || 1,
            location_id: null,
            owner_id: user.user_id,
            listed: true,
            game_item_id: null,
            listing_id: listing.listing_id,
            created_at: new Date(),
            updated_at: new Date(),
          })
        })
        imported++
      } catch (itemErr) {
        logger.error("Error importing individual UEX listing", {
          title: item.title,
          error: itemErr instanceof Error ? itemErr.message : String(itemErr),
        })
      }
    }

    res.json({ result: "Success", imported })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to import listings"
    logger.error("Error importing UEX listings", { error: message })
    res.status(500).json({ error: message })
  }
})

// ============================================================================
// Watchlist
// ============================================================================

threadRouter.post("/watchlist/add", async (req, res) => {
  const { discord_id, query, max_price } = req.body as {
    discord_id: string
    query: string
    max_price: number
  }

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.status(404).json({ error: "User not found. Link your Discord account on sc-market.space." })
    return
  }

  try {
    const db = getKnex()

    await db("watchlist_items").insert({
      user_id: user.user_id,
      query,
      max_price,
      created_at: new Date(),
    })

    res.json({ result: "Success" })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add watchlist item"
    logger.error("Error adding watchlist item", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.post("/watchlist/remove", async (req, res) => {
  const { discord_id, watchlist_id } = req.body as {
    discord_id: string
    watchlist_id: string
  }

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.status(404).json({ error: "User not found. Link your Discord account on sc-market.space." })
    return
  }

  try {
    const db = getKnex()

    const deleted = await db("watchlist_items")
      .where({ id: watchlist_id, user_id: user.user_id })
      .delete()

    if (!deleted) {
      res.status(404).json({ error: "Watchlist item not found" })
      return
    }

    res.json({ result: "Success" })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to remove watchlist item"
    logger.error("Error removing watchlist item", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.get("/watchlist/:discord_id", async (req, res) => {
  const discord_id = req.params.discord_id

  const user = await profileDb.getUserByDiscordId(discord_id)
  if (!user) {
    res.json({ items: [] })
    return
  }

  try {
    const db = getKnex()

    const items = await db("watchlist_items")
      .where("user_id", user.user_id)
      .orderBy("created_at", "desc")
      .select("id", "query", "max_price", "created_at")

    // For each item, check if there's a current listing below the price
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const lowestListing = await db("listing_search")
          .whereRaw("search_vector @@ plainto_tsquery('english', ?)", [item.query])
          .where("status", "active")
          .where("quantity_available", ">", 0)
          .orderBy("price_min", "asc")
          .first("price_min")

        return {
          ...item,
          current_lowest: lowestListing?.price_min ? parseInt(lowestListing.price_min) : null,
        }
      }),
    )

    res.json({ items: enrichedItems })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch watchlist"
    logger.error("Error fetching watchlist", { error: message })
    res.status(500).json({ error: message })
  }
})

// ═══════════════════════════════════════════════════════════════════
// Blueprint / Recipe Discord Endpoints
// ═══════════════════════════════════════════════════════════════════

threadRouter.get("/blueprints/search", async (req, res) => {
  try {
    const knex = getKnex()
    const text = (req.query.text as string) || ""
    const limit = Math.min(25, parseInt(req.query.limit as string) || 10)

    let query = knex("blueprints as b")
      .leftJoin("game_items as gi", "b.output_game_item_id", "gi.id")
      .where("b.is_active", true)

    if (text) {
      query = query.whereRaw(
        "b.blueprint_name_tsvector @@ plainto_tsquery('english', ?)",
        [text],
      )
    }

    const results = await query
      .select(
        "b.blueprint_id",
        "b.blueprint_name",
        "b.blueprint_code",
        "b.item_category",
        "b.rarity",
        "b.output_quantity",
        "gi.name as output_item_name",
      )
      .orderBy("b.blueprint_name")
      .limit(limit)

    res.json({ blueprints: results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Blueprint search failed"
    logger.error("Blueprint search error", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.get("/blueprints/:blueprint_id", async (req, res) => {
  try {
    const knex = getKnex()
    const { blueprint_id } = req.params

    const bp = await knex("blueprints as b")
      .leftJoin("game_items as gi", "b.output_game_item_id", "gi.id")
      .where("b.blueprint_id", blueprint_id)
      .select("b.*", "gi.name as output_item_name")
      .first()

    if (!bp) return res.status(404).json({ error: "Blueprint not found" })

    const ingredients = await knex("blueprint_ingredients as bi")
      .leftJoin("game_items as ig", "bi.ingredient_game_item_id", "ig.id")
      .where("bi.blueprint_id", blueprint_id)
      .orderBy("bi.display_order")
      .select(
        "bi.ingredient_id",
        "bi.quantity_required",
        "bi.quantity_scu",
        "bi.min_quality_tier",
        "bi.slot_name",
        "bi.slot_display_name",
        "bi.is_alternative",
        "bi.alternative_group",
        "ig.name as ingredient_name",
      )

    res.json({ blueprint: bp, ingredients })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Blueprint detail failed"
    logger.error("Blueprint detail error", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.post("/blueprints/inventory/add", async (req, res) => {
  try {
    const knex = getKnex()
    const { discord_id, blueprint_id, acquisition_method, acquisition_location } = req.body

    if (!discord_id || !blueprint_id) {
      return res.status(400).json({ error: "discord_id and blueprint_id are required" })
    }

    const user = await profileDb.getUserByDiscordId(discord_id)
    if (!user) return res.status(404).json({ error: "User not registered" })

    const bp = await knex("blueprints").where("blueprint_id", blueprint_id).first()
    if (!bp) return res.status(404).json({ error: "Blueprint not found" })

    const existing = await knex("user_blueprint_inventory")
      .where({ user_id: user.user_id, blueprint_id })
      .first()

    if (existing) {
      await knex("user_blueprint_inventory")
        .where("inventory_id", existing.inventory_id)
        .update({
          is_owned: true,
          acquisition_method: acquisition_method || existing.acquisition_method,
          acquisition_location: acquisition_location || existing.acquisition_location,
          acquisition_date: new Date(),
        })
    } else {
      await knex("user_blueprint_inventory").insert({
        user_id: user.user_id,
        blueprint_id,
        blueprint_name: bp.blueprint_name,
        is_owned: true,
        acquisition_method: acquisition_method || "discord",
        acquisition_location: acquisition_location || null,
        acquisition_date: new Date(),
      })
    }

    res.json({ success: true, blueprint_name: bp.blueprint_name })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add blueprint"
    logger.error("Blueprint inventory add error", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.post("/blueprints/inventory/remove", async (req, res) => {
  try {
    const knex = getKnex()
    const { discord_id, blueprint_id } = req.body

    if (!discord_id || !blueprint_id) {
      return res.status(400).json({ error: "discord_id and blueprint_id are required" })
    }

    const user = await profileDb.getUserByDiscordId(discord_id)
    if (!user) return res.status(404).json({ error: "User not registered" })

    await knex("user_blueprint_inventory")
      .where({ user_id: user.user_id, blueprint_id })
      .update({ is_owned: false })

    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to remove blueprint"
    logger.error("Blueprint inventory remove error", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.get("/blueprints/inventory/:discord_id", async (req, res) => {
  try {
    const knex = getKnex()
    const { discord_id } = req.params

    const user = await profileDb.getUserByDiscordId(discord_id)
    if (!user) return res.status(404).json({ error: "User not registered" })

    const owned = await knex("user_blueprint_inventory as ubi")
      .join("blueprints as b", "ubi.blueprint_id", "b.blueprint_id")
      .leftJoin("game_items as gi", "b.output_game_item_id", "gi.id")
      .where("ubi.user_id", user.user_id)
      .where("ubi.is_owned", true)
      .select(
        "b.blueprint_id",
        "b.blueprint_name",
        "b.blueprint_code",
        "b.item_category",
        "b.rarity",
        "b.output_quantity",
        "gi.name as output_item_name",
        "ubi.acquisition_date",
        "ubi.acquisition_method",
      )
      .orderBy("b.blueprint_name")

    const totalAvailable = await knex("blueprints").where("is_active", true).count("* as count").first()

    res.json({
      blueprints: owned,
      total_owned: owned.length,
      total_available: parseInt(String(totalAvailable?.count || 0)),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch inventory"
    logger.error("Blueprint inventory fetch error", { error: message })
    res.status(500).json({ error: message })
  }
})

threadRouter.get("/blueprints/conversion/:blueprint_id", async (req, res) => {
  try {
    const knex = getKnex()
    const { blueprint_id } = req.params

    const bp = await knex("blueprints as b")
      .leftJoin("game_items as gi", "b.output_game_item_id", "gi.id")
      .where("b.blueprint_id", blueprint_id)
      .select("b.blueprint_name", "b.output_quantity", "gi.name as output_item_name")
      .first()

    if (!bp) return res.status(404).json({ error: "Blueprint not found" })

    const ingredients = await knex("blueprint_ingredients as bi")
      .leftJoin("game_items as ig", "bi.ingredient_game_item_id", "ig.id")
      .where("bi.blueprint_id", blueprint_id)
      .orderBy("bi.display_order")
      .select(
        "bi.quantity_required",
        "bi.quantity_scu",
        "bi.min_quality_tier",
        "bi.is_alternative",
        "bi.alternative_group",
        "bi.slot_display_name",
        "ig.name as ingredient_name",
      )

    const recipe = await knex("crafting_recipes")
      .where("blueprint_id", blueprint_id)
      .first()

    res.json({
      blueprint_name: bp.blueprint_name,
      output_item: bp.output_item_name,
      output_quantity: bp.output_quantity,
      ingredients,
      quality_calculation: recipe?.quality_calculation_type || null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch conversion"
    logger.error("Blueprint conversion error", { error: message })
    res.status(500).json({ error: message })
  }
})
