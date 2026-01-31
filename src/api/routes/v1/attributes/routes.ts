import express from "express"
import { adminAuthorized } from "../../../middleware/auth.js"
import {
  readRateLimit,
  writeRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import {
  attributes_get_definitions,
  attributes_post_definitions,
  attributes_put_definitions_name,
  attributes_delete_definitions_name,
  game_items_get_attributes,
  game_items_put_attributes,
  game_items_delete_attributes_name,
  attributes_post_import_game_item,
} from "./controller.js"

export const attributesRouter = express.Router()

// GET /api/v1/attributes/definitions - Get all attribute definitions
attributesRouter.get(
  "/definitions",
  readRateLimit,
  attributes_get_definitions,
)

// POST /api/v1/attributes/definitions - Create new attribute definition (admin only)
attributesRouter.post(
  "/definitions",
  adminAuthorized,
  writeRateLimit,
  attributes_post_definitions,
)

// PUT /api/v1/attributes/definitions/:name - Update attribute definition (admin only)
attributesRouter.put(
  "/definitions/:name",
  adminAuthorized,
  writeRateLimit,
  attributes_put_definitions_name,
)

// DELETE /api/v1/attributes/definitions/:name - Delete attribute definition (admin only)
attributesRouter.delete(
  "/definitions/:name",
  adminAuthorized,
  writeRateLimit,
  attributes_delete_definitions_name,
)

// Game Item Attributes Routes

// GET /api/v1/attributes/game-items/:id - Get all attributes for a game item
attributesRouter.get(
  "/game-items/:id",
  readRateLimit,
  game_items_get_attributes,
)

// PUT /api/v1/attributes/game-items/:id - Upsert attribute for game item (admin only)
attributesRouter.put(
  "/game-items/:id",
  adminAuthorized,
  writeRateLimit,
  game_items_put_attributes,
)

// DELETE /api/v1/attributes/game-items/:id/:name - Delete attribute from game item (admin only)
attributesRouter.delete(
  "/game-items/:id/:name",
  adminAuthorized,
  writeRateLimit,
  game_items_delete_attributes_name,
)

// POST /api/v1/attributes/import/:gameItemId - Trigger attribute import (admin only)
attributesRouter.post(
  "/import/:gameItemId",
  adminAuthorized,
  writeRateLimit,
  attributes_post_import_game_item,
)
