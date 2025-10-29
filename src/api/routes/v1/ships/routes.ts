import express from "express"
import {
  userAuthorized,
  requireProfileWrite,
} from "../../../middleware/auth.js"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import { ship_post_import, ships_get_mine } from "./controller.js"

import { ship_post_import_spec, ships_get_mine_spec } from "./openapi.js"

export const shipRouter = express.Router()

// OpenAPI Schema Definitions

/*
 * TODO:
 *  - Upload preformatted ship JSON file :check:
 *  - Delete a ship
 */

shipRouter.post(
  "/import",
  ship_post_import_spec,
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  ship_post_import,
)

export const shipsRouter = express.Router()

shipsRouter.get(
  "/mine",
  ships_get_mine_spec,
  userAuthorized,
  readRateLimit,
  ships_get_mine,
)
