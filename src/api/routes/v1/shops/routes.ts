import express from "express"
import { readRateLimit } from "../../../middleware/enhanced-ratelimiting.js"
import {
  game_shops_list,
  game_shops_get_items,
  game_shops_for_item,
  game_shops_locations,
} from "./game-shops-controller.js"

export const shopRouter = express.Router()

// =============================================================================
// In-Game NPC Shop Routes (Data.p4k extracted shop inventories)
// =============================================================================

// GET /shops/game — List all in-game shops (optionally filter by ?location= or ?search=)
shopRouter.get("/game", readRateLimit, game_shops_list)

// GET /shops/game/locations — List unique locations with shop counts
shopRouter.get("/game/locations", readRateLimit, game_shops_locations)

// GET /shops/game/:id/items — List items in a specific shop with buy/sell prices
shopRouter.get("/game/:id/items", readRateLimit, game_shops_get_items)

// GET /shops/game/items/:itemId/shops — Find which shops sell/buy a specific item
shopRouter.get("/game/items/:itemId/shops", readRateLimit, game_shops_for_item)
