import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response500 as Response500, Response429Read, RateLimitHeaders } from "../openapi.js"

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

export const starmap_get_route_from_to_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "500": Response500,
    "429": Response429Read,
  },
})

export const starmap_get_route_identifier_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "500": Response500,
    "429": Response429Read,
  },
})

export const starmap_get_search_query_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "500": Response500,
    "429": Response429Read,
  },
})
