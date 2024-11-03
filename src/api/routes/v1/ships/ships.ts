import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import { ShipsFileEntry, ShipsFileSchema, User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { DBShip } from "../../../../clients/database/db-models.js"
import { validate } from "jsonschema"
import { shipData } from "../../../../config/fallback/ship-data.js"

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
/*
 * TODO:
 *  - Upload preformatted ship JSON file :check:
 *  - Delete a ship
 */

shipRouter.post("/import", userAuthorized, async (req, res) => {
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
})

export const shipsRouter = express.Router()

shipsRouter.get("/mine", userAuthorized, async (req, res) => {
  const user = req.user as User
  const ships = await database.getShips({ owner: user.user_id })

  res.status(200).json(await Promise.all(ships.map(formatUserShip)))
})
