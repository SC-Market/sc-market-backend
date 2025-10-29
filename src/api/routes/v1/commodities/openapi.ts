import { adminOapi as adminOapi } from "../openapi.js"
import {
  Response500 as Response500,
  Response429Read,
  RateLimitHeaders,
} from "../openapi.js"

adminOapi.schema("Commodity", {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    category: { type: "string", nullable: true },
    base_price: { type: "number", nullable: true },
    current_price: { type: "number", nullable: true },
    supply_demand: { type: "string", nullable: true },
    locations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          location: { type: "string" },
          price: { type: "number" },
          supply: { type: "number", nullable: true },
          demand: { type: "number", nullable: true },
        },
      },
    },
  },
  required: ["id", "name"],
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
