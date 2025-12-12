import {
  userAuthorized,
  requireOffersRead,
  requireOffersWrite,
} from "../../../middleware/auth.js"

import {
  writeRateLimit,
  readRateLimit,
  commonWriteRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import express from "express"

import { can_respond_to_offer, related_to_offer } from "./middleware.js"
import { validate_optional_spectrum_id } from "../contractors/middleware.js"
import { validate_optional_username } from "../profiles/middleware.js"

import {
  offer_get_session_id,
  offer_put_session_id,
  post_session_id_thread,
  get_search,
} from "./controller.js"

import {
  offer_get_session_id_spec,
  offer_put_session_id_spec,
  post_session_id_thread_spec,
  get_search_spec,
} from "./openapi.js"

export const offersRouter = express.Router()
export const offerRouter = express.Router()

offerRouter.get(
  "/:session_id",
  userAuthorized,
  requireOffersRead,
  offer_get_session_id_spec,
  readRateLimit,
  userAuthorized,
  related_to_offer,
  offer_get_session_id,
)

offerRouter.put(
  "/:session_id",
  userAuthorized,
  requireOffersWrite,
  related_to_offer,
  offer_put_session_id_spec,
  commonWriteRateLimit,
  can_respond_to_offer,
  offer_put_session_id,
)

offersRouter.post(
  "/:session_id/thread",
  userAuthorized,
  requireOffersWrite,
  post_session_id_thread_spec,
  writeRateLimit,
  userAuthorized,
  related_to_offer,
  post_session_id_thread,
)

offersRouter.get(
  "/search",
  userAuthorized,
  requireOffersRead,
  get_search_spec,
  readRateLimit,
  userAuthorized,
  validate_optional_username("customer"),
  validate_optional_username("assigned"),
  validate_optional_spectrum_id("contractor"),
  get_search,
)
