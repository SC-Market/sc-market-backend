import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import { Response500 as Response500 } from "../openapi.js"

oapi.schema("ShipImportRequest", {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string", description: "Ship name" },
      ship_code: { type: "string", description: "Ship identifier code" },
    },
    required: ["name", "ship_code"],
  },
})

oapi.schema("Ship", {
  type: "object",
  properties: {
    ship_id: { type: "string" },
    name: { type: "string" },
    kind: { type: "string" },
    owner: { type: "string" },
    image: { type: "string", nullable: true },
    size: { type: "string", nullable: true },
    manufacturer: { type: "string", nullable: true },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
  required: ["ship_id", "name", "kind", "owner"],
})

export const ship_post_import_spec = oapi.validPath({
  summary: "Import ships from JSON file",
  description: "Import multiple ships from a preformatted JSON file",
  operationId: "importShips",
  tags: ["Ships"],
  requestBody: {
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ShipImportRequest" },
      },
    },
  },
  responses: {
    "200": {
      description: "Ships imported successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              result: { type: "string", example: "Success!" },
            },
          },
        },
      },
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})

export const ships_get_mine_spec = oapi.validPath({
  summary: "Get user's ships",
  description: "Get all ships owned by the authenticated user",
  operationId: "getMyShips",
  tags: ["Ships"],
  responses: {
    "200": {
      description: "User's ships retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/Ship" },
          },
        },
      },
    },
    "401": Response401,
    "500": Response500,
  },
  security: [{ bearerAuth: [] }],
})
