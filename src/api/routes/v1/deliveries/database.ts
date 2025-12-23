/**
 * Delivery-related database operations.
 * This module contains all database queries specific to deliveries.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import { DBDelivery } from "../../../../clients/database/db-models.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Create a new delivery.
 */
export async function createDelivery(data: any): Promise<void> {
  await knex()<DBDelivery>("deliveries").insert(data)
}

/**
 * Get deliveries by where clause.
 */
export async function getDeliveries(where: any): Promise<DBDelivery[]> {
  return knex()<DBDelivery>("deliveries").where(where).select()
}
