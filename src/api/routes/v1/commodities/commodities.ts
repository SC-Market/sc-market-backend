import express from "express"
import { env } from "../../../../config/env.js"
import { oapi, Response500 } from "../openapi.js"

async function getCommodities() {
  const resp = await fetch("https://api.uexcorp.space/commodities/", {
    headers: {
      api_key: env.UEXCORP_API_KEY!,
      accept: "application/json, text/javascript, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9,fr;q=0.8",
      "content-type": "application/json; charset=UTF-8",
    },
  })
  return await resp.json()
}

export const commodityRouter = express.Router()

// OpenAPI Schema Definitions
oapi.schema("Commodity", {
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

commodityRouter.get(
  "",
  oapi.validPath({
    summary: "Get commodities data",
    description:
      "Get current commodities pricing and market data from UEX Corp",
    operationId: "getCommodities",
    tags: ["Commodities"],
    responses: {
      "200": {
        description: "Commodities data retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: { $ref: "#/components/schemas/Commodity" },
            },
          },
        },
      },
      "500": Response500,
    },
  }),
  async function (req, res) {
    const route = await getCommodities()
    res.json(route)
  },
)
