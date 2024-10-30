import { DBPublicContract } from "./types.js"
import { database } from "../../../../clients/database/knex-db.js"

export async function serializePublicContract(contract: DBPublicContract) {
  const customer = await database.getMinimalUser({
    user_id: contract.customer_id,
  })

  return {
    customer,
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
    timestamp: contract.timestamp,
    status: contract.status,
    expiration: contract.expiration,
  }
}
