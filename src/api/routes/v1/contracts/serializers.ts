import { DBPublicContract } from "./types.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../profiles/database.js"

export async function serializePublicContract(contract: DBPublicContract) {
  const customer = await profileDb.getMinimalUser({
    user_id: contract.customer_id,
  })

  return {
    customer,
    customer_id: contract.customer_id,
    id: contract.id,
    // rush: boolean
    departure: contract.departure,
    destination: contract.destination,
    kind: contract.kind,
    cost: contract.cost,
    payment_type: contract.payment_type,
    collateral: contract.collateral,
    title: contract.title,
    description: contract.description,
    timestamp: contract.timestamp.toISOString(),
    status: contract.status,
    expiration: contract.expiration.toISOString(),
  }
}
