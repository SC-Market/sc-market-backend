import express from "express"
import { oapi, Response400, Response500 } from "../openapi.js"

export async function getRoute(from: string, to: string, ship_size?: string) {
  const resp = await fetch(
    "https://robertsspaceindustries.com/api/starmap/routes/find",
    {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "content-type": "application/json; charset=UTF-8",
        // "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"91\", \"Chromium\";v=\"91\"",
        // "sec-ch-ua-mobile": "?0",
        // "sec-fetch-dest": "empty",
        // "sec-fetch-mode": "cors",
        // "sec-fetch-site": "same-origin",
        // "x-requested-with": "XMLHttpRequest",
        cookie: "Rsi-Token=",
      },
      // "referrer": "https://robertsspaceindustries.com/starmap/search",
      // "referrerPolicy": "strict-origin-when-cross-origin",
      body: JSON.stringify({
        departure: from,
        destination: to,
        ship_size: ship_size || "L",
      }),
      method: "POST",
      // "mode": "cors"
    },
  )
  const js = (await resp.json()) as { data: any }
  return js.data
}

export async function search(query: string) {
  const resp = await fetch(
    "https://robertsspaceindustries.com/api/starmap/find",
    {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "content-type": "application/json; charset=UTF-8",
        // "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"91\", \"Chromium\";v=\"91\"",
        // "sec-ch-ua-mobile": "?0",
        // "sec-fetch-dest": "empty",
        // "sec-fetch-mode": "cors",
        // "sec-fetch-site": "same-origin",
        // "x-requested-with": "XMLHttpRequest",
        cookie: "Rsi-Token=",
      },
      // "referrer": "https://robertsspaceindustries.com/starmap/search",
      // "referrerPolicy": "strict-origin-when-cross-origin",
      body: JSON.stringify({
        query: query,
      }),
      method: "POST",
      // "mode": "cors"
    },
  )
  const js = (await resp.json()) as any
  return js.data
}

export async function getObject(identifier: string) {
  const resp = await fetch(
    `https://robertsspaceindustries.com/api/starmap/celestial-objects/${identifier}`,
    {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "content-type": "application/json; charset=UTF-8",
        // "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"91\", \"Chromium\";v=\"91\"",
        // "sec-ch-ua-mobile": "?0",
        // "sec-fetch-dest": "empty",
        // "sec-fetch-mode": "cors",
        // "sec-fetch-site": "same-origin",
        // "x-requested-with": "XMLHttpRequest",
        cookie: "Rsi-Token=",
      },
      // "referrer": "https://robertsspaceindustries.com/starmap/search",
      // "referrerPolicy": "strict-origin-when-cross-origin",
      method: "POST",
      // "mode": "cors"
    },
  )
  const js = (await resp.json()) as any
  return js.data.resultset
}

export const starmapRouter = express.Router()

// OpenAPI Schema Definitions
oapi.schema("StarmapRoute", {
  type: "object",
  properties: {
    distance: { type: "number", description: "Route distance" },
    duration: { type: "number", description: "Travel time in seconds" },
    waypoints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          coordinates: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
            },
          },
        },
      },
    },
  },
})

oapi.schema("StarmapObject", {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    type: { type: "string" },
    coordinates: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
    },
    description: { type: "string", nullable: true },
  },
})

oapi.schema("StarmapSearchResult", {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: { $ref: "#/components/schemas/StarmapObject" },
    },
  },
})

starmapRouter.get(
  "/route/:from/:to",
  oapi.validPath({
    summary: "Get route between locations",
    description: "Get a route between two starmap locations",
    operationId: "getStarmapRoute",
    tags: ["Starmap"],
    parameters: [
      {
        name: "from",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Starting location",
      },
      {
        name: "to",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Destination location",
      },
    ],
    responses: {
      "200": {
        description: "Route retrieved successfully",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/StarmapRoute" },
          },
        },
      },
      "400": Response400,
      "500": Response500,
    },
  }),
  async function (req, res) {
    const route = await getRoute(req.params.from, req.params.to)
    res.json(route)
  },
)

starmapRouter.get(
  "/route/:identifier",
  oapi.validPath({
    summary: "Get celestial object",
    description: "Get information about a celestial object by identifier",
    operationId: "getCelestialObject",
    tags: ["Starmap"],
    parameters: [
      {
        name: "identifier",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Celestial object identifier",
      },
    ],
    responses: {
      "200": {
        description: "Celestial object retrieved successfully",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/StarmapObject" },
          },
        },
      },
      "400": Response400,
      "500": Response500,
    },
  }),
  async function (req, res) {
    const route = await getObject(req.params.identifier)
    res.json(route)
  },
)

starmapRouter.get(
  "/search/:query",
  oapi.validPath({
    summary: "Search starmap",
    description: "Search for locations in the starmap",
    operationId: "searchStarmap",
    tags: ["Starmap"],
    parameters: [
      {
        name: "query",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Search query",
      },
    ],
    responses: {
      "200": {
        description: "Search results retrieved successfully",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/StarmapSearchResult" },
          },
        },
      },
      "400": Response400,
      "500": Response500,
    },
  }),
  async function (req, res) {
    const results = await search(req.params.query)
    res.json(results)
  },
)
