import express from "express"
import { userAuthorized, requireOrdersWrite } from "../../../middleware/auth.js"

import { delivery_post_create, deliveries_get_mine } from "./controller.js"

import {
  delivery_post_create_spec,
  deliveries_get_mine_spec,
} from "./openapi.js"

export const deliveryRouter = express.Router()

// OpenAPI Schema Definitions

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

deliveryRouter.post(
  "/create",
  delivery_post_create_spec,
  userAuthorized,
  requireOrdersWrite,
  delivery_post_create,
)

export const deliveriesRouter = express.Router()

deliveriesRouter.get(
  "/mine",
  deliveries_get_mine_spec,
  userAuthorized,
  deliveries_get_mine,
)
