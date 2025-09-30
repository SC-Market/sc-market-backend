import express from "express"
import {
  userAuthorized,
  requireProfileWrite,
} from "../../../middleware/auth.js"
import { ShipsFileEntry, ShipsFileSchema, User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { DBShip } from "../../../../clients/database/db-models.js"
import { validate } from "jsonschema"
import { shipData } from "../../../../config/fallback/ship-data.js"
import { oapi, Response400, Response401, Response403, Response500 } from "../openapi.js"

async function formatUserShip(ship: DBShip) {
  const owner = await database.getMinimalUser({ user_id: ship.owner })
  const shipInfo = shipData.find(
    (s) =>
      s.scIdentifier.toLowerCase() === ship.kind.toLowerCase() ||
      s.rsiName.toLowerCase() === ship.name.toLowerCase(),
  )

  return {
    ...ship,
    owner: owner.username,
    image: shipInfo?.storeImageMedium,
    size: shipInfo?.sizeLabel,
    kind: shipInfo?.focus,
    manufacturer: shipInfo?.manufacturer.name,
  }
}

export const shipRouter = express.Router()

// OpenAPI Schema Definitions
oapi.schema("ShipImportRequest", {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string", description: "Ship name" },
      ship_code: { type: "string", description: "Ship identifier code" }
    },
    required: ["name", "ship_code"]
  }
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
    updated_at: { type: "string", format: "date-time" }
  },
  required: ["ship_id", "name", "kind", "owner"]
})

/*
 * TODO:
 *  - Upload preformatted ship JSON file :check:
 *  - Delete a ship
 */

shipRouter.post(
  "/import",
  oapi.validPath({
    summary: "Import ships from JSON file",
    description: "Import multiple ships from a preformatted JSON file",
    operationId: "importShips",
    tags: ["Ships"],
    requestBody: {
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ShipImportRequest" }
        }
      }
    },
    responses: {
      "200": {
        description: "Ships imported successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                result: { type: "string", example: "Success!" }
              }
            }
          }
        }
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500
    },
    security: [{ bearerAuth: [] }]
  }),
  userAuthorized,
  requireProfileWrite,
  async (req, res) => {
    const user = req.user as User
    const ships = req.body as ShipsFileEntry[]

    if (!ships) {
      res.status(400).json({
        error: "No ships provided",
      })
      return
    }

    if (!validate(ships, ShipsFileSchema).valid) {
      res.status(400).json({
        error: "Invalid ships provided",
      })
      return
    }

    await Promise.all(
      ships.map((ship) => {
        return database.createShip({
          owner: user.user_id,
          name: ship.name,
          kind: ship.ship_code,
        })
      }),
    )

    res.status(200).json({ result: "Success!" })
    return
  },
)

export const shipsRouter = express.Router()

shipsRouter.get("/mine", 
  oapi.validPath({
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
              items: { $ref: "#/components/schemas/Ship" }
            }
          }
        }
      },
      "401": Response401,
      "500": Response500
    },
    security: [{ bearerAuth: [] }]
  }),
  userAuthorized, 
  async (req, res) => {
  const user = req.user as User
  const ships = await database.getShips({ owner: user.user_id })

  res.json(await Promise.all(ships.map(formatUserShip)))
})
