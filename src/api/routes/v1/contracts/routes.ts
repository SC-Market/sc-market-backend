import express from "express"

import {
  userAuthorized,
  requireOrdersWrite,
} from "../../../middleware/auth.js"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import { valid_public_contract } from "./middleware.js"

import {
  contracts_post_root,
  contracts_post_contract_id_offers,
  contracts_get_contract_id,
  contracts_get_root,
} from "./controller.js"

import {
  contracts_post_root_spec,
  contracts_post_contract_id_offers_spec,
  contracts_get_contract_id_spec,
  contracts_get_root_spec,
} from "./openapi.js"

export const contractsRouter = express.Router()

contractsRouter.post(
  "",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  contracts_post_root_spec,
  contracts_post_root,
)

contractsRouter.post(
  "/:contract_id/offers",
  userAuthorized,
  requireOrdersWrite,
  valid_public_contract,
  writeRateLimit,
  contracts_post_contract_id_offers_spec,
  contracts_post_contract_id_offers,
)

contractsRouter.get(
  "/:contract_id",
  valid_public_contract,
  contracts_get_contract_id_spec,
  readRateLimit,
  contracts_get_contract_id,
)

contractsRouter.get(
  "",
  contracts_get_root_spec,
  readRateLimit,
  contracts_get_root,
)
