import { adminOapi as adminOapi } from "../openapi.js"
import {
  Response500 as Response500,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"

adminOapi.schema("Commodity", {
  type: "object",
  properties: {
    id: { type: "integer" },
    id_parent: { type: "integer", nullable: true },
    name: { type: "string" },
    code: { type: "string", description: "UEX code" },
    slug: { type: "string", description: "UEX slug" },
    kind: { type: "string", nullable: true },
    weight_scu: { type: "integer", nullable: true, description: "tons" },
    price_buy: { type: "number", description: "average / SCU" },
    price_sell: { type: "number", description: "average / SCU" },
    is_available: { type: "integer", description: "UEX" },
    is_available_live: { type: "integer", description: "Star Citizen" },
    is_visible: { type: "integer", description: "UEX (public)" },
    is_extractable: { type: "integer", description: "mining only" },
    is_mineral: { type: "integer" },
    is_raw: { type: "integer" },
    is_pure: { type: "integer" },
    is_refined: { type: "integer", description: "refined form" },
    is_refinable: { type: "integer", description: "can be refined" },
    is_harvestable: { type: "integer" },
    is_buyable: { type: "integer" },
    is_sellable: { type: "integer" },
    is_temporary: { type: "integer" },
    is_illegal: {
      type: "integer",
      description: "if restricted in certain jurisdictions",
    },
    is_volatile_qt: {
      type: "integer",
      description: "if volatile in quantum travel",
    },
    is_volatile_time: {
      type: "integer",
      description: "if it becomes unstable over time",
    },
    is_inert: { type: "integer", description: "inert gas" },
    is_explosive: { type: "integer", description: "risk of explosion" },
    is_buggy: {
      type: "integer",
      description: "has known bugs reported recently",
    },
    is_fuel: { type: "integer" },
    wiki: { type: "string", nullable: true },
    date_added: { type: "integer", description: "timestamp" },
    date_modified: { type: "integer", description: "timestamp" },
  },
  required: ["id", "name", "code", "slug", "price_buy", "price_sell"],
})

export const commodity_get_root_spec = adminOapi.validPath({
  summary: "Get commodities data",
  description: "Get current commodities pricing and market data from UEX Corp",
  operationId: "getCommodities",
  tags: ["Commodities"],
  responses: {
    "200": {
      description: "Commodities data retrieved successfully",
      headers: RateLimitHeaders,
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/Commodity" },
          },
        },
      },
    },
    "429": Response429Read,
    "500": Response500,
  },
})
