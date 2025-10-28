import express from "express"

import {
  starmap_get_route_from_to,
  starmap_get_route_identifier,
  starmap_get_search_query,
} from "./controller.js"

import {
  starmap_get_route_from_to_spec,
  starmap_get_route_identifier_spec,
  starmap_get_search_query_spec,
} from "./openapi.js"

export const starmapRouter = express.Router()

starmapRouter.get(
  "/route/:from/:to",
  starmap_get_route_from_to_spec,
  starmap_get_route_from_to,
)

starmapRouter.get(
  "/route/:identifier",
  starmap_get_route_identifier_spec,
  starmap_get_route_identifier,
)

starmapRouter.get(
  "/search/:query",
  starmap_get_search_query_spec,
  starmap_get_search_query,
)
