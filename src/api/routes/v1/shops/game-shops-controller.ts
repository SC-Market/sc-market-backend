import { RequestHandler } from "express"
import { getKnex } from "../../../../clients/database/knex-db.js"
import logger from "../../../../logger/logger.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"

const knex = () => getKnex()

/**
 * GET /shops/game
 * List all in-game NPC shops with location, optionally filtered by location.
 */
export const game_shops_list: RequestHandler = async function (req, res) {
  try {
    const { location, search } = req.query

    let query = knex()("game_shops").select(
      "id",
      "name",
      "location",
      "filename",
      "created_at",
      "updated_at",
    )

    if (location && typeof location === "string") {
      query = query.where("location", "ilike", `%${location}%`)
    }

    if (search && typeof search === "string") {
      query = query.where("name", "ilike", `%${search}%`)
    }

    query = query.orderBy("location").orderBy("name")

    const shops = await query

    // Add item count per shop
    const shopIds = shops.map((s: any) => s.id)
    const counts = await knex()("game_shop_items")
      .whereIn("shop_id", shopIds)
      .groupBy("shop_id")
      .select("shop_id")
      .count("* as item_count")

    const countMap = new Map<string, number>()
    for (const row of counts) {
      countMap.set(row.shop_id as string, Number(row.item_count))
    }

    const result = shops.map((s: any) => ({
      ...s,
      item_count: countMap.get(s.id) || 0,
    }))

    res.json(createResponse(result))
  } catch (error) {
    logger.error("Error in game_shops_list", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to fetch game shops",
      ),
    )
  }
}

/**
 * GET /shops/game/:id/items
 * List items in a specific shop with prices.
 */
export const game_shops_get_items: RequestHandler = async function (req, res) {
  try {
    const { id } = req.params
    const { type, search, buyable, sellable } = req.query

    // Verify shop exists
    const shop = await knex()("game_shops").where("id", id).first()
    if (!shop) {
      res.status(404).json(
        createErrorResponse(ErrorCode.NOT_FOUND, "Shop not found"),
      )
      return
    }

    let query = knex()("game_shop_items")
      .where("shop_id", id)
      .select(
        "game_shop_items.id",
        "game_shop_items.game_item_id",
        "game_shop_items.item_uuid",
        "game_shop_items.item_name",
        "game_shop_items.item_type",
        "game_shop_items.item_sub_type",
        "game_shop_items.buy_price",
        "game_shop_items.sell_price",
      )

    if (type && typeof type === "string") {
      query = query.where("game_shop_items.item_type", type)
    }

    if (search && typeof search === "string") {
      query = query.where("game_shop_items.item_name", "ilike", `%${search}%`)
    }

    if (buyable === "true") {
      query = query.where("game_shop_items.buy_price", ">", 0)
    }

    if (sellable === "true") {
      query = query.where("game_shop_items.sell_price", ">", 0)
    }

    query = query.orderBy("game_shop_items.item_name")

    const items = await query

    res.json(
      createResponse({
        shop: {
          id: shop.id,
          name: shop.name,
          location: shop.location,
        },
        items,
      }),
    )
  } catch (error) {
    logger.error("Error in game_shops_get_items", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to fetch shop items",
      ),
    )
  }
}

/**
 * GET /shops/game/items/:itemId/shops
 * List which shops sell/buy a specific item.
 * Accepts either a game_item_id (UUID from game_items table) or an item_uuid (p4k UUID).
 */
export const game_shops_for_item: RequestHandler = async function (req, res) {
  try {
    const { itemId } = req.params

    // Try to find by game_item_id first, then by item_uuid
    let query = knex()("game_shop_items")
      .join("game_shops", "game_shops.id", "game_shop_items.shop_id")
      .select(
        "game_shops.id as shop_id",
        "game_shops.name as shop_name",
        "game_shops.location as shop_location",
        "game_shop_items.item_name",
        "game_shop_items.item_type",
        "game_shop_items.buy_price",
        "game_shop_items.sell_price",
      )

    // Check if it's a game_item_id or item_uuid
    const gameItem = await knex()("game_items").where("id", itemId).first()
    if (gameItem) {
      // Find by game_item_id link
      query = query.where("game_shop_items.game_item_id", itemId)
    } else {
      // Try as item_uuid (p4k UUID)
      query = query.where("game_shop_items.item_uuid", itemId)
    }

    query = query.orderBy("game_shop_items.buy_price", "asc")

    const shops = await query

    if (shops.length === 0) {
      res.status(404).json(
        createErrorResponse(ErrorCode.NOT_FOUND, "No shops found for this item"),
      )
      return
    }

    res.json(
      createResponse({
        item: {
          id: itemId,
          name: shops[0].item_name,
          type: shops[0].item_type,
        },
        shops: shops.map((s: any) => ({
          shop_id: s.shop_id,
          shop_name: s.shop_name,
          shop_location: s.shop_location,
          buy_price: s.buy_price,
          sell_price: s.sell_price,
        })),
      }),
    )
  } catch (error) {
    logger.error("Error in game_shops_for_item", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to fetch shops for item",
      ),
    )
  }
}

/**
 * GET /shops/game/locations
 * List all unique locations that have shops.
 */
export const game_shops_locations: RequestHandler = async function (_req, res) {
  try {
    const locations = await knex()("game_shops")
      .distinct("location")
      .orderBy("location")
      .select("location")
      .count("* as shop_count")
      .groupBy("location")

    res.json(createResponse(locations))
  } catch (error) {
    logger.error("Error in game_shops_locations", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to fetch shop locations",
      ),
    )
  }
}
