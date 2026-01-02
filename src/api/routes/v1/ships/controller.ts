import { RequestHandler } from "express"
import { ShipsFileEntry as ShipsFileEntry } from "../api-models.js"
import { ShipsFileSchema as ShipsFileSchema } from "../api-models.js"
import { User as User } from "../api-models.js"
import { database as database } from "../../../../clients/database/knex-db.js"
import * as shipDb from "./database.js"
import * as profileDb from "../profiles/database.js"
import { validate as validate } from "jsonschema"
import { DBShip } from "../../../../clients/database/db-models.js"
import { shipData } from "../../../../config/fallback/ship-data.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"

export const ship_post_import: RequestHandler = async (req, res) => {
  const user = req.user as User
  const ships = req.body as ShipsFileEntry[]

  if (!ships) {
    res
      .status(400)
      .json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, "No ships provided"),
      )
    return
  }

  if (!validate(ships, ShipsFileSchema).valid) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "Invalid ships provided",
        ),
      )
    return
  }

  await Promise.all(
    ships.map((ship) => {
      return shipDb.createShip({
        owner: user.user_id,
        name: ship.name,
        kind: ship.ship_code,
      })
    }),
  )

  res.status(200).json(createResponse({ result: "Success!" }))
  return
}

export const ships_get_mine: RequestHandler = async (req, res) => {
  const user = req.user as User
  const ships = await shipDb.getShips({ owner: user.user_id })

  res.json(createResponse(await Promise.all(ships.map(formatUserShip))))
}

async function formatUserShip(ship: DBShip) {
  const owner = await profileDb.getMinimalUser({ user_id: ship.owner })
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
