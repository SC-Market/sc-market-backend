/**
 * Contract-related database operations.
 * This module contains all database queries specific to public contracts and contract offers.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import { DBPublicContract, DBContractOffer } from "./types.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get public contracts by where clause.
 */
export async function getPublicContract(
  where: Partial<DBPublicContract>,
): Promise<DBPublicContract[]> {
  return knex()<DBPublicContract>("public_contracts").where(where).select()
}

/**
 * Delete a public contract by where clause.
 */
export async function deletePublicContract(
  where: Partial<DBPublicContract>,
): Promise<DBPublicContract[]> {
  return knex()<DBPublicContract>("public_contracts")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Update a public contract by where clause.
 */
export async function updatePublicContract(
  where: Partial<DBPublicContract>,
  data: Partial<DBPublicContract>,
): Promise<DBPublicContract[]> {
  return knex()<DBPublicContract>("public_contracts")
    .where(where)
    .update(data)
    .returning("*")
}

/**
 * Insert a public contract or contracts.
 */
export async function insertPublicContract(
  data: Partial<DBPublicContract> | Partial<DBPublicContract>[],
) {
  return knex()<DBPublicContract>("public_contracts")
    .insert(data)
    .returning("*")
}

/**
 * Get contract offers by where clause.
 */
export async function getContractOffers(
  where: Partial<DBContractOffer>,
): Promise<DBContractOffer[]> {
  return knex()<DBContractOffer>("public_contract_offers").where(where).select()
}

/**
 * Delete contract offers by where clause.
 */
export async function deleteContractOffers(
  where: Partial<DBContractOffer>,
): Promise<DBContractOffer[]> {
  return knex()<DBContractOffer>("public_contract_offers")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Update contract offers by where clause.
 */
export async function updateContractOffers(
  where: Partial<DBContractOffer>,
  data: Partial<DBContractOffer>,
): Promise<DBContractOffer[]> {
  return knex()<DBContractOffer>("public_contract_offers")
    .where(where)
    .update(data)
    .returning("*")
}

/**
 * Insert contract offers.
 */
export async function insertContractOffers(
  data: Partial<DBContractOffer> | Partial<DBContractOffer>[],
) {
  return knex()<DBContractOffer>("public_contract_offers")
    .insert(data)
    .returning("*")
}
